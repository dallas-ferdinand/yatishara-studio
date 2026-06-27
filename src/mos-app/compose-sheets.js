/** Attach picker, per-chat agent sheet, theme sheet, attachment chips. */
import * as api from "./api.js";
import { icon } from "./icons.js";
import { wireAppearanceSettings } from "./theme.js";
import {
  setChatAgentPrefs,
  clearChatAgentPrefs,
  runOptsForChat,
  chatAgentSummary,
  agentModeIcon,
  fillModelSelect,
  addPendingAttachment,
  removePendingAttachment,
} from "./chat-prefs.js";
import { loadLocalPrefs } from "./agent-prefs.js";
import * as agentPrefs from "./agent-prefs.js";
import { modelChoiceLabel, isAutoModel, AUTO_MODEL, normalizeModelChoice } from "./model-choice.js";
import * as store from "./store.js";

/** @type {null | object} */
let ctx = null;
let pickKind = "document";
let refTimer = null;

const PICK_ACCEPT = {
  image: "image/*",
  document: ".pdf,.txt,.md,.doc,.docx,.json,.csv,.xls,.xlsx,application/pdf,text/*",
  audio: "audio/*",
  video: "video/*",
};

export function wireComposeSheets(appCtx) {
  ctx = appCtx;

  document.querySelectorAll(".header-new-chat").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx?.haptic?.tap?.();
      ctx?.sound?.tap?.();
      ctx?.newChat?.(true);
    });
  });

  document.querySelectorAll(".header-theme").forEach((btn) => {
    btn.addEventListener("click", () => openThemeSheet());
  });

  document.querySelectorAll(".header-lock").forEach((btn) => {
    btn.addEventListener("click", () => ctx?.lockApp?.());
  });

  document.querySelector("#chat-agent-btn")?.addEventListener("click", () => {
    ctx?.haptic?.tap?.();
    openChatAgentSheet();
  });

  document.querySelector("#attach-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    ctx?.haptic?.tap?.();
    openAttachSheet();
  });

  document.querySelector("#theme-sheet-close")?.addEventListener("click", closeThemeSheet);
  document.querySelector(".theme-backdrop")?.addEventListener("click", closeThemeSheet);

  document.querySelector("#attach-sheet-close")?.addEventListener("click", closeAttachSheet);
  document.querySelector(".attach-backdrop")?.addEventListener("click", closeAttachSheet);

  document.querySelector("#chat-agent-close")?.addEventListener("click", closeChatAgentSheet);
  document.querySelector(".chat-agent-backdrop")?.addEventListener("click", closeChatAgentSheet);

  document.querySelector("#chat-agent-reset")?.addEventListener("click", () => {
    const chatId = ctx?.getActiveChatId?.();
    if (!chatId) return;
    clearChatAgentPrefs(ctx.chatState, chatId);
    store.saveChats(ctx.chatState);
    populateChatAgentSheet();
    ctx?.updateChatAgentBtn?.();
  });

  document.querySelectorAll("#chat-agent-mode-seg .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      const chatId = ctx?.getActiveChatId?.();
      if (!chatId || !mode) return;
      setChatAgentPrefs(ctx.chatState, chatId, { mode });
      store.saveChats(ctx.chatState);
      syncChatModeSeg(mode);
      ctx?.updateChatAgentBtn?.();
    });
  });

  document.querySelector("#chat-agent-model")?.addEventListener("change", async (e) => {
    const chatId = ctx?.getActiveChatId?.();
    if (!chatId) return;
    const model = normalizeModelChoice(e.target.value);
    setChatAgentPrefs(ctx.chatState, chatId, { model });
    if (isAutoModel(model)) {
      await agentPrefs.updatePrefs({ model: AUTO_MODEL, modelParams: [] });
    }
    store.saveChats(ctx.chatState);
    ctx?.updateChatAgentBtn?.();
  });

  document.querySelectorAll(".attach-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchAttachTab(tab.dataset.tab));
  });

  document.querySelectorAll(".attach-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      pickKind = btn.dataset.pick ?? "document";
      triggerFilePick(pickKind);
    });
  });

  document.querySelector("#attach-ref-search")?.addEventListener("input", (e) => {
    clearTimeout(refTimer);
    refTimer = setTimeout(() => searchRefs(e.target.value), 200);
  });

  document.querySelector("#attach-file-input")?.addEventListener("change", onFilePicked);

  wireAppearanceSettings();
  paintHeaderIcons();
}

