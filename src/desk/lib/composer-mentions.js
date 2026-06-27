/** Contenteditable composer — inline @ mention chips at caret. */

import {
  attachmentIsImage,
  attachmentLabel,
  attachmentIconName,
  attachmentThumbUrl,
} from "@/desk/lib/attachment-model.js";
import { refPickerIcon } from "@/desk/lib/file-kind.js";
import { contextLabel } from "@mos-app/composer-paste.js";
import { icon as svgIcon } from "@mos-app/icons.js";

export function mentionDisplayLabel(attachment) {
  if (!attachment) return "file";
  if (attachment.kind === "context") {
    return attachment.label ?? contextLabel(attachment.text);
  }
  return attachmentLabel(attachment);
}

export function mentionLabel(attachment) {
  if (!attachment) return "@file";
  if (attachment.kind === "context") {
    return attachment.label ?? contextLabel(attachment.text);
  }
  const label = attachmentLabel(attachment);
  return label.startsWith("@") ? label : `@${label}`;
}

const MENTION_ICON_PX = 11;

function mentionIconHtml(attachment) {
  const name = attachmentIconName(attachment);
  return svgIcon(name)
    .replace(/width="\d+"/, `width="${MENTION_ICON_PX}"`)
    .replace(/height="\d+"/, `height="${MENTION_ICON_PX}"`);
}

function fillTextMention(span, attachment) {
  span.textContent = "";
  span.classList.add("composer-inline-mention--with-icon");
  const iconWrap = span.ownerDocument.createElement("span");
  iconWrap.className = "composer-inline-mention-icon icon-inline";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML = mentionIconHtml(attachment);
  const label = span.ownerDocument.createElement("span");
  label.className = "composer-inline-mention-label";
  label.textContent = mentionDisplayLabel(attachment);
  span.appendChild(iconWrap);
  span.appendChild(label);
}

function mentionTextLength(node) {
  if (node?.classList?.contains("composer-inline-mention")) return 1;
  return node.textContent?.length ?? 0;
}

function refCharLengthOfNode(node) {
  if (!node) return 0;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  if (node.classList?.contains("composer-inline-mention")) return 1;
  let total = 0;
  for (const child of node.childNodes) total += refCharLengthOfNode(child);
  return total;
}

function refCharLengthOfFragment(frag) {
  if (!frag) return 0;
  let total = 0;
  for (const child of frag.childNodes) total += refCharLengthOfNode(child);
  return total;
}

function buildComposerRefText(editorEl) {
  let text = "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList?.contains("composer-inline-mention")) {
      text += "\uFFFC";
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  for (const child of editorEl.childNodes) walk(child);
  return text;
}

function refCaretFromSelection(editorEl) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const live = sel.getRangeAt(0);
  if (!editorEl.contains(live.startContainer)) return null;
  const collapsed = live.cloneRange();
  if (!collapsed.collapsed) collapsed.collapse(false);
  const pre = editorEl.ownerDocument.createRange();
  try {
    pre.selectNodeContents(editorEl);
    pre.setEnd(collapsed.startContainer, collapsed.startOffset);
    return refCharLengthOfFragment(pre.cloneContents());
  } catch {
    return null;
  }
}

export function getComposerTextAndCaret(editorEl) {
  if (!editorEl) return { text: "", caret: 0 };
  const sel = window.getSelection();
  if (!sel?.rangeCount) {
    return { text: editorEl.innerText ?? "", caret: (editorEl.innerText ?? "").length };
  }
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.startContainer)) {
    return { text: editorEl.innerText ?? "", caret: (editorEl.innerText ?? "").length };
  }
  const pre = range.cloneRange();
  pre.selectNodeContents(editorEl);
  pre.setEnd(range.endContainer, range.endOffset);
  return { text: editorEl.innerText ?? "", caret: pre.toString().length };
}

