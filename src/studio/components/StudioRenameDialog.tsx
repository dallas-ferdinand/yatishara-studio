"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function stripRenameExt(name: string, studioKind?: string) {
  let next = String(name ?? "").replace(/^@/, "");
  if (studioKind === "document") next = next.replace(/\.md$/i, "");
  if (studioKind === "videoEdit") next = next.replace(/\.edit$/i, "");
  return next;
}

export function StudioRenameDialog({
  open,
  entry,
  onClose,
  onRename,
}: {
  open: boolean;
  entry: { name?: string; studioKind?: string; type?: string } | null;
  onClose: () => void;
  onRename: (nextName: string) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentName = stripRenameExt(entry?.name ?? "", entry?.studioKind);
  const isFolder = entry?.studioKind === "folder" || entry?.type === "dir";

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError("");
    setName(currentName);
  }, [open, currentName]);

  if (!open || !entry || typeof document === "undefined") return null;

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRename(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="desk-explorer-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="desk-explorer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Rename"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="desk-explorer-dialog-head">
          <h2>Rename {isFolder ? "folder" : "file"}</h2>
          <button
            type="button"
            className="desk-explorer-dialog-close"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </header>

        <label className="desk-explorer-dialog-field">
          <span className="desk-explorer-dialog-label">Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              if (event.key === "Escape" && !busy) onClose();
            }}
          />
        </label>

        {error ? <p className="desk-explorer-dialog-error">{error}</p> : null}

        <footer className="desk-explorer-dialog-actions">
          <button type="button" className="desk-explorer-dialog-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="desk-explorer-dialog-btn is-primary"
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
          >
            {busy ? "Renaming…" : "Rename"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
