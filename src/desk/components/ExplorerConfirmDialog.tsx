// @ts-nocheck
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";

export function ExplorerConfirmDialog({
  open,
  title = "Confirm",
  message,
  detail,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  error = "",
  destructive = true,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="desk-explorer-dialog-backdrop"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`desk-explorer-dialog${destructive ? " is-destructive" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="desk-explorer-confirm-title"
        aria-describedby="desk-explorer-confirm-message"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="desk-explorer-dialog-head">
          <h2 id="desk-explorer-confirm-title">{title}</h2>
          <button
            type="button"
            className="desk-explorer-dialog-close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <p id="desk-explorer-confirm-message" className="desk-explorer-dialog-message">
          {message}
        </p>
        {detail ? <p className="desk-explorer-dialog-detail">{detail}</p> : null}
        {error ? <p className="desk-explorer-dialog-error">{error}</p> : null}

        <footer className="desk-explorer-dialog-actions">
          <button type="button" className="desk-explorer-dialog-btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`desk-explorer-dialog-btn${destructive ? " is-danger" : " is-primary"}`}
            onClick={() => void onConfirm?.()}
            disabled={busy}
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
