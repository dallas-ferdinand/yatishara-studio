/** Assistant copy — plain / markdown / full. */
import { sanitizeAssistantReply } from "./reply-sanitize.js";

export const CopyFormat = {
  plain: "plain",
  markdown: "markdown",
  full: "full",
};

const COPY_MENU_ITEMS = [
  { id: CopyFormat.plain, label: "Copy text", hint: "Plain prose" },
  { id: CopyFormat.markdown, label: "Copy markdown", hint: "Formatted reply" },
  { id: CopyFormat.full, label: "Copy everything", hint: "Tools + reply" },
];

const THINKING_MENU_ITEMS = [
  { id: CopyFormat.plain, label: "Copy text", hint: "Plain thought" },
  { id: CopyFormat.markdown, label: "Copy markdown", hint: "Thought block" },
  { id: CopyFormat.full, label: "Copy everything", hint: "Full thought" },
];

let floatingMenu = null;

function closeFloatingMenu() {
  floatingMenu?.remove();
  floatingMenu = null;
}

/** Right-click copy menu at viewport coordinates (shared by assistant + thinking blocks). */
import { applyFloatingMenuPosition } from "./context-menu-position.js";

export function showCopyContextMenu(clientX, clientY, items, onPick) {
  closeFloatingMenu();
  const menu = document.createElement("div");
  menu.className = "msg-copy-menu msg-copy-menu--floating";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-copy-menu-item";
    btn.setAttribute("role", "menuitem");
    btn.innerHTML = `<span>${item.label}</span><span class="msg-copy-menu-hint">${item.hint}</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFloatingMenu();
      onPick(item.id);
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  const pos = applyFloatingMenuPosition(menu, clientX, clientY);
  menu.style.left = `${pos.left}px`;
  menu.style.top = `${pos.top}px`;
  floatingMenu = menu;

  const onDoc = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    if (menu.contains(e.target)) return;
    closeFloatingMenu();
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      closeFloatingMenu();
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    }
  };
  window.setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
}

export function showAssistantCopyMenu(clientX, clientY, message, onCopied) {
  showCopyContextMenu(clientX, clientY, COPY_MENU_ITEMS, async (format) => {
    const ok = await copyAssistantMessage(message, format);
    if (ok) onCopied?.(format);
  });
}

export function showThinkingCopyMenu(clientX, clientY, text, onCopied) {
  showCopyContextMenu(clientX, clientY, THINKING_MENU_ITEMS, async (format) => {
    const ok = await copyThinking(text, format);
    if (ok) onCopied?.(format);
  });
}

export function exportThinking(text, format = CopyFormat.plain) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (format === CopyFormat.plain) return t;
  return `### Thought\n\n${t}`;
}

export async function copyThinking(text, format = CopyFormat.plain) {
  const payload = exportThinking(text, format);
  if (!payload) return false;
  try {
    await navigator.clipboard.writeText(payload);
    return true;
  } catch {
    return false;
  }
}

function walkBlocks(blocks, visit) {
  for (const b of blocks ?? []) {
    visit(b);
    if (b.type === "tool-group" && b.tools?.length) walkBlocks(b.tools, visit);
  }
}

function appendSection(buf, text) {
  if (buf.length) buf.push("");
  buf.push(String(text).trim());
}

function toolLabel(tool) {
  const name = tool.name ?? tool.detail ?? "Tool";
  const status = tool.status === "running" ? "…" : tool.status === "error" ? "failed" : "done";
  return `${name} (${status})`;
}

function appendToolLines(lines, tool, depth = 0) {
  const indent = "  ".repeat(depth);
  lines.push(`${indent}**${toolLabel(tool)}**`);
  const detail = String(tool.detail ?? "").trim();
  if (detail && !detail.startsWith("{")) {
    lines.push(`${indent}> ${detail.replace(/\n/g, `\n${indent}> `)}`);
  }
  const out = String(tool.output ?? tool.detail ?? "").trim();
  if (out && out.length > 0) {
    lines.push(`${indent}\`\`\`text`);
    lines.push(out);
    lines.push(`${indent}\`\`\``);
  }
  lines.push("");
}

function exportPlain(blocks, message) {
  const parts = [];
  walkBlocks(blocks, (b) => {
    if (b.type === "text") {
      const t = sanitizeAssistantReply(b.content ?? "");
      if (t) parts.push(t);
    }
  });
  if (parts.length) return parts.join("\n\n");
  return sanitizeAssistantReply(message?.content ?? message?.text ?? "");
}

function exportMarkdown(blocks, message) {
  const lines = [];
  walkBlocks(blocks, (b) => {
    if (b.type === "text") {
      const t = sanitizeAssistantReply(b.content ?? "");
      if (t) appendSection(lines, t);
    } else if (b.type === "thinking") {
      const t = String(b.content ?? "").trim();
      if (t) appendSection(lines, `### Thought\n\n${t}`);
    }
  });
  if (lines.length) return lines.join("\n").trim();
  return sanitizeAssistantReply(message?.content ?? message?.text ?? "");
}

function exportFull(blocks, message) {
  const lines = [];
  walkBlocks(blocks, (b) => {
    switch (b.type) {
      case "text": {
        const t = sanitizeAssistantReply(b.content ?? "");
        if (t) appendSection(lines, t);
        break;
      }
      case "thinking": {
        const t = String(b.content ?? "").trim();
        if (t) appendSection(lines, `### Thought\n\n${t}`);
        break;
      }
      case "tool":
        appendToolLines(lines, b);
        break;
      case "plan": {
        const title = String(b.title ?? "Plan").trim();
        lines.push(`### ${title}`);
        if (b.overview) lines.push(String(b.overview).trim());
        if (b.content) lines.push(String(b.content).trim());
        lines.push("");
        break;
      }
      case "question": {
        lines.push("### Agent question");
        if (b.prompt) lines.push(`- **${String(b.prompt).trim()}**`);
        lines.push("");
        break;
      }
      default:
        break;
    }
  });
  for (const t of message?.tools ?? []) {
    appendToolLines(lines, t);
  }
  const prose = sanitizeAssistantReply(message?.content ?? message?.text ?? "");
  if (prose && !lines.some((l) => l.includes(prose.slice(0, 40)))) {
    appendSection(lines, prose);
  }
  return lines.join("\n").trim();
}

export function exportAssistantMessage(message, format = CopyFormat.plain) {
  if (!message) return "";
  if (message.role !== "assistant") {
    return String(message.content ?? message.text ?? "").trim();
  }
  const blocks = message.blocks ?? [];
  const body =
    format === CopyFormat.markdown
      ? exportMarkdown(blocks, message)
      : format === CopyFormat.full
        ? exportFull(blocks, message)
        : exportPlain(blocks, message);
  return body.trim() || sanitizeAssistantReply(message.content ?? message.text ?? "");
}

export async function copyAssistantMessage(message, format = CopyFormat.plain) {
  const text = exportAssistantMessage(message, format);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** @deprecated */
export function exportAssistantPlain(message) {
  return exportAssistantMessage(message, CopyFormat.plain);
}
