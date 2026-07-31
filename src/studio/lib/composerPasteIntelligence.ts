/**
 * Smart clipboard → plain text for Studio contenteditable composers.
 * Browsers paste rich HTML from the web into contentEditable; we always
 * insert normalized plain text instead.
 */

const HTML_MARKUP_RE =
  /<\/?(?:html|body|head|meta|style|script|div|span|p|br|a|ul|ol|li|table|tr|td|th|h[1-6]|strong|em|b|i|font|img|section|article|nav|header|footer)\b[^>]*>/i;

/** True when clipboard "plain" text is actually HTML source. */
export function looksLikeHtmlMarkup(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length < 8) return false;
  if (!HTML_MARKUP_RE.test(t)) return false;
  const tagHits = (t.match(/<\/?[a-z][^>]*>/gi) ?? []).length;
  if (tagHits < 2) return false;
  // Prefer markup when tags are a meaningful share of the payload.
  return tagHits >= 3 || /<(?:html|body|meta|style|div)\b/i.test(t);
}

/** Convert HTML fragment to readable plain text (block → newlines). */
export function htmlToPlainText(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return normalizePastedPlainText(raw.replace(/<[^>]+>/g, " "));
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc
    .querySelectorAll("script, style, noscript, template, svg, iframe")
    .forEach((node) => node.remove());
  // Prefer line breaks from block structure over collapsing everything.
  doc.querySelectorAll("br").forEach((br) => {
    br.replaceWith(doc.createTextNode("\n"));
  });
  for (const el of Array.from(
    doc.querySelectorAll(
      "p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article",
    ),
  )) {
    if (!el.textContent?.trim()) continue;
    el.appendChild(doc.createTextNode("\n"));
  }
  const text = doc.body?.textContent ?? "";
  return normalizePastedPlainText(text);
}

/** Collapse clipboard noise while keeping intentional newlines. */
export function normalizePastedPlainText(text: string): string {
  return String(text ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

export type ClipboardLike = {
  getData: (format: string) => string;
};

/**
 * Best plain text for paste into a prompt composer.
 * Prefers text/plain; falls back to HTML→text; strips HTML-as-plain.
 */
export function plainTextFromClipboard(clipboard: ClipboardLike | null | undefined): string {
  if (!clipboard) return "";
  let plain = "";
  let html = "";
  try {
    plain = clipboard.getData("text/plain") || "";
  } catch {
    plain = "";
  }
  try {
    html = clipboard.getData("text/html") || "";
  } catch {
    html = "";
  }

  const plainTrim = plain.trim();
  const htmlTrim = html.trim();

  if (plainTrim && looksLikeHtmlMarkup(plain)) {
    // Site put markup in text/plain — prefer a real HTML decode when available.
    if (htmlTrim) return htmlToPlainText(html);
    return htmlToPlainText(plain);
  }

  if (plainTrim) return normalizePastedPlainText(plain);

  if (htmlTrim) return htmlToPlainText(html);

  return "";
}

/** Insert plain text at the caret (contentEditable-safe, preserves undo when possible). */
export function insertPlainTextAtSelection(text: string): boolean {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (document.execCommand("insertText", false, value)) return true;
  } catch {
    // fall through
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(value);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
