import { DESK_MODE } from "./desk-env.js";
import { flowStreamSig } from "../mos-shared/agent-flow.js";
import { idbGet, idbSet, idbRemove } from "./idb-kv.js";
import { migrateChatBlobsOffLocalStorage } from "./storage-evict.js";
import {
  ensureV5State,
  syncV5FromChat,
  syncChatsFromV5,
  migrateV4ToV5,
  CHAT_SCHEMA_VERSION,
} from "./store-v5-bridge.js";
import { createChatStateV5 } from "../mos-shared/chat-sdk-model.js";

const KEY = "mercuryos-chats-v5";
const KEY_V4 = "mercuryos-chats-v4";
const LEGACY_KEY = "mercuryos-chats-v3";
/** IndexedDB — no practical 5MB cap; keep slim pass for runaway tool HTML. */
const MAX_PERSIST_TOOL_OUT = 24_000;

let storageUserId = null;
let hydrated = false;
/** In-memory chat state after IndexedDB hydrate (avoids sync IDB reads). */
let memoryChats = null;

function chatsStorageKey() {
  return storageUserId ? `${KEY}-${storageUserId}` : KEY;
}

/** Scope local chat cache to a logged-in user (Dallas / Shara). */
export function setChatStorageScope(userId) {
  const next = userId || null;
  if (next === storageUserId) return;
  storageUserId = next;
  memoryChats = null;
  hydrated = false;
}

export function getChatStorageScope() {
  return storageUserId;
}

let saveTimer = null;
let pendingSaveState = null;
let pendingSaveOpts = { localOnly: false };
let serverPush = null;
let serverPushInFlight = false;
let pendingServerPushState = null;
/** Chat ids with legacy mutations not yet mirrored into v5 threads/runs. */
const v5DirtyChats = new Set();

export function markV5Dirty(chatId) {
  if (chatId) v5DirtyChats.add(chatId);
}

function flushV5Dirty(state) {
  if (!v5DirtyChats.size) return;
  for (const chatId of v5DirtyChats) {
    syncV5FromChat(state, chatId);
  }
  v5DirtyChats.clear();
}

function slimRunForPersist(run) {
  if (!run) return run;
  const { sdkMessages, ...rest } = run;
  if (rest.viewCache?.blocks?.length) {
    rest.viewCache = {
      ...rest.viewCache,
      blocks: rest.viewCache.blocks.map((b) => {
        if (b.type !== "tool" || !b.output) return b;
        const text = String(b.output);
        if (text.length <= MAX_PERSIST_TOOL_OUT) return b;
        return { ...b, output: `${text.slice(0, MAX_PERSIST_TOOL_OUT)}…` };
      }),
    };
  }
  return rest;
}

function slimForPersist(state) {
  if (!state) return state;
  ensureV5State(state);
  flushV5Dirty(state);
  return {
    schemaVersion: CHAT_SCHEMA_VERSION,
    activeId: state.activeId ?? null,
    deskWorkspaceId: state.deskWorkspaceId ?? "mercuryos",
    uiUpdatedAt: state.uiUpdatedAt ?? Date.now(),
    openAgentTabIds: Array.isArray(state.openAgentTabIds) ? state.openAgentTabIds : [],
    openSubagentTabs: Array.isArray(state.openSubagentTabs) ? state.openSubagentTabs : [],
    activeSubagentCallId: state.activeSubagentCallId ?? null,
    threads: state.threads ?? [],
    runs: Object.fromEntries(
      Object.entries(state.runs ?? {}).map(([id, run]) => [id, slimRunForPersist(run)])
    ),
  };
}

function flushSaveChats() {
  saveTimer = null;
  const state = pendingSaveState;
  const { localOnly } = pendingSaveOpts;
  pendingSaveOpts = { localOnly: false };
  if (!state) return;
  pendingSaveState = null;
  for (const chat of state.chats ?? []) {
    syncActiveBranchTail(chat);
  }

  const persist = () => {
    let slim = null;
    try {
      slim = slimForPersist(state);
      const json = JSON.stringify(slim);
      memoryChats = ensureV5State(JSON.parse(json));
      const key = chatsStorageKey();
      void idbSet(key, json).catch(() => {});
    } catch {
      /* keep in-memory state */
    }
    if (slim && serverPush && !localOnly && !anyChatLive(state)) {
      queueServerPush(slim);
    }
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(persist, { timeout: 900 });
  } else {
    setTimeout(persist, 0);
  }
}