function paintHeaderIcons() {
  document.querySelectorAll(".header-new-chat").forEach((el) => {
    el.innerHTML = icon("plus", 18);
  });
  document.querySelectorAll(".header-theme").forEach((el) => {
    el.innerHTML = icon("palette", 18);
  });
  document.querySelectorAll(".header-lock").forEach((el) => {
    el.innerHTML = icon("lock", 18);
  });
  updateChatAgentBtn();
  document.querySelector("#attach-sheet-close")?.replaceChildren();
  const closeBtn = document.querySelector("#attach-sheet-close");
  if (closeBtn) closeBtn.innerHTML = icon("x", 18);
  document.querySelectorAll(".attach-type-icon[data-i]").forEach((el) => {
    el.innerHTML = icon(el.dataset.i, 22);
  });
}

export function openThemeSheet() {
  ctx?.haptic?.tap?.();
  document.querySelector("#theme-sheet")?.classList.remove("hidden");
}

function closeThemeSheet() {
  document.querySelector("#theme-sheet")?.classList.add("hidden");
}

export function openAttachSheet() {
  document.querySelector("#attach-sheet")?.classList.remove("hidden");
  switchAttachTab("files");
  searchRefs("");
}

function closeAttachSheet() {
  document.querySelector("#attach-sheet")?.classList.add("hidden");
}

function switchAttachTab(tab) {
  document.querySelectorAll(".attach-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  document.querySelector("#attach-tab-files")?.classList.toggle("hidden", tab !== "files");
  document.querySelector("#attach-tab-refs")?.classList.toggle("hidden", tab !== "refs");
  if (tab === "refs") searchRefs(document.querySelector("#attach-ref-search")?.value ?? "");
}

function triggerFilePick(kind) {
  const input = document.querySelector("#attach-file-input");
  if (!input) return;
  input.accept = PICK_ACCEPT[kind] ?? PICK_ACCEPT.document;
  input.click();
}

async function onFilePicked() {
  const input = document.querySelector("#attach-file-input");
  const file = input?.files?.[0];
  input.value = "";
  if (!file) return;
  const chatId = ctx?.getActiveChatId?.();
  if (!chatId) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const uploaded = await api.uploadFile(dataUrl, file.name, file.type || "application/octet-stream");
    if (!uploaded.ok) throw new Error(uploaded.error ?? "Upload failed");
    const isImage = (file.type || "").startsWith("image/");
    const previewUrl = isImage && uploaded.stored ? api.uploadRawUrl(uploaded.stored) : null;
    addPendingAttachment(ctx.chatState, chatId, {
      kind: isImage ? "image" : "file",
      filename: uploaded.filename,
      stored: uploaded.stored,
      path: uploaded.path,
      size: uploaded.size,
      previewUrl,
      label: file.name,
    });
    store.saveChats(ctx.chatState);
    renderAttachChips(chatId);
    closeAttachSheet();
    ctx?.focusInput?.();
  } catch (err) {
    ctx?.toast?.("Attach", err.message ?? "Upload failed");
  }
}