/** Plain index map for @ picker — mention chips count as one char (\uFFFC). */
export function getComposerRefTextAndCaret(editorEl) {
  if (!editorEl) return { text: "", caret: 0 };
  const text = buildComposerRefText(editorEl);
  const caret = refCaretFromSelection(editorEl);
  return { text, caret: caret ?? text.length };
}

/** Inclusive ref-map end index for deleting `@` + rawAfterAt (exclusive end). */
export function refQueryDeleteEnd(atStart, rawAfterAt = "") {
  return atStart + 1 + String(rawAfterAt ?? "").length;
}

/** Place caret at pointer position inside the contenteditable composer (drag/drop). */
export function setComposerCaretFromPoint(editorEl, clientX, clientY) {
  if (!editorEl) return false;
  const doc = editorEl.ownerDocument;
  let range = null;

  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos?.offsetNode) {
      range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  } else if (typeof doc.caretRangeFromPoint === "function") {
    range = doc.caretRangeFromPoint(clientX, clientY);
  }

  if (!range || !editorEl.contains(range.startContainer)) {
    setSelectionByChars(editorEl, buildComposerRefText(editorEl).length);
    return false;
  }

  const sel = doc.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

export function resolveComposerDropCaret(editorEl, clientX, clientY) {
  if (!editorEl) return 0;
  const rect = editorEl.getBoundingClientRect();
  let x = clientX;
  let y = clientY;
  const hit = editorEl.ownerDocument.elementFromPoint?.(x, y);
  if (!hit || !editorEl.contains(hit)) {
    x = Math.min(Math.max(x, rect.left + 8), rect.right - 8);
    y = Math.min(Math.max(y, rect.top + 8), rect.bottom - 8);
  }
  editorEl.focus({ preventScroll: true });
  setComposerCaretFromPoint(editorEl, x, y);
  return getComposerRefTextAndCaret(editorEl).caret;
}

function walkRefCharSegments(editorEl, visit) {
  let charIndex = 0;
  const walk = (node, isText) => {
    if (isText) {
      const value = node.textContent ?? "";
      const len = value.length;
      visit({ type: "text", node, charIndex, len });
      charIndex += len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList?.contains("composer-inline-mention")) {
      const len = mentionTextLength(node);
      visit({ type: "mention", node, charIndex, len });
      charIndex += len;
      return;
    }
    for (const child of node.childNodes) walk(child, child.nodeType === Node.TEXT_NODE);
  };
  for (const child of editorEl.childNodes) walk(child, child.nodeType === Node.TEXT_NODE);
  return charIndex;
}

function refIndexToDomPoint(editorEl, index) {
  let point = null;
  const target = Math.max(0, index);
  walkRefCharSegments(editorEl, ({ type, node, charIndex, len }) => {
    if (point) return;
    const end = charIndex + len;
    if (target < end) {
      if (type === "text") {
        point = { node, offset: target - charIndex };
      } else {
        const parent = node.parentNode ?? editorEl;
        const idx = Array.prototype.indexOf.call(parent.childNodes, node);
        point = { node: parent, offset: target > charIndex ? idx + 1 : idx };
      }
      return;
    }
    if (target === end) {
      if (type === "text") {
        point = { node, offset: len };
      } else {
        const parent = node.parentNode ?? editorEl;
        const idx = Array.prototype.indexOf.call(parent.childNodes, node);
        point = { node: parent, offset: idx + 1 };
      }
    }
  });
  return point ?? { node: editorEl, offset: editorEl.childNodes.length };
}

