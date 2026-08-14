/** Copy composer chips as `@tag` text (chips are user-select:none). */

function isComposerChip(node: Node | null): node is Element {
  return Boolean(
    node && node.nodeType === 1 && (node as Element).classList.contains("studio-inline-tag"),
  );
}

function composerChipAtTag(node: Element): string {
  const fromLabel = node.querySelector(".studio-inline-tag-label")?.textContent ?? "";
  const fromData = String((node as HTMLElement).dataset?.label ?? "");
  const raw = (fromLabel || fromData).replace(/^@/, "").trim();
  return raw ? `@${raw}` : "";
}

function serializeRangeAsPrompt(editor: Element, range: Range): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!range.intersectsNode(node)) return;
      const value = node.nodeValue ?? "";
      let from = 0;
      let to = value.length;
      if (node === range.startContainer) from = range.startOffset;
      if (node === range.endContainer) to = range.endOffset;
      if (from < to) parts.push(value.slice(from, to));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (isComposerChip(node)) {
      if (range.intersectsNode(node)) parts.push(composerChipAtTag(node));
      return;
    }
    if (!range.intersectsNode(node)) return;
    node.childNodes.forEach(visit);
  };
  visit(editor);
  return parts.join("");
}

/** Plain prompt text for the current selection, chips as `@tag`. Null if nothing to copy. */
export function serializeComposerSelectionAsPrompt(editor: Element | null): string | null {
  if (!editor) return null;
  const sel = editor.ownerDocument.defaultView?.getSelection?.() ?? window.getSelection();
  if (!sel?.rangeCount) return null;
  if (!editor.contains(sel.anchorNode) && !editor.contains(sel.focusNode)) return null;
  if (sel.isCollapsed) return null;
  return serializeRangeAsPrompt(editor, sel.getRangeAt(0));
}

export function writeComposerSelectionToClipboard(
  event: ClipboardEvent,
  editor: Element | null,
): boolean {
  const text = serializeComposerSelectionAsPrompt(editor);
  if (text == null) return false;
  event.preventDefault();
  event.clipboardData?.setData("text/plain", text);
  return true;
}
