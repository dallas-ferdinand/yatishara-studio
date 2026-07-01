// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { sanitizeEntryName, uniqueName, entryNamesSet } from "@/desk/lib/explorer-create";
import { displayWorkspacePath } from "@/desk/lib/display-path";

export function ExplorerRenameDialog({
  open,
  entry,
  entries = [],
  onClose,
  onRename,
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentName = entry?.name ?? entry?.path?.split("/").pop() ?? "";
  const isDir = entry?.type === "dir";

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError("");
    setName(currentName);
  }, [open, currentName]);

  if (!open || !entry?.path || typeof document === "undefined") return null;

  const submit = async () => {
    setError("");
    const trimmed = sanitizeEntryName(name);
    if (trimmed === currentName) {
      onClose?.();
      return;
    }
    setBusy(true);
    try {
      const exists = entryNamesSet(entries);
      exists.delete(String(currentName).toLowerCase());
      const finalName = uniqueName(trimmed, exists);
      await onRename?.(entry.path, finalName);
      onClose?.();
    } catch (err) {
      setError(err?.message ?? "Could not rename");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="desk-explorer-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div
        className="desk-explorer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Rename"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="desk-explorer-dialog-head">
          <h2>Rename {isDir ? "folder" : "file"}</h2>
          <p className="desk-explorer-dialog-sub">{displayWorkspacePath(entry.path)}</p>
          <button type="button" className="desk-explorer-dialog-close" aria-label="Close" onClick={onClose} disabled={busy}>
            <Icon name="x" size={14} />
          </button>
        </header>

        <label className="desk-explorer-dialog-field">
          <span className="desk-explorer-dialog-label">Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape" && !busy) onClose?.();
            }}
          />
        </label>

        {error ? <p className="desk-explorer-dialog-error">{error}</p> : null}

        <footer className="desk-explorer-dialog-actions">
          <button type="button" className="desk-explorer-dialog-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="desk-explorer-dialog-btn is-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Renaming…" : "Rename"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