async function searchRefs(q) {
  const list = document.querySelector("#attach-ref-list");
  if (!list) return;
  list.innerHTML = `<p class="sheet-hint">Searching…</p>`;
  try {
    const workspaceId = ctx?.getActiveWorkspaceId?.() ?? "mercuryos";
    const items = await api.searchRefs(q, 40, workspaceId);
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = `<p class="sheet-hint">No matches</p>`;
      return;
    }
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-list-item";
      btn.innerHTML = `
        <span class="sheet-list-title">${esc(item.name)}</span>
        <span class="sheet-list-meta">${esc(item.kind)} · ${esc(item.path)}</span>
      `;
      btn.addEventListener("click", () => {
        const chatId = ctx?.getActiveChatId?.();
        if (!chatId) return;
        addPendingAttachment(ctx.chatState, chatId, {
          kind: "ref",
          path: item.path,
          filename: item.name,
          label: item.name,
        });
        store.saveChats(ctx.chatState);
        renderAttachChips(chatId);
        closeAttachSheet();
        ctx?.focusInput?.();
      });
      list.appendChild(btn);
    }
  } catch (err) {
    list.innerHTML = `<p class="sheet-hint">${esc(err.message ?? "Search failed")}</p>`;
  }
}

export async function openChatAgentSheet() {
  await populateChatAgentSheet();
  document.querySelector("#chat-agent-sheet")?.classList.remove("hidden");
}

function closeChatAgentSheet() {
  document.querySelector("#chat-agent-sheet")?.classList.add("hidden");
}

async function populateChatAgentSheet() {
  const chat = store.getActiveChat(ctx.chatState);
  const opts = runOptsForChat(chat);
  syncChatModeSeg(opts.mode);
  const modelEl = document.querySelector("#chat-agent-model");
  if (modelEl) {
    try {
      const models = await api.fetchModels();
      fillModelSelect(modelEl, models, opts.model);
    } catch {
      fillModelSelect(modelEl, [], opts.model ?? "auto");
    }
  }
  const pill = document.querySelector("#chat-agent-status-pill");
  if (pill) pill.textContent = chatAgentSummary(chat).dockLabel;
  const sub = document.querySelector("#chat-agent-sheet-sub");
  if (sub) {
    const global = loadLocalPrefs();
    sub.textContent = chatAgentSummary(chat).isCustom
      ? "Overrides global defaults for this chat."
      : `Using global · ${global.mode ?? "agent"} · ${modelChoiceLabel(global.model)}`;
  }
}

function syncChatModeSeg(mode) {
  document.querySelectorAll("#chat-agent-mode-seg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

export function renderAttachChips(chatId) {
  const wrap = document.querySelector("#attach-chips");
  if (!wrap) return;
  const chat = ctx?.chatState?.chats?.find((c) => c.id === chatId);
  const items = chat?.pendingAttachments ?? [];
  if (!items.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = items
    .map((a) => {
      const thumb =
        a.kind === "image" && a.previewUrl
          ? `<img class="attach-chip-img" src="${escAttr(a.previewUrl)}" alt="" />`
          : `<span class="attach-chip-icon">${icon(a.kind === "ref" ? "fileText" : "paperclip", 14)}</span>`;
      return `<span class="attach-chip" data-id="${escAttr(a.id)}">${thumb}<span class="attach-chip-label">${esc(a.label ?? a.filename ?? a.path)}</span><button type="button" class="attach-chip-x" aria-label="Remove">×</button></span>`;
    })
    .join("");
  wrap.querySelectorAll(".attach-chip-x").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".attach-chip")?.dataset?.id;
      if (!id) return;
      removePendingAttachment(ctx.chatState, chatId, id);
      store.saveChats(ctx.chatState);
      renderAttachChips(chatId);
    });
  });
}

export function updateChatAgentBtnLabel() {
  updateChatAgentBtn();
}

export function updateChatAgentBtn() {
  const btn = document.querySelector("#chat-agent-btn");
  const iconEl = btn?.querySelector(".dock-agent-icon");
  const chat = store.getActiveChat(ctx?.chatState ?? { chats: [] });
  const { dockLabel, isCustom, mode } = chatAgentSummary(chat);
  if (iconEl) iconEl.innerHTML = icon(agentModeIcon(mode), 20);
  if (btn) {
    btn.title = isCustom ? `${dockLabel} (this chat)` : `${dockLabel} · tap to customize`;
    btn.setAttribute("aria-label", dockLabel);
    btn.classList.toggle("has-custom-prefs", isCustom);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

export { paintHeaderIcons };
