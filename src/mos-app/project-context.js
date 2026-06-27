/** Active project + per-workspace UI memory (project-first navigation). */
const KEY = "mercuryos-active-project-v1";

const DEFAULT = {
  activeWorkspaceId: "mercuryos",
  lastChatByWorkspace: {},
  filesPathByWorkspace: {},
  recentWorkspaceIds: ["mercuryos"],
  workspaces: [],
  defaultWorkspaceId: "mercuryos",
};

export function loadProjectContext() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (data && typeof data === "object") {
      return { ...DEFAULT, ...data };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

export function saveProjectContext(ctx) {
  localStorage.setItem(KEY, JSON.stringify(ctx));
}

export function setActiveWorkspace(ctx, workspaceId) {
  const id = String(workspaceId ?? "mercuryos");
  ctx.activeWorkspaceId = id;
  const recent = [id, ...(ctx.recentWorkspaceIds ?? []).filter((x) => x !== id)].slice(0, 8);
  ctx.recentWorkspaceIds = recent;
  saveProjectContext(ctx);
  return ctx;
}

/** Sync chat store deskWorkspaceId when user picks a project (phone + desk parity). */
export function syncDeskWorkspaceId(chatState, workspaceId, saveChatsFn) {
  if (!chatState) return;
  const id = String(workspaceId ?? "mercuryos");
  chatState.deskWorkspaceId = id;
  saveChatsFn?.(chatState);
}

/** After chat bootstrap / SSE merge — prefer synced deskWorkspaceId. @returns {boolean} changed */
export function hydrateActiveWorkspaceFromChatStore(ctx, chatState) {
  const ws = chatState?.deskWorkspaceId;
  if (!ws) {
    if (ctx.activeWorkspaceId) {
      chatState.deskWorkspaceId = resolveWorkspaceId(ctx, ctx.activeWorkspaceId);
    }
    return false;
  }
  const id = resolveWorkspaceId(ctx, ws);
  if (ctx.activeWorkspaceId !== id) {
    setActiveWorkspace(ctx, id);
    return true;
  }
  return false;
}

export function rememberChatForWorkspace(ctx, workspaceId, chatId) {
  if (!workspaceId || !chatId) return;
  ctx.lastChatByWorkspace = { ...ctx.lastChatByWorkspace, [workspaceId]: chatId };
  saveProjectContext(ctx);
}

export function lastChatForWorkspace(ctx, workspaceId) {
  return ctx.lastChatByWorkspace?.[workspaceId] ?? null;
}

export function filesPathForWorkspace(ctx, workspaceId) {
  return ctx.filesPathByWorkspace?.[workspaceId] ?? ".";
}

export function setFilesPathForWorkspace(ctx, workspaceId, path) {
  ctx.filesPathByWorkspace = { ...ctx.filesPathByWorkspace, [workspaceId]: path || "." };
  saveProjectContext(ctx);
}

export function setWorkspacesCache(ctx, { workspaces, defaultWorkspaceId } = {}) {
  if (workspaces) ctx.workspaces = workspaces;
  if (defaultWorkspaceId) ctx.defaultWorkspaceId = defaultWorkspaceId;
  saveProjectContext(ctx);
}

export function workspaceIds(ctx) {
  return new Set((ctx.workspaces ?? []).map((w) => w.id));
}

/** Gateway registry includes this id (or registry not loaded yet). */
export function isKnownWorkspace(ctx, workspaceId) {
  const id = String(workspaceId ?? "").trim();
  if (!id) return false;
  if (!ctx.workspaces?.length) {
    const def = ctx.defaultWorkspaceId ?? "mercuryos";
    return id === def || id === "mercuryos";
  }
  return workspaceIds(ctx).has(id);
}

/** Map stale phone-only project ids → gateway default (e.g. laptop project on VPS). */
export function resolveWorkspaceId(ctx, workspaceId) {
  const id = String(workspaceId ?? "").trim() || ctx.defaultWorkspaceId || "mercuryos";
  if (isKnownWorkspace(ctx, id)) return id;
  return ctx.defaultWorkspaceId ?? "mercuryos";
}

/** @returns {boolean} true if active project was reset */
export function ensureValidActiveWorkspace(ctx) {
  const def = resolveWorkspaceId(ctx, ctx.defaultWorkspaceId ?? "mercuryos");
  if (!isKnownWorkspace(ctx, ctx.activeWorkspaceId)) {
    ctx.activeWorkspaceId = def;
    saveProjectContext(ctx);
    return true;
  }
  return false;
}

/** Thread send: active chat wins over header project filter. */
export function syncActiveWorkspaceToChat(ctx, chat) {
  if (!chat) return;
  const ws = resolveWorkspaceId(ctx, chat.workspaceId ?? "mercuryos");
  if (chat.workspaceId !== ws) chat.workspaceId = ws;
  if (ctx.activeWorkspaceId !== ws) setActiveWorkspace(ctx, ws);
}

export function getWorkspace(ctx, workspaceId) {
  const id = workspaceId ?? ctx.activeWorkspaceId;
  return (ctx.workspaces ?? []).find((w) => w.id === id) ?? null;
}

export function getActiveWorkspace(ctx) {
  return getWorkspace(ctx, ctx.activeWorkspaceId) ?? {
    id: ctx.activeWorkspaceId ?? "mercuryos",
    label: "MercuryOS",
    path: "",
    pinned: true,
  };
}

export function workspaceActivity(chats) {
  const map = {};
  for (const c of chats ?? []) {
    const id = c.workspaceId ?? "mercuryos";
    if (!map[id]) map[id] = { streaming: 0, awaiting: 0, total: 0 };
    map[id].total++;
    if (c.status === "streaming") map[id].streaming++;
    if (c.status === "awaiting") map[id].awaiting++;
  }
  return map;
}

export function sortedWorkspaces(ctx) {
  const list = [...(ctx.workspaces ?? [])];
  const recent = ctx.recentWorkspaceIds ?? [];
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ai = recent.indexOf(a.id);
    const bi = recent.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.label.localeCompare(b.label);
  });
  return list;
}
