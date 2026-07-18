// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

export const EXPLORER_TYPE_FILTERS = [
  { id: "all", label: "All", icon: "layoutGrid" },
  { id: "image", label: "Images", icon: "image" },
  { id: "video", label: "Videos", icon: "play" },
  { id: "videoEdit", label: "Edits", icon: "clapperboard" },
  { id: "document", label: "Scripts", icon: "fileText" },
  { id: "element", label: "Elements", icon: "user" },
  { id: "audio", label: "Audio", icon: "music" },
];

export function ExplorerTypeFilter({ value = "all", onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = EXPLORER_TYPE_FILTERS.find((opt) => opt.id === value) ?? EXPLORER_TYPE_FILTERS[0];
  const filtered = value !== "all";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="desk-explorer-type-filter" ref={wrapRef}>
      <button
        type="button"
        className={`desk-explorer-type-filter-trigger${filtered ? " is-active" : ""}${open ? " is-open" : ""}`}
        title={filtered ? `Filter: ${active.label}` : "Filter content"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${active.label}` : "Filter content"}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={active.icon} size={13} />
        <span>{active.label}</span>
        <Icon name="chevDown" size={11} />
      </button>
      {filtered ? (
        <button
          type="button"
          className="desk-explorer-type-filter-clear"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={(e) => {
            e.stopPropagation();
            onChange?.("all");
            setOpen(false);
          }}
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
      {open ? (
        <div className="desk-explorer-type-filter-menu" role="menu">
          {EXPLORER_TYPE_FILTERS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === opt.id}
              className={`cursor-dropdown-item${value === opt.id ? " active" : ""}`}
              onClick={() => {
                onChange?.(opt.id);
                setOpen(false);
              }}
            >
              <Icon name={opt.icon} size={14} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