function queueServerPush(slim) {
  pendingServerPushState = slim;
  if (serverPushInFlight) return;
  serverPushInFlight = true;
  void (async () => {
    try {
      while (pendingServerPushState) {
        const next = pendingServerPushState;
        pendingServerPushState = null;
        await serverPush(next).catch(() => {});
      }
    } finally {
      serverPushInFlight = false;
      if (pendingServerPushState) queueServerPush(pendingServerPushState);
    }
  })();
}

/** Load chat cache from IndexedDB (and migrate off localStorage). Call before loadChats on boot. */
export async function hydrateChatsFromStorage() {
  if (hydrated) return;
  hydrated = true;
  await migrateChatBlobsOffLocalStorage();
  const key = chatsStorageKey();
  try {
    const raw = await idbGet(key);
    if (raw && typeof raw === "string") {
      memoryChats = ensureV5State(JSON.parse(raw));
      return;
    }
  } catch {
    /* fall through */
  }
  if (storageUserId) {
    for (const legacyKey of [KEY, KEY_V4, LEGACY_KEY]) {
      try {
        const legacyRaw = await idbGet(legacyKey);
        if (legacyRaw && typeof legacyRaw === "string") {
          memoryChats = ensureV5State(JSON.parse(legacyRaw));
          void idbSet(key, JSON.stringify(slimForPersist(memoryChats))).catch(() => {});
          return;
        }
      } catch {
        /* try next */
      }
    }
  }
  if (!storageUserId) {
    try {
      const legacyV4 = await idbGet(KEY_V4);
      if (legacyV4 && typeof legacyV4 === "string") {
        memoryChats = ensureV5State(migrateV4ToV5(JSON.parse(legacyV4)));
        void idbSet(key, JSON.stringify(slimForPersist(memoryChats))).catch(() => {});
        return;
      }
      const legacy = await idbGet(KEY);
      if (legacy && typeof legacy === "string") {
        memoryChats = JSON.parse(legacy);
      }
    } catch {
      /* ignore */
    }
  }
}

/** Register gateway SQLite push (from chat-sync.js). */
export function setChatServerPush(fn) {
  serverPush = fn;
}

export function clearChatStorage() {
  const key = chatsStorageKey();
  try {
    void idbRemove(key).catch(() => {});
    if (!storageUserId) {
      void idbRemove(KEY).catch(() => {});
      void idbRemove(LEGACY_KEY).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  memoryChats = null;
  hydrated = false;
  pendingSaveState = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

function scheduleSaveChats(state, ms, opts = {}) {
  pendingSaveState = state;
  pendingSaveOpts = { localOnly: Boolean(opts.localOnly || anyChatLive(state)) };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaveChats, ms);
}

function anyChatLive(state) {
  return state?.chats?.some((c) => c.status === "streaming" || c.status === "awaiting");
}

function uid() {
  return `chat_${stableId()}`;
}

function stableId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function touchUiState(state) {
  state.uiUpdatedAt = Date.now();
}

const SESSION_ACTIVE_CHAT = "mercuryos-session-active-chat";

/** Per browser tab — survives reload; wins over remote activeId on merge. */
export function pinSessionActiveChat(chatId) {
  if (typeof sessionStorage === "undefined" || !chatId) return;
  try {
    sessionStorage.setItem(SESSION_ACTIVE_CHAT, String(chatId));
  } catch {
    /* ignore */
  }
}

export function readSessionActiveChat() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_ACTIVE_CHAT);
  } catch {
    return null;
  }
}

export function clearSessionActiveChat() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_ACTIVE_CHAT);
  } catch {
    /* ignore */
  }
}