function setSelectionByChars(root, start, end = start) {
  const sel = window.getSelection();
  if (!sel) return false;
  const from = refIndexToDomPoint(root, start);
  const to = refIndexToDomPoint(root, end);
  const range = document.createRange();
  try {
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

function deleteRefCharRange(editorEl, from, to) {
  if (!editorEl || from == null || to == null || to <= from) return true;
  const start = refIndexToDomPoint(editorEl, from);
  const end = refIndexToDomPoint(editorEl, to);
  const range = editorEl.ownerDocument.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    range.deleteContents();
    const sel = editorEl.ownerDocument.defaultView?.getSelection();
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  } catch {
    return false;
  }
}

function setSelectionAfterNode(node) {
  if (!node?.parentNode) return;
  const range = node.ownerDocument.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  const sel = node.ownerDocument.defaultView?.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function replaceComposerRefRange(editorEl, from, to, insertion = "") {
  if (!editorEl) return false;
  editorEl.focus();
  if (!setSelectionByChars(editorEl, from, to)) return false;
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  if (insertion) {
    const tn = editorEl.ownerDocument.createTextNode(insertion);
    range.insertNode(tn);
    range.setStartAfter(tn);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return true;
}

/** Remove `@query` text near a ref-map index (never scans whole doc for bare `@`). */
function deleteRefLiteralNear(editorEl, literal, nearIndex) {
  const needle = String(literal ?? "");
  if (!needle || !editorEl || nearIndex == null) return false;
  return deleteRefCharRange(editorEl, nearIndex, nearIndex + needle.length);
}

/** Delete literal @query text from text nodes (fallback when index map misses). */
function deleteLiteralRefText(editorEl, literal) {
  const needle = String(literal ?? "");
  if (!needle || !editorEl) return false;
  const walker = editorEl.ownerDocument.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    const t = node.textContent ?? "";
    const idx = t.indexOf(needle);
    if (idx >= 0) {
      const range = editorEl.ownerDocument.createRange();
      try {
        range.setStart(node, idx);
        range.setEnd(node, idx + needle.length);
        range.deleteContents();
        const sel = editorEl.ownerDocument.defaultView?.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        range.collapse(true);
        return true;
      } catch {
        /* try combined match */
      }
    }
  }
  const combined = nodes.map((node) => node.textContent ?? "").join("");
  const idx = combined.lastIndexOf(needle);
  if (idx < 0) return false;
  let cursor = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  for (const node of nodes) {
    const t = node.textContent ?? "";
    const len = t.length;
    const next = cursor + len;
    if (!startNode && idx < next) {
      startNode = node;
      startOff = idx - cursor;
    }
    if (!endNode && idx + needle.length <= next) {
      endNode = node;
      endOff = idx + needle.length - cursor;
      break;
    }
    cursor = next;
  }
  if (!startNode || !endNode) return false;
  const range = editorEl.ownerDocument.createRange();
  try {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    range.deleteContents();
    const sel = editorEl.ownerDocument.defaultView?.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    range.collapse(true);
    return true;
  } catch {
    return false;
  }
}

function scrubStrayRefTextNear(mentionNode) {
  if (!mentionNode) return;
  const prev = mentionNode.previousSibling;
  if (prev?.nodeType === Node.TEXT_NODE) {
    const t = prev.textContent ?? "";
    const cleaned = t.replace(/@[^\s\uFFFC]*\s*$/u, "");
    if (cleaned !== t) {
      prev.textContent = cleaned;
      if (!cleaned) prev.remove();
    }
  }
  let next = mentionNode.nextSibling;
  while (next?.nodeType === Node.TEXT_NODE) {
    const t = next.textContent ?? "";
    const cleaned = t.replace(/^\s*@[^\s\uFFFC]*/u, "");
    if (cleaned === t) break;
    next.textContent = cleaned;
    const toRemove = next;
    next = next.nextSibling;
    if (!toRemove.textContent) toRemove.remove();
  }
}

function fillImageMention(span, attachment, workspaceId) {
  span.textContent = "";
  const thumb = attachmentThumbUrl(attachment, workspaceId);
  if (thumb) {
    const img = span.ownerDocument.createElement("img");
    img.src = thumb;
    img.alt = attachment.filename ?? attachment.label ?? "image";
    img.draggable = false;
    span.appendChild(img);
    span.classList.remove("is-loading");
  } else {
    span.classList.add("is-loading");
  }
}

function decorateMentionNode(span, attachment) {
  span.classList.add("composer-inline-mention--clickable");
  span.setAttribute("role", "button");
  span.tabIndex = -1;
  span.title =
    attachment.path ??
    attachment.filename ??
    attachment.label ??
    (attachmentIsImage(attachment) ? "Image" : "");
  if (attachment.kind === "context") {
    span.classList.add("composer-inline-mention--context");
    span.title = attachment.text ? String(attachment.text).slice(0, 240) : span.title;
  }
}

export function createMentionNode(doc, attachment, { workspaceId = "mercuryos" } = {}) {
  const span = doc.createElement("span");
  span.className = "composer-inline-mention";
  span.contentEditable = "false";
  span.dataset.mentionId = attachment.id;
  span.dataset.mentionKind = attachment.kind ?? "ref";
  if (attachment.path) span.dataset.mentionPath = attachment.path;
  if (attachment.stored) span.dataset.mentionStored = attachment.stored;

  if (attachmentIsImage(attachment)) {
    span.classList.add("composer-inline-mention--image");
    span.dataset.mentionImage = "1";
    fillImageMention(span, attachment, workspaceId);
    decorateMentionNode(span, attachment);
  } else if (attachment.kind === "context") {
    span.dataset.mentionKind = "context";
    fillTextMention(span, attachment);
    decorateMentionNode(span, attachment);
  } else {
    fillTextMention(span, attachment);
    decorateMentionNode(span, attachment);
  }
  return span;
}

export function updateMentionNode(editorEl, attachment, { workspaceId = "mercuryos" } = {}) {
  if (!editorEl || !attachment?.id) return;
  const node = editorEl.querySelector(`[data-mention-id="${attachment.id}"]`);
  if (!node) return;
  if (attachmentIsImage(attachment)) {
    node.classList.add("composer-inline-mention--image");
    node.dataset.mentionImage = "1";
    fillImageMention(node, attachment, workspaceId);
    decorateMentionNode(node, attachment);
    return;
  }
  node.classList.remove("composer-inline-mention--image", "is-loading");
  delete node.dataset.mentionImage;
  if (attachment.path) node.dataset.mentionPath = attachment.path;
  else delete node.dataset.mentionPath;
  if (attachment.stored) node.dataset.mentionStored = attachment.stored;
  else delete node.dataset.mentionStored;
  node.classList.remove("composer-inline-mention--with-icon");
  fillTextMention(node, attachment);
  decorateMentionNode(node, attachment);
}

export function findMentionAttachmentId(target) {
  const node = target?.closest?.(".composer-inline-mention");
  return node?.dataset?.mentionId ?? null;
}

function isIgnorableComposerTailText(text) {
  return !String(text ?? "").replace(/[\s\u200B\uFEFF]/g, "").length;
}

function isRemovableComposerTailText(text) {
  const t = String(text ?? "");
  if (t.includes("\u200B")) return false;
  return isIgnorableComposerTailText(t);
}

function stripComposerPlaceholderBreaks(editorEl) {
  if (!editorEl) return;
  for (const node of [...editorEl.childNodes]) {
    if (node.nodeName === "BR") node.remove();
  }
}

function normalizeComposerAfterMention(editorEl) {
  if (!editorEl) return;
  stripComposerPlaceholderBreaks(editorEl);
  let last = editorEl.lastChild;
  while (last) {
    if (last.nodeName === "BR") {
      last.remove();
      last = editorEl.lastChild;
      continue;
    }
    if (
      last.nodeType === Node.TEXT_NODE &&
      isRemovableComposerTailText(last.textContent) &&
      last.previousSibling?.classList?.contains?.("composer-inline-mention")
    ) {
      last.remove();
      last = editorEl.lastChild;
      continue;
    }
    break;
  }
}

function ensureCaretAnchorAfter(editorEl, node) {
  if (!editorEl || !node?.parentNode) return;
  const next = node.nextSibling;
  if (
    next?.nodeType === Node.TEXT_NODE &&
    (next.textContent ?? "").includes("\u200B")
  ) {
    return;
  }
  const anchor = editorEl.ownerDocument.createTextNode("\u200B");
  node.parentNode.insertBefore(anchor, node.nextSibling);
}

function mentionNodeBeforeCaret(editorEl, range) {
  const { startContainer, startOffset } = range;
  if (startContainer === editorEl && startOffset > 0) {
    const prev = editorEl.childNodes[startOffset - 1];
    if (prev?.classList?.contains?.("composer-inline-mention")) return prev;
    if (
      prev?.nodeType === Node.TEXT_NODE &&
      isIgnorableComposerTailText(prev.textContent) &&
      prev.previousSibling?.classList?.contains?.("composer-inline-mention")
    ) {
      return prev.previousSibling;
    }
  }
  if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
    const prev = startContainer.previousSibling;
    if (prev?.classList?.contains?.("composer-inline-mention")) return prev;
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    const el = startContainer.childNodes[startOffset - 1];
    if (el?.classList?.contains?.("composer-inline-mention")) return el;
  }
  const inMention = startContainer.parentElement?.closest?.(".composer-inline-mention");
  if (inMention && editorEl.contains(inMention)) return inMention;
  return null;
}

function mentionNodeAfterCaret(editorEl, range) {
  const { startContainer, startOffset } = range;
  if (startContainer === editorEl) {
    const next = editorEl.childNodes[startOffset];
    if (next?.classList?.contains?.("composer-inline-mention")) return next;
  }
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const t = startContainer.textContent ?? "";
    if (startOffset >= t.length) {
      const next = startContainer.nextSibling;
      if (next?.classList?.contains?.("composer-inline-mention")) return next;
    }
  }
  return null;
}

