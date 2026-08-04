"use client";

import { useEffect, type ComponentType, type ReactNode } from "react";
import { Loader2, type LucideProps } from "lucide-react";

export type StudioConfirmOverlayProps = {
  open: boolean;
  title: string;
  body?: string;
  icon?: ComponentType<LucideProps>;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirm (trash / permanent delete). */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

/**
 * Full-screen confirm — same chrome as payment / push overlays.
 * Never use window.confirm for Studio Files (or future Studio confirms).
 */
export function StudioConfirmOverlay({
  open,
  title,
  body,
  icon: Icon,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: StudioConfirmOverlayProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="studio-payment-celebration"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-confirm-overlay-title"
      aria-busy={busy}
    >
      <div className="studio-payment-celebration-inner">
        {busy ? (
          <Loader2 className="studio-payment-celebration-spin" aria-hidden="true" />
        ) : Icon ? (
          <Icon
            className={`studio-confirm-overlay-icon${danger ? " is-danger" : ""}`}
            aria-hidden="true"
            strokeWidth={1.75}
          />
        ) : null}
        <h2 id="studio-confirm-overlay-title" className="studio-payment-celebration-title">
          {title}
        </h2>
        {body ? <p className="studio-payment-celebration-copy">{body}</p> : null}
        {children}
        <div className="studio-payment-celebration-actions">
          <button
            type="button"
            className="studio-payment-celebration-btn is-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`studio-payment-celebration-btn${danger ? " is-danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
