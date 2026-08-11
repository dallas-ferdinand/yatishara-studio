"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Ban,
  Expand,
  Film,
  Info,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { isVideoFileUrl } from "@/studio/lib/mediaPlayback";
import {
  StudioChatAudioPlayer,
  StudioChatAudioPlayerLoading,
} from "./StudioChatAudioPlayer";
import { orbSeedForVoice } from "./StudioOrbPlayButton";
import { MediaLoadWave } from "./media-load-frame";

export type GenerationLibraryTile = {
  jobId: string;
  assetId?: string;
  kind: "image" | "video" | "audio";
  name: string;
  createdAt: number;
  updatedAt: number;
  stage: "queued" | "generating" | "saving" | "done" | "failed";
  thumbnailUrl?: string;
  playableUrl?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationSeconds?: number;
  threadId?: string;
  promptSnippet?: string;
  modelLabel?: string;
  mode: "image" | "video" | "audio";
  folderId?: string;
  error?: string;
};

function tileAspectCss(tile: GenerationLibraryTile): string {
  if (tile.kind === "audio") return "1 / 1";
  if (
    tile.width != null &&
    tile.height != null &&
    tile.width > 0 &&
    tile.height > 0
  ) {
    return `${tile.width} / ${tile.height}`;
  }
  const match = String(tile.aspectRatio ?? "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (match) return `${match[1]} / ${match[2]}`;
  if (tile.kind === "video") return "16 / 9";
  return "1 / 1";
}

type StudioGenerationTileProps = {
  tile: GenerationLibraryTile;
  selected?: boolean;
  onSelect: (tile: GenerationLibraryTile) => void;
  onPlay: (tile: GenerationLibraryTile) => void;
  onOpenDetails: (tile: GenerationLibraryTile) => void;
  onUpscale?: (tile: GenerationLibraryTile) => void;
  onGenerateVideo?: (tile: GenerationLibraryTile) => void;
  isMobile?: boolean;
};

function isBusy(stage: GenerationLibraryTile["stage"]) {
  return stage === "queued" || stage === "generating" || stage === "saving";
}

function wasCancelled(error?: string) {
  return /cancell?ed by you/i.test(String(error ?? ""));
}

export function StudioGenerationTile({
  tile,
  selected,
  onSelect,
  onPlay,
  onOpenDetails,
  onUpscale,
  onGenerateVideo,
  isMobile,
}: StudioGenerationTileProps) {
  const cancelJob = useMutation(api.generation.cancelMyJob);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const busy = isBusy(tile.stage);
  const failed = tile.stage === "failed";
  const cancelled = failed && wasCancelled(tile.error);
  const doneAudio = tile.kind === "audio" && tile.stage === "done" && Boolean(tile.playableUrl);
  // Audio stays square; image/video use job/asset ratio (including while generating).
  const squareFrame = tile.kind === "audio";
  const aspectCss = tileAspectCss(tile);
  const posterUrl =
    tile.thumbnailUrl && !isVideoFileUrl(tile.thumbnailUrl) ? tile.thumbnailUrl : undefined;
  const videoSrc =
    tile.kind === "video"
      ? tile.playableUrl || (isVideoFileUrl(tile.thumbnailUrl) ? tile.thumbnailUrl : undefined)
      : undefined;
  const imageSrc =
    tile.kind === "image"
      ? posterUrl || tile.playableUrl || tile.thumbnailUrl
      : posterUrl;
  const canPlay =
    tile.stage === "done" &&
    tile.kind === "video" &&
    Boolean(videoSrc || posterUrl);
  const canUpscale = tile.kind === "image" && tile.stage === "done" && Boolean(tile.assetId);
  const canVideo = tile.kind === "image" && tile.stage === "done" && Boolean(tile.assetId);

  useEffect(() => {
    if (!overlayOpen || !isMobile) return;
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setOverlayOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [overlayOpen, isMobile]);

  function handleTileClick() {
    if (doneAudio) {
      onSelect(tile);
      return;
    }
    if (isMobile) {
      if (!overlayOpen) {
        setOverlayOpen(true);
        return;
      }
      onSelect(tile);
      setOverlayOpen(false);
      return;
    }
    onSelect(tile);
  }

  async function handleStop(event: MouseEvent) {
    event.stopPropagation();
    if (!busy || stopping) return;
    setStopping(true);
    try {
      await cancelJob({ jobId: tile.jobId as Id<"generationJobs"> });
      toast.message("Generation stopped");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not stop generation."));
    } finally {
      setStopping(false);
    }
  }

  const mediaClass = [
    "studio-gen-tile-media",
    squareFrame ? "is-square" : "",
    tile.kind === "audio" ? "is-audio" : "",
    doneAudio ? "is-audio-player" : "",
    busy ? "is-busy" : "",
    failed ? "is-failed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let mediaBody: ReactNode = null;
  if (doneAudio) {
    mediaBody = (
      <div
        className="studio-gen-tile-audio"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <StudioChatAudioPlayer
          src={tile.playableUrl!}
          title={tile.name}
          variant="pane"
          compact
          durationHint={tile.durationSeconds}
          orbSeed={orbSeedForVoice(tile.jobId, tile.name)}
        />
      </div>
    );
  } else if (tile.kind === "audio" && busy) {
    mediaBody = (
      <div className="studio-gen-tile-audio is-loading">
        <StudioChatAudioPlayerLoading
          label={tile.stage}
          ariaLabel={`generating audio (${tile.stage})`}
        />
      </div>
    );
  } else if (tile.kind === "video" && !failed && (videoSrc || posterUrl)) {
    mediaBody = videoSrc && !posterUrl ? (
      <video src={videoSrc} muted playsInline preload="metadata" />
    ) : posterUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={posterUrl} alt="" draggable={false} />
    ) : (
      <video src={videoSrc} muted playsInline preload="metadata" />
    );
  } else if (tile.kind === "image" && !failed && imageSrc) {
    mediaBody = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageSrc} alt="" draggable={false} />
    );
  } else if (busy) {
    mediaBody = (
      <div className="studio-gen-tile-progress">
        <MediaLoadWave
          className="studio-gen-tile-ghost-loader"
          size={tile.kind === "audio" ? "md" : "lg"}
          appearance="light"
        />
        <span className="studio-gen-tile-progress-label">{tile.stage}</span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`studio-gen-tile${selected ? " is-selected" : ""}${
        overlayOpen ? " is-overlay-open" : ""
      }${failed ? " is-failed" : ""}${busy ? " is-busy" : ""}${
        doneAudio ? " is-audio-ready" : ""
      }`}
      role="button"
      tabIndex={0}
      onClick={handleTileClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleTileClick();
        }
      }}
      aria-label={tile.name}
    >
      <div
        className={mediaClass}
        style={squareFrame ? undefined : { aspectRatio: aspectCss }}
      >
        {mediaBody}

        <span className="studio-gen-tile-badge">{tile.kind}</span>

        {busy ? (
          <button
            type="button"
            className={`studio-gen-tile-stop${stopping ? " is-busy" : ""}`}
            title="Stop"
            aria-label="Stop generation"
            disabled={stopping}
            onClick={(event) => void handleStop(event)}
          >
            {stopping ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Ban className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        ) : null}

        {failed ? (
          <div
            className="studio-gen-tile-stop is-static"
            title={cancelled ? "Stopped" : "Failed"}
            aria-hidden="true"
          >
            <Ban className="h-5 w-5" />
          </div>
        ) : null}

        {!doneAudio ? (
          <div className="studio-gen-tile-overlay" onClick={(event) => event.stopPropagation()}>
            {canPlay ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                title="Play"
                aria-label="Play"
                onClick={() => onPlay(tile)}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {canUpscale && onUpscale ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                title="Upscale"
                aria-label="Upscale"
                onClick={() => onUpscale(tile)}
              >
                <Expand className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {canVideo && onGenerateVideo ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                title="Generate video"
                aria-label="Generate video"
                onClick={() => onGenerateVideo(tile)}
              >
                <Film className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="studio-gen-tile-action"
              title="Open details"
              aria-label="Open details"
              onClick={() => {
                onOpenDetails(tile);
                setOverlayOpen(false);
              }}
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="studio-gen-tile-audio-details"
            title="Open details"
            aria-label="Open details"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(tile);
            }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
