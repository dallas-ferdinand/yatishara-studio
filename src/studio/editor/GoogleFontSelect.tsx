"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, Search } from "lucide-react";
import catalog from "./fonts/google-fonts-catalog.json";
import { SYSTEM_FONT_OPTIONS } from "./textLayout";
import { isLegacySystemFont, loadGoogleFont } from "./loadGoogleFont";

type FontEntry = { family: string; category: string };

const GOOGLE = catalog as FontEntry[];

type GoogleFontSelectProps = {
  value: string;
  onChange: (family: string) => void;
};

export function GoogleFontSelect({ value, onChange }: GoogleFontSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const label = useMemo(() => {
    const system = SYSTEM_FONT_OPTIONS.find((item) => item.id === value);
    return system?.label ?? value;
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GOOGLE;
    return GOOGLE.filter((item) => item.family.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (isLegacySystemFont(value)) return;
    void loadGoogleFont(value);
  }, [value]);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = Math.min(320, Math.max(rect.width, 240));
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left));
    const panelH = Math.min(480, window.innerHeight * 0.78);
    let top = rect.bottom + 6;
    if (top + panelH > window.innerHeight) top = Math.max(8, rect.top - panelH);
    setPos({ top, left, width });
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (family: string) => {
    if (!isLegacySystemFont(family)) {
      await loadGoogleFont(family);
    }
    onChange(family);
    setOpen(false);
  };

  // Warm first visible google fonts when searching settles
  useEffect(() => {
    if (!open) return;
    const slice = filtered.slice(0, 24);
    let cancelled = false;
    void (async () => {
      for (const item of slice) {
        if (cancelled) return;
        await loadGoogleFont(item.family);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, filtered]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="studio-editor-font-select"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className="studio-editor-font-select-label truncate"
          style={
            isLegacySystemFont(value)
              ? undefined
              : { fontFamily: `"${value}", system-ui, sans-serif` }
          }
        >
          {label}
        </span>
        <ArrowDown size={14} aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="studio-editor-font-panel"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              role="listbox"
              aria-label="Font family"
            >
              <div className="studio-editor-font-search">
                <Search size={14} aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search fonts"
                  aria-label="Search fonts"
                />
              </div>
              <div className="studio-editor-font-list">
                <div className="studio-editor-font-group-label">System</div>
                {SYSTEM_FONT_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={value === item.id}
                    className={`studio-editor-font-option${value === item.id ? " is-active" : ""}`}
                    onClick={() => void pick(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
                <div className="studio-editor-font-group-label">
                  Google Fonts · {filtered.length}
                </div>
                {filtered.slice(0, 400).map((item) => (
                  <button
                    key={item.family}
                    type="button"
                    role="option"
                    aria-selected={value === item.family}
                    className={`studio-editor-font-option${value === item.family ? " is-active" : ""}`}
                    style={{ fontFamily: `"${item.family}", system-ui, sans-serif` }}
                    onClick={() => void pick(item.family)}
                    onMouseEnter={() => void loadGoogleFont(item.family)}
                  >
                    {item.family}
                  </button>
                ))}
                {filtered.length > 400 ? (
                  <p className="studio-editor-font-more-hint">
                    Type to narrow {filtered.length - 400} more fonts
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
