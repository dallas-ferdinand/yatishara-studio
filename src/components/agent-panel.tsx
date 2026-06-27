"use client";

import { useEffect, useRef } from "react";
import { Loader2, Square, User } from "lucide-react";
import type { ChatMessage, ChatThread } from "@/lib/types";
import { Composer } from "./composer";

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          isUser ? "bg-mos-accent/20 text-mos-accent" : "bg-mos-surface text-mos-muted"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">M</span>}
      </div>
      <div
        className={`max-w-[min(720px,85%)] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-mos-accent/12 text-mos-text-bright"
            : "border border-mos-border-soft bg-mos-panel text-mos-text"
        }`}
      >
        {message.streaming && !message.content ? (
          <span className="inline-flex items-center gap-2 text-mos-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </span>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
      </div>
    </div>
  );
}

type Props = {
  chat: ChatThread | null;
  streaming: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onDraft: (text: string) => void;
};

export function AgentPanel({ chat, streaming, onSend, onCancel, onDraft }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, chat?.messages.at(-1)?.content]);

  if (!chat) {
    return (
      <main className="flex flex-1 items-center justify-center bg-mos-bg text-mos-muted">
        Select or create a chat
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-mos-bg">
      <header className="flex items-center justify-between border-b border-mos-border-soft px-4 py-3">
        <div>
          <h2 className="truncate text-sm font-semibold text-mos-text-bright">{chat.title}</h2>
          <p className="text-xs text-mos-faint">mercuryos workspace</p>
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-md border border-mos-border px-2.5 py-1.5 text-xs text-mos-muted hover:bg-mos-hover hover:text-mos-text"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        ) : null}
      </header>

      <div className="mos-scroll flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {chat.messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mos-border px-6 py-10 text-center">
              <p className="text-sm text-mos-muted">Ask the agent anything about MercuryOS or Yatishara.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  "Check gateway health",
                  "Open pipeline summary",
                  "What changed recently?",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onSend(chip)}
                    className="rounded-full border border-mos-border bg-mos-surface px-3 py-1 text-xs text-mos-text hover:border-mos-accent/40"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        draft={chat.composerDraft ?? ""}
        disabled={streaming}
        onDraft={onDraft}
        onSend={onSend}
      />
    </main>
  );
}
