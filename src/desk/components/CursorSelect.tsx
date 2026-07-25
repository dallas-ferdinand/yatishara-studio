"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icons";

export type CursorSelectOption = {
  value: string;
  label: string;
};

type CursorSelectProps = {
  value: string;
  options?: CursorSelectOption[];
  onChange?: (value: string) => void;
  ariaLabel?: string;
  align?: "start" | "end";
  /** Bordered full-width field (sidebars/forms). Default is a ghost chrome control. */
  variant?: "ghost" | "field";
  className?: string;
  disabled?: boolean;
};

/**
 * Compact themed select — same menu language as explorer filters
 * (.cursor-dropdown / .cursor-dropdown-item).
 * Root class is cursor-select-menu (not cursor-select) so native
 * select.cursor-select styles never paint a second box around it.
 */
export function CursorSelect({
  value,
  options = [],
  onChange,
  ariaLabel,
  align = "end",
  variant = "ghost",
  className = "",
  disabled = false,
}: CursorSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const active = options.find((opt) => opt.value === value) ?? options[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
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
    <div
      className={`cursor-select-menu${variant === "field" ? " is-field" : ""}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className="cursor-select-trigger"
        disabled={disabled}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="cursor-select-label">{active?.label ?? "Select"}</span>
        <Icon name="chevDown" size={11} />
      </button>
      {open ? (
        <div
          id={listId}
          className={`cursor-dropdown cursor-dropdown-down${align === "end" ? " is-end" : " is-start"}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`cursor-dropdown-item${selected ? " active" : ""}`}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