/** After bootstrap/merge — restore focus only if that chat tab is still open. */
export function restoreSessionActiveChat(state) {
  const id = readSessionActiveChat();
  if (!id || !state?.chats?.some((c) => c.id === id)) return false;
  if (!(state.openAgentTabIds ?? []).includes(id)) {
    clearSessionActiveChat();
    return false;
  }
  state.activeId = id;
  touchUiState(state);
  return true;
}

/** Shallow immutable snapshot for React after in-place store mutations. */
export function bumpChatState(state, scope = "data") {
  if (!state) return state;
  if (scope === "ui") {
    return {
      ...state,
      schemaVersion: state.schemaVersion ?? CHAT_SCHEMA_VERSION,
      activeId: state.activeId ?? null,
      deskWorkspaceId: state.deskWorkspaceId ?? "mercuryos",
      uiUpdatedAt: state.uiUpdatedAt ?? Date.now(),
      openAgentTabIds: [...(state.openAgentTabIds ?? [])],
      openSubagentTabs: state.openSubagentTabs,
      activeSubagentCallId: state.activeSubagentCallId ?? null,
      chats: state.chats,
      threads: state.threads,
      runs: state.runs,
    };
  }
  return {
    ...state,
    schemaVersion: state.schemaVersion ?? CHAT_SCHEMA_VERSION,
    activeId: state.activeId ?? null,
    openAgentTabIds: [...(state.openAgentTabIds ?? [])],
    openSubagentTabs: state.openSubagentTabs ? [...state.openSubagentTabs] : state.openSubagentTabs,
    threads: state.threads ? [...state.threads] : state.threads,
    runs: state.runs ? { ...state.runs } : state.runs,
    chats: [...(state.chats ?? [])],
  };
}

function normalizeChat(c) {
  return {
    pinned: false,
    status: "idle",
    agentId: null,
    workspaceId: "mercuryos",
    messages: [],
    model: null,
    mode: null,
    composerDraft: "",
    pendingAttachments: [],
    ...c,
    workspaceId: c?.workspaceId ?? "mercuryos",
    composerDraft: c?.composerDraft ?? "",
  };
}

let composerDraftTimer = null;

export function normalizeAgentTabs(state) {
  if (!state?.chats) return;
  if (!Array.isArray(state.openAgentTabIds)) state.openAgentTabIds = [];
  const valid = new Set(state.chats.map((c) => c.id));
  state.openAgentTabIds = state.openAgentTabIds.filter((id) => valid.has(id));
  if (state.activeId && !valid.has(state.activeId)) {
    state.activeId = state.openAgentTabIds.at(-1) ?? null;
  }
  if (
    state.activeId &&
    state.openAgentTabIds.length &&
    !state.openAgentTabIds.includes(state.activeId)
  ) {
    state.activeId = state.openAgentTabIds.at(-1) ?? null;
    if (state.activeId) pinSessionActiveChat(state.activeId);
    else clearSessionActiveChat();
  }
}

export function ensureAgentTabOpen(state, id) {
  if (!id) return;
  if (!Array.isArray(state.openAgentTabIds)) state.openAgentTabIds = [];
  if (!state.openAgentTabIds.includes(id)) state.openAgentTabIds.push(id);
}

export function closeAgentTab(state, id) {
  if (!id) return;
  if (!Array.isArray(state.openAgentTabIds)) state.openAgentTabIds = [];
  state.openAgentTabIds = state.openAgentTabIds.filter((x) => x !== id);
  if (state.activeId === id) {
    state.activeId = state.openAgentTabIds.at(-1) ?? null;
  }
  if (readSessionActiveChat() === id) {
    if (state.activeId) pinSessionActiveChat(state.activeId);
    else clearSessionActiveChat();
  }
  touchUiState(state);
  scheduleSaveChats(state, 400);
}

export function openAgentTabs(state) {
  normalizeAgentTabs(state);
  const ids = Array.isArray(state.openAgentTabIds) ? state.openAgentTabIds : [];
  return ids.map((id) => state.chats.find((c) => c.id === id)).filter(Boolean);
}

export function setComposerDraft(state, chatId, text) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  const clipped = String(text ?? "");
  const next = clipped.length > 8000 ? clipped.slice(0, 8000) : clipped;
  if (chat.composerDraft === next) return;
  chat.composerDraft = next;
  if (composerDraftTimer) clearTimeout(composerDraftTimer);
  composerDraftTimer = setTimeout(() => saveChats(state), 350);
}

