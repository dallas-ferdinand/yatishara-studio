// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { highlightCodeHtml } from "@/desk/lib/code-highlight";

export function CodeEditor({ value, path, onChange, onSave }) {
  const taRef = useRef(null);
  const highlightRef = useRef(null);

  const highlighted = useMemo(() => highlightCodeHtml(value, path), [value, path]);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta || !highlightRef.current) return;
    highlightRef.current.scrollTop = ta.scrollTop;
    highlightRef.current.scrollLeft = ta.scrollLeft;
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.addEventListener("scroll", syncScroll);
    return () => ta.removeEventListener("scroll", syncScroll);
  }, [syncScroll]);

  return (
    <div className="cursor-code-editor">
      <div className="cursor-code-stack">
        <pre ref={highlightRef} className="cursor-code-highlight" aria-hidden>
          <code dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
        </pre>
        <textarea
          ref={taRef}
          className="cursor-editor-textarea cursor-code-input"
          spellCheck={false}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              onSave?.();
              return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
              const ta = e.currentTarget;
              const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
              if (sel) {
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("desk-add-selection", {
                    detail: { text: sel, path: path ?? "", source: "editor" },
                  }),
                );
              }
            }
          }}
        />
      </div>
    </div>
  );
}
