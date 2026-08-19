"use client";

import { Download, LoaderCircle, RotateCcw, Upload, X } from "lucide-react";
import { StudioFloatingOverlay } from "@/studio/components/StudioFloatingOverlay";

export type StudioFileTransfer = {
  id: string;
  direction: "upload" | "download";
  name: string;
  status: "queued" | "active" | "done" | "error";
  loaded: number;
  total: number;
  detail?: string;
  error?: string;
};

function byteLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function StudioFileTransferTray({
  transfers,
  onCancel,
  onDismiss,
  onRetry,
  floating = false,
}: {
  transfers: StudioFileTransfer[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onRetry: (id: string) => void;
  floating?: boolean;
}) {
  if (!transfers.length) return null;
  const tray = (
    <section
      className={`studio-file-transfer-tray shrink-0${floating ? " is-floating" : ""}`}
      aria-label="File transfers"
    >
      {transfers.map((transfer) => {
        const progress =
          transfer.status === "done"
            ? 100
            : transfer.total > 0
              ? Math.min(99, Math.round((transfer.loaded / transfer.total) * 100))
              : 0;
        const active = transfer.status === "active" || transfer.status === "queued";
        const label =
          transfer.status === "error"
            ? transfer.error || "Transfer failed"
            : transfer.status === "done"
              ? `Done · ${transfer.name}`
              : transfer.status === "queued"
                ? transfer.detail || `Waiting · ${transfer.name}`
                : transfer.detail || transfer.name;
        const bytes =
          active && transfer.loaded > 0
            ? transfer.total > 0
              ? `${byteLabel(transfer.loaded)} / ${byteLabel(transfer.total)}`
              : byteLabel(transfer.loaded)
            : "";
        return (
          <div
            key={transfer.id}
            className={`studio-file-transfer is-${transfer.status}`}
            title={label}
          >
            <div
              className={`studio-file-transfer-progress${active && !transfer.total ? " is-indeterminate" : ""}`}
              style={active && transfer.total ? { width: `${progress}%` } : undefined}
            />
            <span className="studio-file-transfer-icon" aria-hidden="true">
              {active ? (
                <LoaderCircle size={13} className="studio-file-transfer-spinner" />
              ) : transfer.direction === "upload" ? (
                <Upload size={13} />
              ) : (
                <Download size={13} />
              )}
            </span>
            <span className="studio-file-transfer-label">{label}</span>
            {bytes ? <span className="studio-file-transfer-bytes">{bytes}</span> : null}
            {transfer.status === "error" ? (
              <button type="button" onClick={() => onRetry(transfer.id)} aria-label="Retry transfer">
                <RotateCcw size={12} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (active ? onCancel(transfer.id) : onDismiss(transfer.id))}
              aria-label={active ? "Cancel transfer" : "Dismiss transfer"}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </section>
  );
  if (!floating) return tray;
  return (
    <StudioFloatingOverlay label="File transfers">
      {tray}
    </StudioFloatingOverlay>
  );
}
