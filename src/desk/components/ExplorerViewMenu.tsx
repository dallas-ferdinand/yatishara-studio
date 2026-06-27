// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

const VIEW_OPTIONS = [
  { id: "list", label: "List view", icon: "layoutList" },
  { id: "grid", label: "Grid view", icon: "layoutGrid" },
  { id: "preview", label: "Preview view", icon: "layoutPreview" },
];

export function ExplorerViewMenu({ viewMode, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = VIEW_OPTIONS.find((v) => v.id === viewMode) ?? VIEW_OPTIONS[0];

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
    <div className="desk-explorer-view-menu" ref={wrapRef}>
      <button
        type="button"
        className={`cursor-icon-btn${open ? " active" : ""}`}
        title={`View: ${active.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={active.icon} size={15} />
      </button>
      {open ? (
        <div className="desk-explorer-view-dropdown" role="menu">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              className={`cursor-dropdown-item${viewMode === opt.id ? " active" : ""}`}
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
