"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  DM_LABEL_ICON_OPTIONS,
  dmLabelIcon,
} from "@/studio/lib/dmLabelIcons";

type LabelId = Id<"dmLabels">;
type UserId = Id<"users">;

export function StudioDmLabelEditorDialog({
  open,
  labelId,
  initialName,
  initialIcon,
  onClose,
  /** Overlay sits over the sidebar header; modal is the old centered dialog. */
  variant = "overlay",
}: {
  open: boolean;
  labelId?: LabelId;
  initialName?: string;
  initialIcon?: string;
  onClose: () => void;
  variant?: "overlay" | "modal";
}) {
  const createLabel = useMutation(api.dmLabels.create);
  const updateLabel = useMutation(api.dmLabels.update);
  const removeLabel = useMutation(api.dmLabels.remove);
  const [name, setName] = useState(initialName ?? "");
  const [icon, setIcon] = useState(initialIcon ?? "tag");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setIcon(initialIcon ?? "tag");
    setError("");
    setBusy(false);
  }, [open, initialName, initialIcon]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (labelId) {
        await updateLabel({ labelId, name, icon });
      } else {
        await createLabel({ name, icon });
      }
      onClose();
    } catch (err) {
      setError(friendlyConvexError(err, "Could not save label"));
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!labelId) return;
    if (!window.confirm("Delete this label? People stay in your chats.")) return;
    setBusy(true);
    setError("");
    try {
      await removeLabel({ labelId });
      onClose();
    } catch (err) {
      setError(friendlyConvexError(err, "Could not delete label"));
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <div
      className={
        variant === "overlay" ? "studio-dm-label-editor-panel" : "studio-dm-dialog"
      }
      role="dialog"
      aria-modal="true"
      aria-label={labelId ? "Edit label" : "New label"}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="studio-dm-dialog-head">
        <strong>{labelId ? "Edit label" : "New label"}</strong>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="studio-dm-dialog-body">
        <label className="studio-dm-dialog-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={40}
            placeholder="e.g. Clients"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
        </label>
        <div className="studio-dm-dialog-field">
          <span>Icon</span>
          <div className="studio-dm-icon-grid" role="listbox" aria-label="Label icon">
            {DM_LABEL_ICON_OPTIONS.map(({ key, Icon, label }) => {
              const active = icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`studio-dm-icon-opt${active ? " is-active" : ""}`}
                  title={label}
                  onClick={() => setIcon(key)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        {error ? <p className="studio-dm-error">{error}</p> : null}
      </div>
      <footer className="studio-dm-dialog-foot">
        {labelId ? (
          <button
            type="button"
            className="studio-dm-dialog-danger"
            onClick={() => void destroy()}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="studio-dm-dialog-actions">
          <button type="button" className="studio-dm-dialog-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="studio-dm-dialog-primary"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {labelId ? "Save" : "Create"}
          </button>
        </div>
      </footer>
    </div>
  );

  if (variant === "overlay") {
    return (
      <div
        className="studio-dm-label-editor-overlay"
        role="presentation"
        onClick={onClose}
      >
        {panel}
      </div>
    );
  }

  return (
    <div className="studio-dm-dialog-backdrop" role="presentation" onClick={onClose}>
      {panel}
    </div>
  );
}

export function StudioDmAssignLabelsDialog({
  open,
  peerUserId,
  peerLabel,
  onClose,
}: {
  open: boolean;
  peerUserId: UserId | null;
  peerLabel: string;
  onClose: () => void;
}) {
  const labels = useQuery(api.dmLabels.listMine, open ? {} : "skip");
  const assigned = useQuery(
    api.dmLabels.listForPeer,
    open && peerUserId ? { peerUserId } : "skip",
  );
  const setPeerLabels = useMutation(api.dmLabels.setPeerLabels);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || assigned === undefined) return;
    setSelected(new Set(assigned.map((row) => row.labelId)));
    setError("");
    setBusy(false);
  }, [open, assigned]);

  if (!open || !peerUserId) return null;

  function toggle(labelId: LabelId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await setPeerLabels({
        peerUserId: peerUserId!,
        labelIds: [...selected] as LabelId[],
      });
      onClose();
    } catch (err) {
      setError(friendlyConvexError(err, "Could not update labels"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-dm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="studio-dm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Labels for ${peerLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="studio-dm-dialog-head">
          <strong>Labels · {peerLabel}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="studio-dm-dialog-body">
          {labels === undefined || assigned === undefined ? (
            <p className="studio-dm-empty">Loading…</p>
          ) : labels.length === 0 ? (
            <p className="studio-dm-empty">
              Create a label first, then assign people to it.
            </p>
          ) : (
            <ul className="studio-dm-assign-list">
              {labels.map((label) => {
                const Icon = dmLabelIcon(label.icon);
                const checked = selected.has(label.labelId);
                return (
                  <li key={label.labelId}>
                    <button
                      type="button"
                      className={`studio-dm-assign-row${checked ? " is-on" : ""}`}
                      onClick={() => toggle(label.labelId)}
                      aria-pressed={checked}
                    >
                      <span className="studio-dm-assign-icon" aria-hidden="true">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="studio-dm-assign-name">{label.name}</span>
                      <span className="studio-dm-assign-check" aria-hidden="true">
                        {checked ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? <p className="studio-dm-error">{error}</p> : null}
        </div>
        <footer className="studio-dm-dialog-foot">
          <span />
          <div className="studio-dm-dialog-actions">
            <button type="button" className="studio-dm-dialog-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="studio-dm-dialog-primary"
              onClick={() => void save()}
              disabled={busy || labels === undefined}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