export function clearComposerDraft(state, chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  if (composerDraftTimer) {
    clearTimeout(composerDraftTimer);
    composerDraftTimer = null;
  }
  if (!chat.composerDraft) return;
  chat.composerDraft = "";
  touchUiState(state);
  saveChats(state, { immediate: true });
}

export function setDeskWorkspace(state, workspaceId) {
  if (!state) return;
  state.deskWorkspaceId = String(workspaceId ?? "mercuryos");
  saveChats(state);
}

function migrateLegacyFromObject(data) {
  if (!data?.chats?.length) return null;
  data.chats = data.chats.map((c) => normalizeChat({ ...c, workspaceId: "mercuryos" }));
  return data;
}

function parseLoadedChats(data, { loadedFromLegacyKey = false } = {}) {
  if (!data) return null;
  const v5 = ensureV5State(data);
  if (!v5?.chats?.length && !v5?.threads?.length) return null;
  if (!Array.isArray(v5.openAgentTabIds)) v5.openAgentTabIds = [];
  normalizeAgentTabs(v5);
  for (const chat of v5.chats ?? []) {
    if (chat.status === "streaming" || chat.status === "awaiting") {
      chat.status = "idle";
      for (const m of chat.messages ?? []) {
        if (m.role === "assistant" && m.streaming) m.streaming = false;
      }
    }
  }
  const out = stripHeavyMessages(v5);
  memoryChats = out;
  if (loadedFromLegacyKey && storageUserId) {
    void idbSet(chatsStorageKey(), JSON.stringify(slimForPersist(out))).catch(() => {});
  }
  return out;
}

export function loadChats() {
  if (memoryChats) {
    const copy = ensureV5State(JSON.parse(JSON.stringify(memoryChats)));
    return stripHeavyMessages(copy);
  }

  const storageKey = chatsStorageKey();
  let raw = null;
  let loadedFromLegacyKey = false;
  try {
    raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (!raw && storageUserId) {
      raw = localStorage.getItem(KEY);
      if (raw) loadedFromLegacyKey = true;
    }
    if (!raw) {
      raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY_V4) : null;
      if (raw) loadedFromLegacyKey = true;
    }
    if (raw) {
      const parsed = parseLoadedChats(JSON.parse(raw), { loadedFromLegacyKey });
      if (parsed) {
        void migrateChatBlobsOffLocalStorage();
        return parsed;
      }
    }
    if (!storageUserId) {
      const legacyRaw = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_KEY) : null;
      if (legacyRaw) {
        const migrated = migrateLegacyFromObject(JSON.parse(legacyRaw));
        if (migrated) {
          const parsed = parseLoadedChats(migrated);
          if (parsed) {
            void idbSet(KEY, JSON.stringify(parsed)).catch(() => {});
            return parsed;
          }
        }
      }
    }
  } catch {
    /* fall through to blank chat */
  }
  const id = uid();
  const blank = createChatStateV5({
    activeId: id,
    deskWorkspaceId: "mercuryos",
    openAgentTabIds: [id],
    threads: [
      {
        id,
        title: "New chat",
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentId: null,
        workspaceId: "mercuryos",
        model: null,
        mode: null,
        composerDraft: "",
        pendingAttachments: [],
        runIds: [],
        lastRunId: null,
        status: "idle",
      },
    ],
    runs: {},
  });
  syncChatsFromV5(blank);
  memoryChats = blank;
  return blank;
}

function stripHeavyMessages(data) {
  if (!data?.chats) return data;
  for (const chat of data.chats) {
    for (const m of chat.messages ?? []) {
      if (m.flowHtml && String(m.flowHtml).length > 500_000) {
        m.flowHtml = `${String(m.flowHtml).slice(0, 500_000)}<!-- truncated -->`;
      }
      if (m.flowHtml || !DESK_MODE) continue;
      if (Array.isArray(m.blocks)) {
        m.blocks = m.blocks.map((b) => {
          if (b.type !== "tool" || !b.output) return b;
          const text = String(b.output);
          if (text.length <= 8000) return b;
          return { ...b, output: `${text.slice(0, 8000)}…` };
        });
      }
      if (String(m.content ?? "").length > 120_000) {
        m.content = `${String(m.content).slice(0, 120_000)}…`;
      }
    }
  }
  return data;
}

