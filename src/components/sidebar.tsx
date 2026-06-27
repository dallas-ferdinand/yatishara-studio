"use client";

import { MessageSquarePlus, PanelLeft } from "lucide-react";
import type { ChatThread } from "@/lib/types";

type Props = {
  chats: ChatThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ chats, activeId, onSelect, onNew, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-mos-border-soft bg-mos-sidebar py-3">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-2 text-mos-muted hover:bg-mos-hover hover:text-mos-text"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNew}
          className="mt-2 rounded-lg p-2 text-mos-accent hover:bg-mos-hover"
          aria-label="New chat"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-mos-border-soft bg-mos-sidebar">
      <div className="flex items-center justify-between border-b border-mos-border-soft px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-mos-faint">Chats</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onNew}
            className="rounded-md p-1.5 text-mos-muted hover:bg-mos-hover hover:text-mos-accent"
            aria-label="New chat"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-mos-muted hover:bg-mos-hover hover:text-mos-text"
            aria-label="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
      <nav className="mos-scroll flex-1 overflow-y-auto p-2">
        {chats.map((chat) => {
          const active = chat.id === activeId;
          const live = chat.status === "streaming";
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat.id)}
              className={`mb-1 flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                active ? "bg-mos-active text-mos-text-bright" : "text-mos-text hover:bg-mos-hover"
              }`}
            >
              <span className="truncate text-sm font-medium">{chat.title}</span>
              <span className="truncate text-xs text-mos-muted">
                {live ? "Running…" : chat.messages.at(-1)?.content.slice(0, 48) || "Empty"}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