/** Backspace/Delete on mention chips + lone-tag cleanup. Returns removed mention id. */
export function handleComposerMentionKeydown(editorEl, event) {
  if (!editorEl || (event.key !== "Backspace" && event.key !== "Delete")) return null;
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.startContainer)) return null;

  let mention =
    event.key === "Backspace"
      ? mentionNodeBeforeCaret(editorEl, range)
      : mentionNodeAfterCaret(editorEl, range);

  if (!mention) {
    const mentions = [...editorEl.querySelectorAll(".composer-inline-mention")];
    if (mentions.length === 1 && event.key === "Backspace") {
      const only = mentions[0];
      const hasText = (editorEl.innerText ?? "").replace(/\u200B/g, "").trim().length > 0;
      if (!hasText) mention = only;
    }
  }

  if (!mention) return null;
  const id = mention.dataset?.mentionId ?? null;
  event.preventDefault();
  const anchor = mention.nextSibling;
  mention.remove();
  if (anchor?.nodeType === Node.TEXT_NODE && isIgnorableComposerTailText(anchor.textContent)) {
    anchor.remove();
  }
  normalizeComposerAfterMention(editorEl);
  return id;
}

export function syncInlineAttachmentsFromEditor(editorEl, attachments, onRemove) {
  if (!editorEl || !attachments?.length || typeof onRemove !== "function") return;
  const ids = collectInlineMentionIds(editorEl);
  for (const att of attachments) {
    if (att?.inline && att.id && !ids.has(att.id)) onRemove(att.id);
  }
}

