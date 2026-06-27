// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { NEW_FILE_TYPES, sanitizeEntryName, uniqueName, entryNamesSet } from "@/desk/lib/explorer-create";

export function ExplorerCreateDialog({
  open,
  mode = "file",
  destDir = "",
  entries = [],
  onClose,
  onCreateFile,
  onCreateFolder,
}) {
  const [fileTypeId, setFileTypeId] = useState("md");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fileType = useMemo(
    () => NEW_FILE_TYPES.find((t) => t.id === fileTypeId) ?? NEW_FILE_TYPES[0],
    [fileTypeId],
  );

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError("");
    if (mode === "folder") {
      setName("New folder");
      return;
    }
    setFileTypeId("md");
    setName(NEW_FILE_TYPES[0].defaultName);
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode !== "file") return;
    setName(fileType.defaultName);
  }, [open, mode, fileTypeId, fileType.defaultName]);

  if (!open || typeof document === "undefined") return null;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const exists = entryNamesSet(entries);
      const finalName = uniqueName(name, exists);
      if (mode === "folder") {
        await onCreateFolder?.(finalName);
      } else {
        await onCreateFile?.(finalName, fileType);
      }
      onClose?.();
    } catch (err) {
      setError(err?.message ?? "Could not create");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "folder" ? "New folder" : "New file";
  const dest = destDir ? destDir : "Files";

  return createPortal(
    <div className="desk-explorer-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className="desk-explorer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="desk-explorer-dialog-head">
          <h2>{title}</h2>
          <p className="desk-explorer-dialog-sub">In {dest}</p>
          <button type="button" className="desk-explorer-dialog-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </header>

        {mode === "file" ? (
          <div className="desk-explorer-dialog-types">
            <span className="desk-explorer-dialog-label">File type</span>
            <div className="desk-explorer-dialog-type-grid">
              {NEW_FILE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`desk-explorer-dialog-type${fileTypeId === t.id ? " is-active" : ""}`}
                  onClick={() => setFileTypeId(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="desk-explorer-dialog-field">
          <span className="desk-explorer-dialog-label">Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") onClose?.();
            }}
          />
        </label>

        {error ? <p className="desk-explorer-dialog-error">{error}</p> : null}

        <footer className="desk-explorer-dialog-actions">
          <button type="button" className="desk-explorer-dialog-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="desk-explorer-dialog-btn is-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
