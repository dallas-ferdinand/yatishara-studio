/** Server-safe markdown render — no DOM; used by gateway + shared agent-flow. */

import { normalizeMarkdown } from "./markdown-normalize.js";

let markedReady = false;

function ensureMarked() {
  if (markedReady || typeof marked === "undefined") return;
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
  });
  markedReady = true;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  const raw = normalizeMarkdown(text);
  let inner;
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    ensureMarked();
    inner = DOMPurify.sanitize(marked.parse(raw), {
      ADD_ATTR: ["target", "data-path", "disabled", "checked"],
      ADD_TAGS: ["iframe", "table", "thead", "tbody", "tfoot", "tr", "th", "td"],
    });
  } else {
    inner = escapeHtml(raw)
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  }
  return `<div class="md-prose">${inner}</div>`;
}
