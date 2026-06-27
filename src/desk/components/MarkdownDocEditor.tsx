// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { docHtmlToMarkdown, markdownToDocHtml } from "@/desk/lib/markdown-doc";

function ToolbarButton({ title, icon, onClick, active = false }) {
  return (
    <button
      type="button"
      className={`cursor-doc-tool${active ? " active" : ""}`}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

export function MarkdownDocEditor({ value, onChange, onSave }) {
  const editorRef = useRef(null);
  const lastMarkdownRef = useRef(value ?? "");
  const dirtyRef = useRef(false);

  const syncFromMarkdown = useCallback((md) => {
    const el = editorRef.current;
    if (!el) return;
    lastMarkdownRef.current = md ?? "";
    el.innerHTML = markdownToDocHtml(md);
    dirtyRef.current = false;
  }, []);

  useEffect(() => {
    const md = value ?? "";
    if (md === lastMarkdownRef.current && dirtyRef.current) return;
    if (document.activeElement === editorRef.current && dirtyRef.current) return;
    syncFromMarkdown(md);
  }, [value, syncFromMarkdown]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const md = docHtmlToMarkdown(el);
    lastMarkdownRef.current = md;
    dirtyRef.current = true;
    onChange?.(md);
  }, [onChange]);

  const runCmd = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    emitChange();
  };

  const onInput = () => {
    emitChange();
  };

  return (
    <div className="cursor-doc-editor">
      <div className="cursor-doc-toolbar" role="toolbar" aria-label="Formatting">
        <ToolbarButton title="Bold" icon="bold" onClick={() => runCmd("bold")} />
        <ToolbarButton title="Italic" icon="italic" onClick={() => runCmd("italic")} />
        <span className="cursor-doc-tool-divider" />
        <ToolbarButton title="Heading 1" icon="heading1" onClick={() => runCmd("formatBlock", "h1")} />
        <ToolbarButton title="Heading 2" icon="heading2" onClick={() => runCmd("formatBlock", "h2")} />
        <span className="cursor-doc-tool-divider" />
        <ToolbarButton title="Bullet list" icon="list" onClick={() => runCmd("insertUnorderedList")} />
        <ToolbarButton title="Numbered list" icon="listOrdered" onClick={() => runCmd("insertOrderedList")} />
        <ToolbarButton title="Quote" icon="quote" onClick={() => runCmd("formatBlock", "blockquote")} />
      </div>
      <div className="cursor-doc-scroll">
        <div
          ref={editorRef}
          className="cursor-doc-page cursor-editor-md mos-md md-prose"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={onInput}
          onBlur={onInput}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              emitChange();
              onSave?.();
            }
          }}
        />
      </div>
    </div>
  );
}
