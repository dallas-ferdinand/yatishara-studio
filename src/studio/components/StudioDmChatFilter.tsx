"use client";

import {
  ChevronDown,
  Circle,
  Clock,
  ListFilter,
  Mail,
  MailOpen,
  MessagesSquare,
} from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

export type StudioDmChatFilterId =
  | "all"
  | "unread"
  | "read"
  | "online"
  | "awaiting";

type FilterOption = {
  id: StudioDmChatFilterId;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
};

export const STUDIO_DM_CHAT_FILTERS: FilterOption[] = [
  { id: "all", label: "All chats", icon: MessagesSquare },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "read", label: "Read", icon: MailOpen },
  { id: "online", label: "Online now", icon: Circle },
  { id: "awaiting", label: "Awaiting reply", icon: Clock },
];

/** Compact chat-list filter, mirroring the file-manager type dropdown. */
export function StudioDmChatFilter({
  value,
  onChange,
}: {
  value: StudioDmChatFilterId;
  onChange: (value: StudioDmChatFilterId) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const active =
    STUDIO_DM_CHAT_FILTERS.find((opt) => opt.id === value) ??
    STUDIO_DM_CHAT_FILTERS[0]!;
  const filtered = value !== "all";

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="studio-dm-chat-filter" ref={wrapRef}>
      <button
        type="button"
        className={`studio-dm-chat-filter-trigger${filtered ? " is-active" : ""}${open ? " is-open" : ""}`}
        title={filtered ? `Filter: ${active.label}` : "Filter chats"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${active.label}` : "Filter chats"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <ListFilter aria-hidden={true} />
        <span>{filtered ? active.label : "Filter"}</span>
        <ChevronDown className="cursor-select-arrow" aria-hidden={true} />
      </button>
      {open ? (
        <div
          className="cursor-dropdown cursor-dropdown-down is-end studio-dm-chat-filter-menu"
          role="menu"
        >
          {STUDIO_DM_CHAT_FILTERS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === opt.id}
              className={`cursor-dropdown-item${value === opt.id ? " active" : ""}${opt.id === "online" ? " is-online" : ""}`}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            >
              {createElement(opt.icon, { "aria-hidden": true })}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