/** Drop mention chips in the DOM that are not in this chat's pending list. */
export function pruneOrphanComposerMentions(editorEl, attachments = []) {
  if (!editorEl) return;
  const allowed = new Set((attachments ?? []).map((a) => a?.id).filter(Boolean));
  for (const node of [...editorEl.querySelectorAll(".composer-inline-mention")]) {
    const id = node.dataset?.mentionId;
    if (!id || !allowed.has(id)) node.remove();
  }
}

export function insertMentionAtCaret(
  editorEl,
  attachment,
  { replaceFrom = null, replaceTo = null, at = null, deleteLiteral = null, workspaceId = "mercuryos" } = {},
) {
  if (!editorEl || !attachment?.id) return;
  editorEl.focus();
  const doc = editorEl.ownerDocument;
  const mention = createMentionNode(doc, attachment, { workspaceId });

  stripComposerPlaceholderBreaks(editorEl);

  const insertOnlyAt = at != null && Number.isFinite(at);
  let insertAt = insertOnlyAt ? at : null;

  if (!insertOnlyAt && replaceFrom != null && Number.isFinite(replaceFrom)) {
    const live = getComposerRefTextAndCaret(editorEl);
    const end =
      replaceTo != null && Number.isFinite(replaceTo)
        ? replaceTo
        : deleteLiteral
          ? replaceFrom + deleteLiteral.length
          : live.caret;
    let removed = deleteRefCharRange(editorEl, replaceFrom, end);
    if (!removed) {
      removed = replaceComposerRefRange(editorEl, replaceFrom, end, "");
    }
    if (!removed && deleteLiteral) {
      deleteRefLiteralNear(editorEl, deleteLiteral, replaceFrom);
    }
    insertAt = replaceFrom;
  } else if (!insertOnlyAt && deleteLiteral && replaceFrom != null) {
    deleteRefLiteralNear(editorEl, deleteLiteral, replaceFrom);
    insertAt = replaceFrom;
  }

  if (insertAt != null && Number.isFinite(insertAt)) {
    setSelectionByChars(editorEl, insertAt, insertAt);
  }

  const sel = window.getSelection();
  if (!sel?.rangeCount) {
    editorEl.appendChild(mention);
    ensureCaretAnchorAfter(editorEl, mention);
    scrubStrayRefTextNear(mention);
    normalizeComposerAfterMention(editorEl);
    setSelectionAfterNode(mention.nextSibling ?? mention);
    return;
  }

  const range = sel.getRangeAt(0);
  range.collapse(true);
  range.insertNode(mention);
  ensureCaretAnchorAfter(editorEl, mention);
  const anchor = mention.nextSibling;
  if (anchor) {
    range.setStartAfter(anchor);
  } else {
    range.setStartAfter(mention);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  scrubStrayRefTextNear(mention);
  normalizeComposerAfterMention(editorEl);
}

export function removeMentionById(editorEl, mentionId) {
  if (!editorEl || !mentionId) return;
  const node = editorEl.querySelector(`[data-mention-id="${mentionId}"]`);
  node?.remove();
}

export function collectInlineMentionIds(editorEl) {
  if (!editorEl) return new Set();
  return new Set(
    [...editorEl.querySelectorAll(".composer-inline-mention")].map((n) => n.dataset.mentionId).filter(Boolean),
  );
}

/** Walk composer DOM → ordered text + mention blocks (for sent message layout). */
export function serializeComposerContent(editorEl) {
  if (!editorEl) return [];
  const blocks = [];

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (value) blocks.push({ type: "text", value });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList?.contains("composer-inline-mention") && node.dataset.mentionId) {
      blocks.push({ type: "mention", id: node.dataset.mentionId });
      return;
    }
    for (const child of node.childNodes) walk(child);
  };

  for (const child of editorEl.childNodes) walk(child);
  return blocks;
}

