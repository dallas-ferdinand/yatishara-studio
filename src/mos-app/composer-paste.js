/** Paste clipboard text/images into composer as context attachments (Cursor-style). */
import * as api from "./api.js";
import { addPendingAttachment } from "./chat-prefs.js";
import * as store from "./store.js";

/** Auto-attach on paste when multiline or at least this many chars. */
export const PASTE_AUTO_ATTACH_MIN = 80;

export function contextLabel(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "Pasted context";
  const first = trimmed.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  if (!first) return "Pasted context";
  const short = first.length > 48 ? `${first.slice(0, 45)}…` : first;
  const lines = trimmed.split(/\r?\n/).length;
  if (lines > 1) return `${short} · ${lines} lines`;
  return `${short} · ${trimmed.length} chars`;
}

export function shouldAutoAttachPaste(text) {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  if (/\r?\n/.test(t)) return true;
  return t.length >= PASTE_AUTO_ATTACH_MIN;
}

export function looksLikeWorkspaceRef(line) {
  const t = String(line ?? "").trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  return /^\.?\/?[\w][\w./-]*\.\w{1,12}$/.test(t);
}

export function terminalContextLabel(text) {
  const base = contextLabel(text);
  return base.startsWith("Pasted context") ? "Terminal output" : `Terminal · ${base}`;
}

export function editorContextLabel(text, filePath) {
  const base = contextLabel(text);
  if (filePath) {
    const name = String(filePath).split("/").filter(Boolean).pop() ?? filePath;
    return `Editor · ${name} · ${base}`;
  }
  return base.startsWith("Pasted context") ? "Editor selection" : `Editor · ${base}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export async function buildImageAttachment(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const uploaded = await api.uploadFile(dataUrl, file.name || "paste.png", file.type || "image/png");
  if (!uploaded.ok) throw new Error(uploaded.error ?? "Upload failed");
  const previewUrl = uploaded.stored ? api.uploadRawUrl(uploaded.stored) : null;
  return {
    kind: "image",
    filename: uploaded.filename,
    stored: uploaded.stored,
    path: uploaded.path,
    size: uploaded.size,
    previewUrl,
    label: file.name || "Pasted image",
  };
}

export function buildTextContextAttachment(text, label = null) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  return {
    kind: "context",
    text: trimmed,
    label: label ?? contextLabel(trimmed),
  };
}

export function attachTextContext(chatState, chatId, text, { force = false, onInline } = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  if (!force && !shouldAutoAttachPaste(trimmed)) return false;
  const att = buildTextContextAttachment(trimmed);
  if (!att) return false;
  if (onInline) {
    onInline(att);
    return true;
  }
  addPendingAttachment(chatState, chatId, att);
  store.saveChats(chatState);
  return true;
}

export async function attachImageFile(chatState, chatId, file, { onInline } = {}) {
  const att = await buildImageAttachment(file);
  if (onInline) {
    onInline(att);
    return att;
  }
  addPendingAttachment(chatState, chatId, att);
  store.saveChats(chatState);
  return att;
}

function clipboardImageFile(clipboardData) {
  if (!clipboardData) return null;
  const fromFiles = [...(clipboardData.files ?? [])].find((f) => f.type?.startsWith("image/"));
  if (fromFiles) return fromFiles;
  for (const item of clipboardData.items ?? []) {
    if (item.kind === "file" && item.type?.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

function composerPlainText(el) {
  if (!el) return "";
  if (el.tagName === "TEXTAREA") return el.value ?? "";
  return el.innerText ?? "";
}

export function wireComposerPaste(inputEl, ctx) {
  if (!inputEl) return;
  if (inputEl._composerPasteHandler) {
    inputEl.removeEventListener("paste", inputEl._composerPasteHandler);
  }

  const handler = async (e) => {
    const chatId = ctx.getActiveChatId?.();
    if (!chatId) return;

    const cd = e.clipboardData;
    const imageFile = clipboardImageFile(cd);
    if (imageFile) {
      e.preventDefault();
      try {
        await attachImageFile(ctx.chatState, chatId, imageFile, {
          onInline: ctx.onInlineAttach,
        });
        ctx.onAttach?.(chatId);
        ctx.haptic?.tap?.();
      } catch (err) {
        ctx.toast?.("Paste", err.message ?? "Image paste failed");
      }
      return;
    }

    const text = cd?.getData("text/plain") ?? "";
    if (!text.trim()) return;

    // Empty composer — insert into the field; don't auto-attach as context chip.
    if (!String(composerPlainText(inputEl)).trim()) {
      return;
    }

    if (looksLikeWorkspaceRef(text.trim()) && !/\r?\n/.test(text)) {
      e.preventDefault();
      const path = text.trim().replace(/^\.\//, "");
      const att = {
        kind: "ref",
        path,
        filename: path.split("/").pop(),
        label: path.split("/").pop(),
      };
      if (ctx.onInlineAttach) {
        ctx.onInlineAttach(att);
      } else {
        addPendingAttachment(ctx.chatState, chatId, att);
        store.saveChats(ctx.chatState);
      }
      ctx.onAttach?.(chatId);
      ctx.haptic?.tap?.();
      return;
    }

    if (shouldAutoAttachPaste(text)) {
      e.preventDefault();
      attachTextContext(ctx.chatState, chatId, text, { onInline: ctx.onInlineAttach });
      ctx.onAttach?.(chatId);
      ctx.haptic?.tap?.();
    }
  };

  inputEl._composerPasteHandler = handler;
  inputEl.addEventListener("paste", handler);
}

export async function pasteContextFromClipboard(ctx) {
  const chatId = ctx.getActiveChatId?.();
  if (!chatId) return { ok: false, error: "No active chat" };

  let text = "";
  try {
    if (navigator.clipboard?.readText) {
      text = await navigator.clipboard.readText();
    }
  } catch {
    return { ok: false, error: "Clipboard blocked — long-press in the box and tap Paste" };
  }

  if (!String(text ?? "").trim()) {
    return { ok: false, error: "Clipboard is empty" };
  }

  attachTextContext(ctx.chatState, chatId, text, { force: true, onInline: ctx.onInlineAttach });
  ctx.onAttach?.(chatId);
  ctx.haptic?.tap?.();
  return { ok: true };
}
