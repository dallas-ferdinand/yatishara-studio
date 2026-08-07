"use client";

import { ArrowDown, Circle, Clock, Mail, MailOpen, MessagesSquare, X } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Icon } from "@/desk/components/Icons";

export type StudioDmChatFilterId =
  | "all"
  | "unread"
  | "read"
  | "online"
  | "awaiting";

type FilterOption = {
  id: StudioDmChatFilterId;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
};

export const STUDIO_DM_CHAT_FILTERS: FilterOption[] = [
  { id: "all", label: "All chats", icon: MessagesSquare },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "read", label: "Read", icon: MailOpen },
  { id: "online", label: "Online now", icon: Circle },
  { id: "awaiting", label: "Awaiting reply", icon: Clock },
];

/** Compact chat-list filter — same chrome as Files / comments type dropdown. */
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
    <div className="desk-explorer-type-filter studio-dm-chat-filter" ref={wrapRef}>
      <button
        type="button"
        className={`desk-explorer-type-filter-trigger${filtered ? " is-active" : ""}${open ? " is-open" : ""}`}
        title={filtered ? `Filter: ${active.label}` : "Filter chats"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${active.label}` : "Filter chats"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="sliders" size={13} />
        <span>{active.label}</span>
        <ArrowDown className="cursor-select-arrow" aria-hidden={true} />
      </button>
      {filtered ? (
        <button
          type="button"
          className="desk-explorer-type-filter-clear"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={(event) => {
            event.stopPropagation();
            onChange("all");
            setOpen(false);
          }}
        >
          <X aria-hidden={true} />
        </button>
      ) : null}
      {open ? (
        <div
          className="cursor-dropdown cursor-dropdown-down is-end desk-explorer-type-filter-menu studio-dm-chat-filter-menu"
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
