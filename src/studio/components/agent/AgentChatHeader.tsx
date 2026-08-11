"use client";

import { useEffect, useRef, useState } from "react";
import { Hammer } from "lucide-react";

type AgentChatHeaderProps = {
  title: string;
  busy?: boolean;
  sidebarOpen?: boolean;
  onRename: (title: string) => Promise<void> | void;
  onToggleSidebar: () => void;
};

export function AgentChatHeader({
  title,
  busy,
  sidebarOpen,
  onRename,
  onToggleSidebar,
}: AgentChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim() || title;
    setEditing(false);
    if (next !== title) await onRename(next);
    else setDraft(title);
  }

  return (
    <header className="studio-agent-chat-head">
      <div className="studio-agent-chat-head-main">
        {editing ? (
          <input
            ref={inputRef}
            className="studio-agent-chat-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
              if (e.key === "Escape") {
                setDraft(title);
                setEditing(false);
              }
            }}
            aria-label="Chat name"
          />
        ) : (
          <button
            type="button"
            className="studio-agent-chat-title"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {title || "Agent chat"}
          </button>
        )}
        {busy ? (
          <span className="studio-agent-chat-busy" aria-label="Working">
            <i className="studio-agent-spin" />
          </span>
        ) : null}
      </div>
      <div className="cursor-panel-head-tools studio-agent-chat-head-tools">
        <button
          type="button"
          className={`studio-composer-circle-btn${sidebarOpen ? " is-on" : ""}`}
          aria-label={sidebarOpen ? "Close Action" : "Action"}
          aria-pressed={Boolean(sidebarOpen)}
          title={sidebarOpen ? "Close Action" : "Action"}
          onClick={onToggleSidebar}
        >
          <Hammer size={13} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