/** Prepend composer strip attachments (not typed inline) before the first text block. */
export function mergeAttachmentsIntoBlocks(blocks, attachments = []) {
  const list = Array.isArray(blocks) ? [...blocks] : [];
  const mentioned = new Set(list.filter((b) => b.type === "mention").map((b) => b.id));
  const extras = (attachments ?? []).filter((a) => a?.id && !mentioned.has(a.id));
  if (!extras.length) return list;
  const prepend = extras.map((a) => ({ type: "mention", id: a.id }));
  const firstText = list.findIndex((b) => b.type === "text");
  if (firstText === -1) return [...prepend, ...list];
  return [...list.slice(0, firstText), ...prepend, ...list.slice(firstText)];
}

/** Ordered inline blocks for rendering a sent user message. */
export function blocksForUserMessage(message) {
  const attachments = message?.attachments ?? [];
  const blocks = message?.contentBlocks;
  if (blocks?.length) return mergeAttachmentsIntoBlocks(blocks, attachments);
  const inline = attachments.filter((a) => a?.id).map((a) => ({ type: "mention", id: a.id }));
  const text = message?.content;
  if (text != null && String(text).length) inline.push({ type: "text", value: text });
  return inline;
}

export function blocksToPlainText(blocks, attachments = []) {
  const byId = new Map(attachments.filter((a) => a?.id).map((a) => [a.id, a]));
  return (blocks ?? [])
    .map((b) => {
      if (b.type === "text") return b.value;
      const att = byId.get(b.id);
      if (attachmentIsImage(att) || att?.kind === "context") return " ";
      return att ? mentionLabel(att) : "";
    })
    .join("");
}

