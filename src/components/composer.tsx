"use client";

import { useRef } from "react";
import { ArrowUp } from "lucide-react";

type Props = {
  draft: string;
  disabled?: boolean;
  onDraft: (text: string) => void;
  onSend: (text: string) => void;
};

export function Composer({ draft, disabled, onDraft, onSend }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    ref.current?.focus();
  };

  return (
    <div className="border-t border-mos-border-soft bg-mos-composer px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-mos-border bg-mos-panel p-2 focus-within:border-mos-accent/50">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            onDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message agent…"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-mos-text outline-none placeholder:text-mos-faint disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || !draft.trim()}
          onClick={submit}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mos-accent text-[#1b1c23] transition hover:bg-mos-accent-hover disabled:opacity-40"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-mos-faint">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
