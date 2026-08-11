"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Copy, Loader2, X } from "lucide-react";
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
  onOpenInFiles?: (assetId: Id<"assets">, folderId: Id<"folders">) => void;
  onTrash?: (assetId: Id<"assets">) => void;
  onPlay?: (url: string, kind: "image" | "video" | "audio", name: string) => void;
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
  onPlay,
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
        <h2>{detail?.name ?? (loading ? "Loading…" : "Generation")}</h2>
        <button
          type="button"
          className="studio-gen-detail-close"
          aria-label="Close details"
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
            <div className="studio-gen-detail-preview">
              {detail.kind === "video" && detail.playableUrl ? (
                <video
                  src={detail.playableUrl}
                  poster={detail.thumbnailUrl}
                  controls
                  playsInline
                />
              ) : detail.kind === "audio" && detail.playableUrl ? (
                <audio src={detail.playableUrl} controls />
              ) : detail.playableUrl || detail.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.playableUrl ?? detail.thumbnailUrl}
                  alt=""
                  onClick={() => {
                    const url = detail.playableUrl ?? detail.thumbnailUrl;
                    if (url) onPlay?.(url, detail.kind, detail.name);
                  }}
                />
              ) : (
                <div className="studio-create-library-empty" style={{ minHeight: 120 }}>
                  <p>{detail.stage === "failed" ? "Generation failed" : "Still generating…"}</p>
                </div>
              )}
            </div>

            <section className="studio-gen-detail-section">
              <div className="studio-gen-detail-label">
                <span>Prompt</span>
                <button type="button" className="studio-gen-detail-copy" onClick={copyPrompt}>
                  <span className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copy
                  </span>
                </button>
              </div>
              <p className="studio-gen-detail-prompt">{detail.prompt || "—"}</p>
            </section>

            <section className="studio-gen-detail-section">
              <div className="studio-gen-detail-label">
                <span>Details</span>
              </div>
              <dl className="studio-gen-detail-meta">
                <dt>Model</dt>
                <dd>{detail.modelLabel ?? detail.resolvedModel ?? "—"}</dd>
                <dt>Mode</dt>
                <dd>{detail.mode}</dd>
                {detail.resolution ? (
                  <>
                    <dt>Resolution</dt>
                    <dd>{detail.resolution}</dd>
                  </>
                ) : null}
                {detail.aspectRatio ? (
                  <>
                    <dt>Aspect</dt>
                    <dd>{detail.aspectRatio}</dd>
                  </>
                ) : null}
                {detail.quality ? (
                  <>
                    <dt>Quality</dt>
                    <dd>{detail.quality}</dd>
                  </>
                ) : null}
                {detail.durationSeconds != null ? (
                  <>
                    <dt>Duration</dt>
                    <dd>{detail.durationSeconds}s</dd>
                  </>
                ) : null}
                {detail.creditsSpent != null ? (
                  <>
                    <dt>Credits</dt>
                    <dd>{detail.creditsSpent}</dd>
                  </>
                ) : null}
                <dt>Status</dt>
                <dd>{detail.stage}</dd>
                <dt>Created</dt>
                <dd>{formatWhen(detail.createdAt)}</dd>
                {detail.error ? (
                  <>
                    <dt>Error</dt>
                    <dd>{detail.error}</dd>
                  </>
                ) : null}
              </dl>
            </section>

            <section className="studio-gen-detail-actions">
              {detail.kind === "image" && detail.assetId && onUpscale ? (
                <button
                  type="button"
                  onClick={() =>
                    onUpscale({
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
                    })
                  }
                >
                  Upscale
                </button>
              ) : null}
              {detail.kind === "image" && detail.assetId && onGenerateVideo ? (
                <button
                  type="button"
                  onClick={() =>
                    onGenerateVideo({
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
                    })
                  }
                >
                  Generate video
                </button>
              ) : null}
              {detail.assetId && onOpenInFiles ? (
                <button
                  type="button"
                  onClick={() => onOpenInFiles(detail.assetId!, detail.folderId)}
                >
                  Open in Files
                </button>
              ) : null}
              {detail.assetId && onTrash ? (
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => onTrash(detail.assetId!)}
                >
                  Trash
                </button>
              ) : null}
              {(detail.playableUrl || detail.thumbnailUrl) && onPlay ? (
                <button
                  type="button"
                  onClick={() => {
                    const url = detail.playableUrl ?? detail.thumbnailUrl;
                    if (url) onPlay(url, detail.kind, detail.name);
                  }}
                >
                  Open media
                </button>
              ) : null}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
