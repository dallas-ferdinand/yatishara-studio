// @ts-nocheck
"use client";

import { useEffect } from "react";
import { Icon } from "./Icons";

export type MobileSheetAction = {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
};

export function MobileActionSheet({
  open,
  title,
  subtitle,
  actions,
  onClose,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  actions: MobileSheetAction[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="desk-mobile-sheet" role="dialog" aria-modal="true" aria-label={title ?? "Actions"}>
      <button type="button" className="desk-mobile-sheet-backdrop" onClick={onClose} aria-label="Dismiss" />
      <div className="desk-mobile-sheet-panel">
        {title ? (
          <header className="desk-mobile-sheet-head">
            <span className="desk-mobile-sheet-title truncate">{title}</span>
            {subtitle ? <span className="desk-mobile-sheet-sub truncate">{subtitle}</span> : null}
          </header>
        ) : null}
        <div className="desk-mobile-sheet-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`desk-mobile-sheet-action${action.destructive ? " is-destructive" : ""}`}
              onClick={() => {
                action.onPress();
                if (action.id !== "delete") onClose();
              }}
            >
              {action.icon ? (
                <Icon name={action.icon} size={18} className="desk-mobile-sheet-action-icon" />
              ) : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="desk-mobile-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
