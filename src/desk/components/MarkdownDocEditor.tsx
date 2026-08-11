// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { docHtmlToMarkdown, markdownToDocHtml } from "@/desk/lib/markdown-doc";
import { enhanceCodeBlocks } from "@/desk/lib/markdown-desk.js";

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

function decorateDocShells(root) {
  if (!root) return;
  enhanceCodeBlocks(root);
  root
    .querySelectorAll(
      ".mos-code, .code-shell, .mos-code-bar, .code-shell-head, .mos-code-copy",
    )
    .forEach((node) => {
      node.setAttribute("contenteditable", "false");
    });
  root.querySelectorAll(".mos-code-copy").forEach((btn) => {
    if (btn.dataset.docCopyBound === "1") return;
    btn.dataset.docCopyBound = "1";
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

export function MarkdownDocEditor({ value, onChange, onSave, name }) {
  const editorRef = useRef(null);
  const lastMarkdownRef = useRef(value ?? "");
  const dirtyRef = useRef(false);
  // HTML→markdown is lossy (fences, spacing). Only write back after a real edit.
  const userEditedRef = useRef(false);

  const syncFromMarkdown = useCallback((md) => {
    const el = editorRef.current;
    if (!el) return;
    lastMarkdownRef.current = md ?? "";
    el.innerHTML = markdownToDocHtml(md);
    decorateDocShells(el);
    dirtyRef.current = false;
    userEditedRef.current = false;
  }, []);

  useEffect(() => {
    // First paint: render + wire Copy even when value matches the seed ref.
    syncFromMarkdown(value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    const md = value ?? "";
    if (md === lastMarkdownRef.current) return;
    // Keep in-progress typing, but always accept hydrate when local body is still empty.
    if (
      dirtyRef.current &&
      document.activeElement === editorRef.current &&
      !(String(lastMarkdownRef.current).trim() === "" && String(md).trim() !== "")
    ) {
      return;
    }
    syncFromMarkdown(md);
  }, [value, syncFromMarkdown]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!userEditedRef.current) return;
    const md = docHtmlToMarkdown(el);
    if (md === lastMarkdownRef.current) return;
    lastMarkdownRef.current = md;
    dirtyRef.current = true;
    onChange?.(md);
  }, [onChange]);

  const runCmd = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    userEditedRef.current = true;
    emitChange();
  };

  const onInput = () => {
    userEditedRef.current = true;
    emitChange();
  };

  const tools = (
    <>
      <ToolbarButton title="Bold" icon="bold" onClick={() => runCmd("bold")} />
      <ToolbarButton title="Italic" icon="italic" onClick={() => runCmd("italic")} />
      <span className="cursor-doc-tool-divider" />
      <ToolbarButton title="Heading 1" icon="heading1" onClick={() => runCmd("formatBlock", "h1")} />
      <ToolbarButton title="Heading 2" icon="heading2" onClick={() => runCmd("formatBlock", "h2")} />
      <span className="cursor-doc-tool-divider" />
      <ToolbarButton title="Bullet list" icon="list" onClick={() => runCmd("insertUnorderedList")} />
      <ToolbarButton title="Numbered list" icon="listOrdered" onClick={() => runCmd("insertOrderedList")} />
      <ToolbarButton title="Quote" icon="quote" onClick={() => runCmd("formatBlock", "blockquote")} />
    </>
  );

  return (
    <div className={`cursor-doc-editor${name ? " has-name" : ""}`}>
      <div
        className={`cursor-doc-toolbar${name ? " has-name" : ""}`}
        role="toolbar"
        aria-label="Formatting"
      >
        {name ? (
          <>
            <div className="cursor-doc-toolbar-left">
              <span className="desk-image-viewer-name truncate" title={name}>
                {name}
              </span>
            </div>
            <div className="cursor-doc-toolbar-center">{tools}</div>
            <div className="cursor-doc-toolbar-right" />
          </>
        ) : (
          tools
        )}
      </div>
      <div className="cursor-doc-scroll">
        <div
          ref={editorRef}
          className="cursor-doc-page cursor-editor-md mos-md md-prose"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={onInput}
          onBlur={() => {
            if (userEditedRef.current) emitChange();
          }}
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
