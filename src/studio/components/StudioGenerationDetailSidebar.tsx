"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Copy,
  Expand,
  Film,
  FolderOpen,
  ImageIcon,
  Loader2,
  Music2,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { parseStudioPrompt } from "../lib/studio-prompt-display";
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

function RefKindIcon({ kind }: { kind: string }) {
  if (kind === "video") return <Video className="h-4 w-4" aria-hidden="true" />;
  if (kind === "audio") return <Music2 className="h-4 w-4" aria-hidden="true" />;
  return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
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

  const promptParsed = useMemo(() => {
    if (!detail?.prompt) return { body: "", refs: [] as ReturnType<typeof parseStudioPrompt>["refs"] };
    const parsed = parseStudioPrompt(detail.prompt);
    const body = parsed.segments
      .map((seg) => (seg.type === "mention" ? `@${seg.label}` : seg.value))
      .join("")
      .trim();
    return { body, refs: parsed.refs };
  }, [detail?.prompt]);

  const references = useMemo(() => {
    if (detail?.references?.length) return detail.references;
    // Fallback chips from prompt text when assets couldn't be resolved.
    return promptParsed.refs.map((ref, index) => ({
      assetId: `prompt-ref-${index}` as Id<"assets">,
      name: String(ref.label || ref.filename || "Reference").replace(/^@/, ""),
      kind:
        ref.kind === "image" || ref.kind === "video" || ref.kind === "audio"
          ? ref.kind
          : "file",
      thumbnailUrl: /^https?:\/\//i.test(String(ref.thumb || ""))
        ? String(ref.thumb)
        : undefined,
      openable: false as boolean,
    }));
  }, [detail?.references, promptParsed.refs]);

  async function copyPrompt() {
    const text = promptParsed.body || detail?.prompt?.trim();
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

  const infoItems = !detail
    ? []
    : [
        {
          label: "Model",
          value: detail.modelLabel ?? detail.resolvedModel ?? "—",
          title: detail.resolvedModel && detail.modelLabel !== detail.resolvedModel
            ? detail.resolvedModel
            : undefined,
        },
        detail.resolution ? { label: "Resolution", value: detail.resolution } : null,
        detail.quality ? { label: "Quality", value: detail.quality } : null,
        detail.durationSeconds != null
          ? { label: "Duration", value: `${detail.durationSeconds}s` }
          : null,
        detail.creditsSpent != null
          ? { label: "Credits", value: String(detail.creditsSpent) }
          : null,
        { label: "Created", value: formatWhen(detail.createdAt) },
      ].filter(Boolean) as Array<{ label: string; value: string; title?: string }>;

  return (
    <aside
      className={`studio-gen-detail${isMobile ? " is-mobile-sheet" : ""}`}
      aria-label="Generation details"
    >
      <div className="studio-gen-detail-head">
        <h2 className="truncate" title={detail?.name}>
          {detail?.name ?? (loading ? "Loading…" : "Generation")}
        </h2>
        <button
          type="button"
          className="studio-settings-pill studio-settings-trigger studio-gen-detail-close"
          aria-label="Close preview"
          title="Close"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
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
                {promptParsed.body ? (
                  <button
                    type="button"
                    className="studio-gen-detail-copy"
                    onClick={() => void copyPrompt()}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy</span>
                  </button>
                ) : null}
              </div>
              <p className="studio-gen-detail-prompt">{promptParsed.body || "—"}</p>
            </section>

            {references.length > 0 ? (
              <section className="studio-gen-detail-section">
                <div className="studio-gen-detail-label">
                  <span>References</span>
                </div>
                <div className="studio-gen-detail-refs">
                  {references.map((ref) => {
                    const openable =
                      "openable" in ref ? ref.openable !== false : Boolean(ref.assetId);
                    return (
                      <button
                        key={String(ref.assetId)}
                        type="button"
                        className="studio-gen-detail-ref"
                        title={ref.name}
                        disabled={!openable || !onOpenInFiles}
                        onClick={() => {
                          if (!openable || !onOpenInFiles) return;
                          onOpenInFiles(ref.assetId);
                        }}
                      >
                        <span className="studio-gen-detail-ref-thumb">
                          {ref.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ref.thumbnailUrl} alt="" />
                          ) : (
                            <RefKindIcon kind={ref.kind} />
                          )}
                        </span>
                        <span className="studio-gen-detail-ref-meta">
                          <span className="studio-gen-detail-ref-name">{ref.name}</span>
                          <span className="studio-gen-detail-ref-kind">{ref.kind}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="studio-gen-detail-section">
              <div className="studio-gen-detail-label">
                <span>Info</span>
              </div>
              <div className="studio-gen-detail-info-grid">
                {infoItems.map((item) => (
                  <div key={item.label} className="studio-gen-detail-info-card">
                    <span className="studio-gen-detail-info-label">{item.label}</span>
                    <span
                      className="studio-gen-detail-info-value"
                      title={item.title || item.value}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              {detail.error ? (
                <p className="studio-gen-detail-error">{detail.error}</p>
              ) : null}
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
