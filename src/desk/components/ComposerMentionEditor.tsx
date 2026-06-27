// @ts-nocheck
"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { getComposerTextAndCaret, findMentionAttachmentId } from "@/desk/lib/composer-mentions";

const COMPOSER_TEXTAREA_MAX_PX = 168;

function resizeEditor(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_TEXTAREA_MAX_PX)}px`;
}

export function ComposerMentionEditor({
  value,
  chatKey,
  placeholder,
  onInput,
  onFocus,
  onBlur,
  onKeyDown,
  onMentionClick,
  editorRef: externalRef,
}) {
  const localRef = useRef(null);
  const editorRef = externalRef ?? localRef;
  const lastChatKeyRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
  if (lastChatKeyRef.current !== chatKey) {
    lastChatKeyRef.current = chatKey;
    el.textContent = "";
    resizeEditor(el);
    return;
  }
    if (document.activeElement !== el && (el.innerText ?? "") !== (value ?? "")) {
      if (el.querySelector(".composer-inline-mention")) return;
      el.textContent = value ?? "";
      resizeEditor(el);
    }
  }, [chatKey, value, editorRef]);

  useLayoutEffect(() => {
    resizeEditor(editorRef.current);
  }, [value, chatKey, editorRef]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || value) return;
    if ((el.innerText ?? "").length) {
      el.textContent = "";
      resizeEditor(el);
    }
  }, [value, editorRef]);

  const emitInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const { text, caret } = getComposerTextAndCaret(el);
    resizeEditor(el);
    onInput?.(text, caret, el);
  };

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className="cursor-composer-textarea cursor-composer-mention-editor"
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={emitInput}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        const id = findMentionAttachmentId(e.target);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        const id = findMentionAttachmentId(e.target);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        onMentionClick?.(id);
      }}
    />
  );
}
