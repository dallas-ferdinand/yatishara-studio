"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Ban,
  Expand,
  Eye,
  Film,
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

/**
 * Create-grid thumb. Cached CDN images often finish before onLoad attaches
 * (masonry remounts every time a new job lands) — settle via img.complete.
 */
function GenTileImg({ src }: { src: string }) {
  const [retryTick, setRetryTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loadedSrcRef = useRef("");
  const attemptRef = useRef(0);
  const retryTimerRef = useRef(0);

  const markLoaded = useCallback((url: string) => {
    if (!url) return;
    loadedSrcRef.current = url;
    attemptRef.current = 0;
    queueMicrotask(() => {
      setLoaded(true);
      setFailed(false);
    });
  }, []);

  useLayoutEffect(() => {
    attemptRef.current = 0;
    window.clearTimeout(retryTimerRef.current);

    if (!src) {
      loadedSrcRef.current = "";
      setLoaded(false);
      setFailed(false);
      return;
    }

    // Same URL already painted — keep it (Convex re-query / column reshuffle).
    if (loadedSrcRef.current === src) {
      setFailed(false);
      setLoaded(true);
      return;
    }

    setFailed(false);
    setLoaded(false);

    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      markLoaded(src);
    }
  }, [src, retryTick, markLoaded]);

  useEffect(() => {
    return () => window.clearTimeout(retryTimerRef.current);
  }, []);

  if (failed) return null;

  return (
    <span className={`studio-gen-tile-img-wrap${loaded ? " is-ready" : ""}`}>
      {!loaded ? (
        <span className="studio-gen-tile-img-skeleton" aria-hidden="true">
          <MediaLoadWave
            className="studio-gen-tile-ghost-loader"
            size="lg"
            appearance="light"
            ring
          />
        </span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${src}::${retryTick}`}
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => markLoaded(src)}
        onError={() => {
          const attempt = attemptRef.current + 1;
          attemptRef.current = attempt;
          if (attempt > 5) {
            loadedSrcRef.current = "";
            queueMicrotask(() => {
              setFailed(true);
              setLoaded(false);
            });
            return;
          }
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(
            () => setRetryTick((tick) => tick + 1),
            Math.min(4000, 350 * 2 ** (attempt - 1)),
          );
        }}
      />
    </span>
  );
}

const TILE_VIDEO_PLAY_EVENT = "studio-gen-tile-video-play";

/** Inline Create-grid video: center play, click to play/pause in-place. */
function GenTileInlineVideo({
  src,
  poster,
}: {
  src: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    function onOtherPlay(event: Event) {
      const detail = (event as CustomEvent<{ src?: string }>).detail;
      if (detail?.src === src) return;
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      setPlaying(false);
    }
    window.addEventListener(TILE_VIDEO_PLAY_EVENT, onOtherPlay);
    return () => {
      window.removeEventListener(TILE_VIDEO_PLAY_EVENT, onOtherPlay);
      videoRef.current?.pause();
    };
  }, [src]);

  async function togglePlayback(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    if (!video || failed) return;
    if (!video.paused && !video.ended) {
      video.pause();
      setPlaying(false);
      return;
    }
    window.dispatchEvent(
      new CustomEvent(TILE_VIDEO_PLAY_EVENT, { detail: { src } }),
    );
    try {
      video.muted = false;
      await video.play();
      setPlaying(true);
      setFailed(false);
    } catch {
      try {
        video.muted = true;
        await video.play();
        setPlaying(true);
        setFailed(false);
      } catch {
        setFailed(true);
        setPlaying(false);
      }
    }
  }

  return (
    <span
      className={`studio-gen-tile-video${playing ? " is-playing" : ""}${
        failed ? " is-failed" : ""
      }`}
    >
      {poster && !playing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" draggable={false} decoding="async" />
      ) : null}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        className={poster && !playing ? "is-under-poster" : undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={(event) => void togglePlayback(event)}
        onError={() => setFailed(true)}
      />
      {!playing && !failed ? (
        <button
          type="button"
          className="studio-gen-tile-play"
          data-studio-no-press="1"
          title="Play"
          aria-label="Play video"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => void togglePlayback(event)}
        >
          <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

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
  audioType?: "voiceover" | "sfx" | "music";
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

function tileKindBadge(tile: GenerationLibraryTile) {
  if (tile.kind === "audio") {
    if (tile.audioType === "sfx") return "SFX";
    if (tile.audioType === "music") return "Music";
    if (tile.audioType === "voiceover") return "Voiceover";
    const model = tile.modelLabel ?? "";
    if (/music/i.test(model)) return "Music";
    if (/sfx/i.test(model)) return "SFX";
    if (/voice/i.test(model)) return "Voiceover";
    return "Audio";
  }
  if (tile.kind === "image") return "Image";
  if (tile.kind === "video") return "Video";
  return tile.kind;
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
  const hasDeliveredMedia =
    tile.kind === "audio"
      ? Boolean(tile.playableUrl)
      : tile.kind === "video"
        ? Boolean(videoSrc || posterUrl)
        : Boolean(imageSrc);
  // Job can flip to done before Bunny storageStatus=ready (no signed URLs yet).
  const awaitingMedia = tile.stage === "done" && !failed && !hasDeliveredMedia;
  const showBusyChrome = busy || awaitingMedia;
  const canPreview =
    tile.stage === "done" && hasDeliveredMedia;
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
    showBusyChrome ? "is-busy" : "",
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
  } else if (tile.kind === "audio" && (busy || awaitingMedia)) {
    mediaBody = (
      <div className="studio-gen-tile-audio is-loading">
        <StudioChatAudioPlayerLoading
          label={awaitingMedia ? "saving" : tile.stage}
          ariaLabel={`generating audio (${awaitingMedia ? "saving" : tile.stage})`}
        />
      </div>
    );
  } else if (busy || awaitingMedia) {
    mediaBody = (
      <div className="studio-gen-tile-progress">
        <MediaLoadWave
          className="studio-gen-tile-ghost-loader"
          size={tile.kind === "audio" ? "md" : "lg"}
          appearance="light"
          ring
        />
        <span className="studio-gen-tile-progress-label">
          {awaitingMedia ? "saving" : tile.stage}
        </span>
      </div>
    );
  } else if (tile.kind === "video" && !failed && (videoSrc || posterUrl)) {
    mediaBody = videoSrc ? (
      <GenTileInlineVideo src={videoSrc} poster={posterUrl} />
    ) : posterUrl ? (
      <GenTileImg src={posterUrl} />
    ) : null;
  } else if (tile.kind === "image" && !failed && imageSrc) {
    mediaBody = <GenTileImg src={imageSrc} />;
  }

  return (
    <div
      ref={rootRef}
      className={`studio-gen-tile${selected ? " is-selected" : ""}${
        overlayOpen ? " is-overlay-open" : ""
      }${failed ? " is-failed" : ""}${showBusyChrome ? " is-busy" : ""}${
        doneAudio ? " is-audio-ready" : ""
      }`}
      data-studio-no-press="1"
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

        <span className="studio-gen-tile-badge">{tileKindBadge(tile)}</span>

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
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
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
          <div
            className="studio-gen-tile-overlay"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {canPreview ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                data-studio-no-press="1"
                title="Open preview"
                aria-label="Open preview"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPlay(tile);
                  setOverlayOpen(false);
                }}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {canUpscale && onUpscale ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                data-studio-no-press="1"
                title="Upscale"
                aria-label="Upscale"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onUpscale(tile);
                }}
              >
                <Expand className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {canVideo && onGenerateVideo ? (
              <button
                type="button"
                className="studio-gen-tile-action"
                data-studio-no-press="1"
                title="Generate video"
                aria-label="Generate video"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onGenerateVideo(tile);
                }}
              >
                <Film className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="studio-gen-tile-audio-details"
            data-studio-no-press="1"
            title="Open preview"
            aria-label="Open preview"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPlay(tile);
            }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