export function saveChats(state, { immediate = false, localOnly = false } = {}) {
  pendingSaveOpts = { localOnly: Boolean(localOnly || anyChatLive(state)) };
  if (immediate) {
    pendingSaveState = state;
    flushSaveChats();
    return;
  }
  scheduleSaveChats(state, anyChatLive(state) ? 400 : 250, { localOnly });
}

/** Force pending debounced save to disk + gateway now. */
export function flushChatsNow(state) {
  if (state) pendingSaveState = state;
  pendingSaveOpts = { localOnly: false };
  if (saveTimer) clearTimeout(saveTimer);
  flushSaveChats();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pendingSaveState) flushSaveChats();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendingSaveState) flushSaveChats();
  });
  window.addEventListener("pagehide", () => {
    if (pendingSaveState) flushSaveChats();
  });
}

export function getActiveChat(state) {
  if (!state.activeId) return null;
  return state.chats.find((c) => c.id === state.activeId) ?? null;
}

export function clearActiveChat(state) {
  state.activeId = null;
  saveChats(state);
}

export function sortedChats(state, query = "", workspaceId = null) {
  const q = query.trim().toLowerCase();
  let list = [...state.chats];
  if (workspaceId) {
    list = list.filter((c) => (c.workspaceId ?? "mercuryos") === workspaceId);
  }
  if (q) {
    list = list.filter((c) => {
      const inTitle = c.title.toLowerCase().includes(q);
      const inMsg = c.messages.some((m) => String(m.content).toLowerCase().includes(q));
      return inTitle || inMsg;
    });
  }
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return list;
}

export function createChat(state, workspaceId = "mercuryos") {
  const ws = workspaceId ?? "mercuryos";
  const chat = normalizeChat({
    id: uid(),
    title: "New chat",
    updatedAt: Date.now(),
    workspaceId: ws,
  });
  state.chats = [chat, ...state.chats];
  state.activeId = chat.id;
  ensureAgentTabOpen(state, chat.id);
  pinSessionActiveChat(chat.id);
  touchUiState(state);
  markV5Dirty(chat.id);
  syncV5FromChat(state, chat.id);
  scheduleSaveChats(state, 300);
  return chat;
}

export function importSession(state, agentId, title, workspaceId = "mercuryos") {
  const chat = normalizeChat({
    id: uid(),
    title: String(title ?? "Desktop session").slice(0, 60),
    agentId: agentId ?? null,
    workspaceId,
    updatedAt: Date.now(),
  });
  state.chats = [chat, ...state.chats];
  state.activeId = chat.id;
  ensureAgentTabOpen(state, chat.id);
  pinSessionActiveChat(chat.id);
  touchUiState(state);
  markV5Dirty(chat.id);
  syncV5FromChat(state, chat.id);
  scheduleSaveChats(state, 300);
  return chat;
}

export function deleteChat(state, id, workspaceId = "mercuryos") {
  const deleted = state.chats.find((c) => c.id === id);
  const ws = workspaceId ?? deleted?.workspaceId ?? "mercuryos";
  state.chats = state.chats.filter((c) => c.id !== id);
  if (Array.isArray(state.openAgentTabIds)) {
    state.openAgentTabIds = state.openAgentTabIds.filter((tabId) => tabId !== id);
  }
  const projectChats = state.chats.filter((c) => (c.workspaceId ?? "mercuryos") === ws);
  if (!state.chats.length) {
    const c = createChat(state, ws);
    state.activeId = c.id;
  } else if (state.activeId === id) {
    state.activeId = projectChats[0]?.id ?? state.chats[0].id;
  }
  saveChats(state);
}

export function setActiveChat(state, id) {
  state.activeId = id;
  ensureAgentTabOpen(state, id);
  pinSessionActiveChat(id);
  touchUiState(state);
  scheduleSaveChats(state, 500);
}

