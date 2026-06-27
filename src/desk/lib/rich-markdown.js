function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function paintRichMarkdown(el, markdown) {
  if (!el) return;
  el.innerHTML = escapeHtml(markdown).replace(/\n/g, "<br />");
}