function phoneFromPersonItem(item) {
  const jid = String(item?.remoteJid ?? item?.path?.replace(/^whatsapp:\/\//, "") ?? "");
  const raw = jid.split("@")[0] ?? "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : raw;
}

export function refItemToAttachment(item, id) {
  if (!item) return null;
  if (item.kind === "person") {
    const name = item.name ?? item.identity?.displayName ?? phoneFromPersonItem(item);
    const identity = item.identity ?? null;
    return {
      id,
      kind: "ref",
      path: item.path ?? `whatsapp://${item.remoteJid}`,
      remoteJid: item.remoteJid,
      phone: item.phone ?? identity?.phone,
      slug: item.slug ?? identity?.slug,
      label: name,
      filename: name,
      inline: true,
      refKind: "person",
      identity,
    };
  }
  if (item.kind === "mcp") {
    const name = item.name ?? item.path ?? "MCP";
    return {
      id,
      kind: "ref",
      path: `mcp://${item.path ?? name}`,
      label: name,
      filename: name,
      inline: true,
      refKind: "mcp",
    };
  }
  if (item.kind === "dir" || item.isDir) {
    return {
      id,
      kind: "folder",
      isDirectory: true,
      path: item.path,
      label: item.name,
      inline: true,
    };
  }
  return {
    id,
    kind: "ref",
    path: item.path,
    workspacePath: item.path,
    filename: item.name,
    label: item.name,
    inline: true,
    refKind: item.kind,
  };
}

export function workspaceEntryToAttachment(entry, id) {
  const name = entry.name ?? entry.path?.split("/").pop() ?? entry.path;
  if (entry.type === "dir") {
    return { id, kind: "folder", isDirectory: true, path: entry.path, label: name, inline: true };
  }
  return { id, kind: "ref", path: entry.path, filename: name, label: name, inline: true };
}

/** Workspace tab strip → composer inline mention. */
export function workspaceTabToAttachment(tab, id) {
  if (!tab) return null;
  const title = tab.title ?? tab.name ?? "Tab";
  if (tab.kind === "chat") {
    return {
      id,
      kind: "ref",
      path: tab.id,
      chatId: tab.id,
      label: title,
      filename: title,
      inline: true,
      refKind: "chat",
    };
  }
  if (tab.kind === "file" && tab.path) {
    return {
      id,
      kind: "ref",
      path: tab.path,
      workspacePath: tab.path,
      filename: title,
      label: title,
      inline: true,
      refKind: "file",
    };
  }
  if (tab.kind === "pulse") {
    return {
      id,
      kind: "ref",
      path: "pulse://main",
      label: title || "Pulse",
      filename: "Pulse",
      inline: true,
      refKind: "pulse",
    };
  }
  return null;
}

export function refPickerRowIcon(item) {
  return refPickerIcon(item);
}