export function togglePin(state, id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  chat.pinned = !chat.pinned;
  chat.updatedAt = Date.now();
  saveChats(state);
}

export function addMessage(state, chatId, msg) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  chat.messages.push({ ...msg, id: msg.id ?? `m_${stableId()}`, at: msg.at ?? Date.now() });
  if (msg.role === "user" && chat.title === "New chat") {
    chat.title = msg.content.slice(0, 40) + (msg.content.length > 40 ? "…" : "");
  }
  chat.updatedAt = Date.now();
  markV5Dirty(chatId);
  if (msg.role === "user" && state.schemaVersion === CHAT_SCHEMA_VERSION) {
    syncV5FromChat(state, chatId);
  }
  if (msg.role === "user") {
    scheduleSaveChats(state, 350);
  } else if (!anyChatLive(state)) {
    saveChats(state);
  } else {
    scheduleSaveChats(state, 500);
  }
}

function contentFromBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return "";
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n")
    .trim();
}

export function updateLastAssistant(state, chatId, content, streaming = false, blocks = null, { persist = true, allowIdle = false, caller = "", flowSig = null, showPlanning = false, runId = null } = {}) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return null;
  if (!allowIdle && (chat.status === "streaming" || chat.status === "awaiting") && !streaming) {
    streaming = true;
  }
  if (Array.isArray(blocks) && blocks.length) {
    const fromBlocks = contentFromBlocks(blocks);
    if (fromBlocks.length > String(content ?? "").trim().length) {
      content = fromBlocks;
    }
  }
  const last = chat.messages[chat.messages.length - 1];
  const upsert =
    last?.role === "assistant" &&
    (last.streaming ||
      streaming ||
      (Array.isArray(blocks) && blocks.length > 0));
  if (upsert) {
    if (streaming && blocks != null) {
      last.content = content;
      last.streaming = streaming;
      last.blocks = blocks;
      last.flowSig = flowSig ?? flowStreamSig(blocks);
      delete last.flowHtml;
      if (flowSig != null || blocks != null) {
        last.showPlanning = Boolean(showPlanning);
      }
      if (runId) last.runId = runId;
    } else {
      const next = { ...last, content, streaming };
      if (blocks != null) {
        next.blocks = blocks;
        next.flowSig = flowSig ?? flowStreamSig(blocks);
        delete next.flowHtml;
      }
      if (flowSig != null) {
        next.flowSig = flowSig;
      }
      if (flowSig != null || blocks != null) {
        next.showPlanning = Boolean(showPlanning);
      }
      chat.messages = [...chat.messages.slice(0, -1), next];
      if (runId) {
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg?.role === "assistant") lastMsg.runId = runId;
      }
    }
  } else {
    const sig = flowSig ?? (blocks?.length ? flowStreamSig(blocks) : undefined);
    chat.messages.push({
      id: `m_${Date.now()}`,
      role: "assistant",
      content,
      blocks: blocks ?? undefined,
      flowSig: sig,
      showPlanning: showPlanning || undefined,
      streaming,
      at: Date.now(),
      runId: runId ?? undefined,
    });
  }
  if (runId && !(upsert && streaming && blocks != null)) {
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg?.role === "assistant") lastMsg.runId = runId;
  }
  if (!streaming) {
    markV5Dirty(chatId);
    syncV5FromChat(state, chatId);
  }
  chat.updatedAt = Date.now();
  if (persist) {
    if (!streaming) saveChats(state, { immediate: allowIdle });
    else scheduleSaveChats(state, 500);
  }
  return chat.messages[chat.messages.length - 1];
}

export function markMessageSent(state, chatId, messageId) {
  const chat = state.chats.find((c) => c.id === chatId);
  const msg = chat?.messages.find((m) => m.id === messageId);
  if (msg) {
    msg.queued = false;
    saveChats(state);
  }
}

export function setChatStatus(state, chatId, status, agentId, { persist = true } = {}) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  const sameStatus = chat.status === status;
  const sameAgent = !agentId || chat.agentId === agentId;
  if (sameStatus && sameAgent) return;
  chat.status = status;
  if (agentId) chat.agentId = agentId;
  chat.updatedAt = Date.now();
  if (persist) saveChats(state);
}

