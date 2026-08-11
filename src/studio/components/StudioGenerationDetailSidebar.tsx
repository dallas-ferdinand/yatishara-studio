"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Copy,
  Expand,
  Film,
  FolderOpen,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { GenerationLibraryTile } from "./StudioGenerationTile";

type StudioGenerationDetailSidebarProps = {
  jobId?: Id<"generationJobs"> | null;
  assetId?: Id<"assets"> | null;
  expiresUnix: number;
  isMobile?: boolean;
  onClose: () => void;
  onUpscale?: (tile: GenerationLibraryTile) => void;
  onGenerateVideo?: (tile: GenerationLibraryTile) => void;
  onOpenInFiles?: (assetId: Id<"assets">, folderId?: Id<"folders">) => void;
  onTrash?: (assetId: Id<"assets">) => void;
};

function formatWhen(ms: number) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function toTile(detail: {
  jobId: string;
  assetId?: string;
  kind: "image" | "video" | "audio";
  name: string;
  createdAt: number;
  updatedAt: number;
  stage: GenerationLibraryTile["stage"];
  mode: "image" | "video" | "audio";
  folderId?: string;
  thumbnailUrl?: string;
  playableUrl?: string;
}): GenerationLibraryTile {
  return {
    jobId: detail.jobId,
    assetId: detail.assetId,
    kind: detail.kind,
    name: detail.name,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    stage: detail.stage,
    mode: detail.mode,
    folderId: detail.folderId,
    thumbnailUrl: detail.thumbnailUrl,
    playableUrl: detail.playableUrl,
  };
}

export function StudioGenerationDetailSidebar({
  jobId,
  assetId,
  expiresUnix,
  isMobile,
  onClose,
  onUpscale,
  onGenerateVideo,
  onOpenInFiles,
  onTrash,
}: StudioGenerationDetailSidebarProps) {
  const detail = useQuery(
    api.generationLibrary.getGenerationDetail,
    jobId || assetId
      ? {
          ...(jobId ? { jobId } : {}),
          ...(assetId ? { assetId } : {}),
          expiresUnix,
        }
      : "skip",
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyPrompt() {
    const text = detail?.prompt?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied");
    } catch {
      toast.error("Could not copy prompt");
    }
  }

  const loading = detail === undefined;
  const missing = detail === null;

  return (
    <aside
      className={`studio-gen-detail${isMobile ? " is-mobile-sheet" : ""}`}
      aria-label="Generation details"
    >
      <div className="studio-gen-detail-head">
        <div className="studio-gen-detail-head-text">
          <p className="studio-gen-detail-kicker">Details</p>
          <h2 title={detail?.name}>
            {detail?.name ?? (loading ? "Loading…" : "Generation")}
          </h2>
        </div>
        <button
          type="button"
          className="studio-gen-detail-close"
          aria-label="Close preview"
          title="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="studio-gen-detail-body">
        {loading ? (
          <div className="studio-create-library-empty">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : missing ? (
          <div className="studio-create-library-empty">
            <p>This generation is no longer available.</p>
          </div>
        ) : (
          <>
            <div className="studio-gen-detail-status-row">
              <span className={`studio-gen-detail-chip is-${detail.stage}`}>
                {detail.stage}
              </span>
              <span className="studio-gen-detail-chip is-mode">{detail.mode}</span>
              {detail.aspectRatio ? (
                <span className="studio-gen-detail-chip">{detail.aspectRatio}</span>
              ) : null}
            </div>

            <section className="studio-gen-detail-section">
              <div className="studio-gen-detail-label">
                <span>Prompt</span>
                {detail.prompt?.trim() ? (
                  <button
                    type="button"
                    className="studio-gen-detail-copy"
                    onClick={() => void copyPrompt()}
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copy
                  </button>
                ) : null}
              </div>
              <p className="studio-gen-detail-prompt">{detail.prompt?.trim() || "—"}</p>
            </section>

            <section className="studio-gen-detail-section">
              <div className="studio-gen-detail-label">
                <span>Info</span>
              </div>
              <dl className="studio-gen-detail-meta">
                <div className="studio-gen-detail-meta-row">
                  <dt>Model</dt>
                  <dd>{detail.modelLabel ?? detail.resolvedModel ?? "—"}</dd>
                </div>
                {detail.resolution ? (
                  <div className="studio-gen-detail-meta-row">
                    <dt>Resolution</dt>
                    <dd>{detail.resolution}</dd>
                  </div>
                ) : null}
                {detail.quality ? (
                  <div className="studio-gen-detail-meta-row">
                    <dt>Quality</dt>
                    <dd>{detail.quality}</dd>
                  </div>
                ) : null}
                {detail.durationSeconds != null ? (
                  <div className="studio-gen-detail-meta-row">
                    <dt>Duration</dt>
                    <dd>{detail.durationSeconds}s</dd>
                  </div>
                ) : null}
                {detail.creditsSpent != null ? (
                  <div className="studio-gen-detail-meta-row">
                    <dt>Credits</dt>
                    <dd>{detail.creditsSpent}</dd>
                  </div>
                ) : null}
                <div className="studio-gen-detail-meta-row">
                  <dt>Created</dt>
                  <dd>{formatWhen(detail.createdAt)}</dd>
                </div>
                {detail.error ? (
                  <div className="studio-gen-detail-meta-row is-error">
                    <dt>Error</dt>
                    <dd>{detail.error}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="studio-gen-detail-actions">
              {detail.kind === "image" && detail.assetId && onUpscale ? (
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => onUpscale(toTile(detail))}
                >
                  <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                  Upscale
                </button>
              ) : null}
              {detail.kind === "image" && detail.assetId && onGenerateVideo ? (
                <button type="button" onClick={() => onGenerateVideo(toTile(detail))}>
                  <Film className="h-3.5 w-3.5" aria-hidden="true" />
                  Generate video
                </button>
              ) : null}
              {detail.assetId && onOpenInFiles ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenInFiles(
                      detail.assetId as Id<"assets">,
                      detail.folderId as Id<"folders"> | undefined,
                    )
                  }
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Open in Files
                </button>
              ) : null}
              {detail.assetId && onTrash ? (
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => onTrash(detail.assetId!)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Trash
                </button>
              ) : null}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
