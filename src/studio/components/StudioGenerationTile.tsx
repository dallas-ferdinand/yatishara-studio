"use client";

import { useEffect, useRef, useState } from "react";
import {
  Expand,
  Film,
  Info,
  Loader2,
  Play,
  Sparkles,
} from "lucide-react";

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
  durationSeconds?: number;
  threadId?: string;
  promptSnippet?: string;
  modelLabel?: string;
  mode: "image" | "video" | "audio";
  folderId?: string;
  error?: string;
};

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
  const [overlayOpen, setOverlayOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const busy = isBusy(tile.stage);
  const failed = tile.stage === "failed";
  const canPlay =
    Boolean(tile.playableUrl || tile.thumbnailUrl) &&
    tile.stage === "done" &&
    (tile.kind === "video" || tile.kind === "audio" || tile.kind === "image");
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

  return (
    <div
      ref={rootRef}
      className={`studio-gen-tile${selected ? " is-selected" : ""}${
        overlayOpen ? " is-overlay-open" : ""
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
        className={`studio-gen-tile-media${
          tile.kind === "audio" || (!tile.thumbnailUrl && busy) ? ` is-${tile.kind === "audio" ? "audio" : "pending"}` : ""
        }`}
      >
        {tile.kind === "video" && tile.playableUrl && !tile.thumbnailUrl ? (
          <video src={tile.playableUrl} muted playsInline preload="metadata" />
        ) : tile.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tile.thumbnailUrl} alt="" draggable={false} />
        ) : busy ? (
          <Loader2 className="h-6 w-6 animate-spin opacity-70" aria-hidden="true" />
        ) : (
          <Sparkles className="h-6 w-6 opacity-50" aria-hidden="true" />
        )}

        {busy ? (
          <span className="studio-gen-tile-badge is-busy">{tile.stage}</span>
        ) : failed ? (
          <span className="studio-gen-tile-badge is-failed">failed</span>
        ) : (
          <span className="studio-gen-tile-badge">{tile.kind}</span>
        )}

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
      </div>
    </div>
  );
}