export function renameChat(state, id, title) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  const t = String(title ?? "").trim();
  if (!t) return;
  chat.title = t.slice(0, 60);
  chat.updatedAt = Date.now();
  saveChats(state);
}

export function clearAgent(state, chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  chat.agentId = null;
  saveChats(state);
}

function awaitingPreview(chat) {
  const last = chat.messages[chat.messages.length - 1];
  const blocks = last?.role === "assistant" ? last.blocks : null;
  const q = blocks?.find((b) => b.type === "question" && b.status !== "answered");
  if (q?.questions?.[0]?.prompt) {
    return `Needs answer: ${String(q.questions[0].prompt).slice(0, 72)}`;
  }
  const plan = blocks?.find((b) => b.type === "plan" && b.status !== "executed");
  if (plan?.title) return `Plan ready: ${String(plan.title).slice(0, 72)}`;
  return "Waiting for your input";
}

export function lastPreview(chat) {
  if (chat.status === "streaming") return "Agent is working…";
  if (chat.status === "awaiting") return awaitingPreview(chat);
  const last = chat.messages[chat.messages.length - 1];
  if (!last) return "Tap to start";
  if (last.role === "user") return `You: ${String(last.content).slice(0, 80)}`;
  return String(last.content).slice(0, 80);
}

function cloneMessages(msgs) {
  return JSON.parse(JSON.stringify(msgs ?? []));
}

/** Persist current tail into active branch slot (latest branched user message). */
export function syncActiveBranchTail(chat) {
  if (!chat?.messages?.length) return;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    if (m.role !== "user" || !m.branchTails?.length) continue;
    const active = typeof m.activeBranch === "number" ? m.activeBranch : 0;
    const tail = cloneMessages(chat.messages.slice(i + 1));
    if (m.branchTails[active]) m.branchTails[active].messages = tail;
    return;
  }
}

/** Save current variation and open a new branch before resubmit. */
export function beginResubmitBranch(chat, anchorIdx) {
  const anchor = chat.messages[anchorIdx];
  if (!anchor || anchor.role !== "user") return;
  if (!anchor.branchTails) anchor.branchTails = [];
  const tail = cloneMessages(chat.messages.slice(anchorIdx + 1));
  const active = typeof anchor.activeBranch === "number" ? anchor.activeBranch : 0;

  if (!anchor.branchTails.length && tail.length) {
    anchor.branchTails.push({
      id: `br_${Date.now()}_0`,
      messages: tail,
      createdAt: Date.now(),
    });
  } else if (anchor.branchTails[active]) {
    anchor.branchTails[active].messages = tail;
  } else if (tail.length) {
    anchor.branchTails.push({
      id: `br_${Date.now()}_${anchor.branchTails.length}`,
      messages: tail,
      createdAt: Date.now(),
    });
  }

  anchor.branchTails.push({
    id: `br_${Date.now()}_new`,
    messages: [],
    createdAt: Date.now(),
  });
  anchor.activeBranch = anchor.branchTails.length - 1;
}

/** Switch variation tail shown after a user message. */
export function switchMessageBranch(chat, anchorMessageId, branchIndex) {
  const anchorIdx = chat.messages.findIndex((m) => m.id === anchorMessageId);
  if (anchorIdx < 0) return false;
  const anchor = chat.messages[anchorIdx];
  if (!anchor?.branchTails?.length) return false;

  const idx = Math.max(0, Math.min(branchIndex, anchor.branchTails.length - 1));
  const active = typeof anchor.activeBranch === "number" ? anchor.activeBranch : 0;
  if (active === idx) return true;

  const currentTail = cloneMessages(chat.messages.slice(anchorIdx + 1));
  if (anchor.branchTails[active]) anchor.branchTails[active].messages = currentTail;

  anchor.activeBranch = idx;
  const loaded = cloneMessages(anchor.branchTails[idx]?.messages ?? []);
  chat.messages = [...chat.messages.slice(0, anchorIdx + 1), ...loaded];
  chat.updatedAt = Date.now();
  return true;
}
