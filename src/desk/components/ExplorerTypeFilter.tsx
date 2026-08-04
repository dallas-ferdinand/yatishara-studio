// @ts-nocheck
"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

export const EXPLORER_TYPE_FILTERS = [
  { id: "all", label: "All", icon: "layoutGrid" },
  { id: "image", label: "Images", icon: "image" },
  { id: "video", label: "Videos", icon: "play" },
  { id: "videoEdit", label: "Edits", icon: "studioProject" },
  { id: "document", label: "Scripts", icon: "fileText" },
  { id: "element", label: "Elements", icon: "user" },
  { id: "audio", label: "Audio", icon: "music" },
];

/** Creative Network stock-audio browse (Files → Asset library). */
export const NETWORK_AUDIO_TYPE_FILTERS = [
  { id: "all", label: "All", icon: "layoutGrid" },
  { id: "music", label: "Music", icon: "music" },
  { id: "sfx", label: "SFX", icon: "audioWaveform" },
];

/**
 * Labeled filter dropdown with leading icons in the menu (shared CursorSelect language).
 * Pass `options` for alternate sets (e.g. network audio All / Music / SFX).
 */
export function ExplorerTypeFilter({
  value = "all",
  onChange,
  options = EXPLORER_TYPE_FILTERS,
  ariaLabel = "Filter content",
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const list = options?.length ? options : EXPLORER_TYPE_FILTERS;
  const active = list.find((opt) => opt.id === value) ?? list[0];
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
        title={filtered ? `Filter: ${active.label}` : ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${active.label}` : ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={active.icon} size={13} />
        <span>{active.label}</span>
        <ArrowDown className="cursor-select-arrow" aria-hidden="true" />
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
        <div
          className="cursor-dropdown cursor-dropdown-down is-end desk-explorer-type-filter-menu"
          role="menu"
        >
          {list.map((opt) => (
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
