// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";

/** Compact delete confirm — same footprint as the explorer context menu. */
export function ExplorerDeleteConfirm({
  target,
  busy = false,
  error = "",
  onClose,
  onConfirm,
}) {
  const panelRef = useRef(null);
  const open = Boolean(target) && typeof document !== "undefined";
  const pos = useFloatingMenuPosition(target?.x ?? 0, target?.y ?? 0, panelRef, open, [
    target?.name,
    target?.isDir,
    busy,
    error,
  ]);

  useEffect(() => {
    if (!target) return;
    const onDoc = (e) => {
      if (e.type === "contextmenu") return;
      if (panelRef.current?.contains(e.target)) return;
      if (busy) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("scroll", onDoc, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [target, busy, onClose]);

  if (!open) return null;

  const { name, isDir } = target;
  const question = isDir ? "Delete this folder?" : "Delete this file?";

  const stopInside = (e) => {
    e.stopPropagation();
  };

  return createPortal(
    <div
      ref={panelRef}
      className="desk-explorer-delete-confirm"
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-explorer-delete-title"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={stopInside}
      onPointerDown={stopInside}
    >
      <p id="desk-explorer-delete-title" className="desk-explorer-delete-confirm-title">
        {question}
      </p>
      <p className="desk-explorer-delete-confirm-name" title={name}>
        {name}
      </p>
      {isDir ? (
        <p className="desk-explorer-delete-confirm-hint">Everything inside will be removed.</p>
      ) : null}
      {error ? <p className="desk-explorer-delete-confirm-error">{error}</p> : null}
      <div className="desk-explorer-delete-confirm-actions">
        <button
          type="button"
          className="desk-explorer-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="desk-explorer-delete-btn is-danger"
          onClick={(e) => {
            e.stopPropagation();
            void onConfirm?.();
          }}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
