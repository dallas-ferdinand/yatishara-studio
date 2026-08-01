"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CursorSelect } from "@/desk/components/CursorSelect";
import {
  DEFAULT_PREVIEW_LOAD_QUALITY,
  PREVIEW_LOAD_QUALITY_EVENT,
  PREVIEW_LOAD_QUALITY_OPTIONS,
  isPreviewLoadQuality,
  readPreviewLoadQuality,
  writePreviewLoadQuality,
  type PreviewLoadQuality,
} from "./previewLoadQuality";
import {
  FastForward,
  Hand,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Rewind,
  Volume2,
  VolumeX,
} from "lucide-react";
import { exportSizeForRatio } from "./projectContract";
import { PreviewTransformOverlay } from "./PreviewTransformOverlay";
import { PreviewTextTransformOverlay } from "./PreviewTextTransformOverlay";
import { PreviewTextOverlays } from "./PreviewTextOverlays";
import {
  clipAtPlayhead,
  clipDuration,
  formatTimecodeFull,
  projectEndTime,
} from "./editorState";
import type { EditorClip, EditorMediaItem, EditorProject } from "./types";
import {
  isSoftDecodeFailure,
  usePlaybackEngine,
} from "./playback/use-playback-engine";
import { MediaLoadWave } from "@/studio/components/media-load-frame";
import { formatMediaTime } from "@/studio/lib/mediaPlayback";


function subscribePreviewLoadQuality(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onChange = () => onStoreChange();
  window.addEventListener("storage", onChange);
  window.addEventListener(PREVIEW_LOAD_QUALITY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREVIEW_LOAD_QUALITY_EVENT, onChange);
  };
}

function usePreviewLoadQuality(): [
  PreviewLoadQuality,
  (next: PreviewLoadQuality) => void,
] {
  const quality = useSyncExternalStore(
    subscribePreviewLoadQuality,
    readPreviewLoadQuality,
    () => DEFAULT_PREVIEW_LOAD_QUALITY,
  );
  return [quality, writePreviewLoadQuality];
}

type CanvasTool = "select" | "pan";

type EditorPreviewProps = {
  project: EditorProject;
  playhead: number;
  playing: boolean;
  mediaById: ReadonlyMap<string, EditorMediaItem>;
  selectedClipId: string | null;
  onPlayheadChange: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClip: (
    clipId: string,
    patch: Partial<EditorClip>,
    live?: boolean,
  ) => void;
};

export function EditorPreview({
  project,
  playhead,
  playing,
  mediaById,
  selectedClipId,
  onPlayheadChange,
  onPlayingChange,
  onSelectClip,
  onUpdateClip,
}: EditorPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [viewportPan, setViewportPan] = useState({ x: 0, y: 0 });
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  const [previewLoadQuality, setPreviewLoadQuality] = usePreviewLoadQuality();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(0.85);
  const [previewMuted, setPreviewMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(0.85);
  const viewportDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const frame = exportSizeForRatio(project.frameRatio);
  const timelineDuration = Math.max(
    project.duration ?? 0,
    projectEndTime(project),
    0.1,
  );
  // Top timeline video lane (lowest track index) at the playhead.
  let activeClip: EditorClip | null = null;
  for (const track of project.tracks) {
    if (track.kind !== "video") continue;
    const clip = clipAtPlayhead(project, track.id, playhead);
    if (clip) {
      activeClip = clip;
      break;
    }
  }
  const posterUrl = activeClip?.assetId
    ? mediaById.get(activeClip.assetId)?.thumbnailUrl
    : undefined;
  const activeMedia = activeClip?.assetId
    ? mediaById.get(activeClip.assetId)
    : undefined;
  const engine = usePlaybackEngine({
    project,
    playhead,
    playing,
    mediaById,
    naturalAudioByClipId: undefined,
    previewLoadQuality,
    width: frame.width,
    height: frame.height,
    onPlayheadChange,
    onPlayingChange,
  });

  useEffect(() => {
    engine.setMasterVolume(previewMuted ? 0 : previewVolume);
    // setMasterVolume reads a stable runtime ref; omit `engine` identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preview gain only
  }, [previewMuted, previewVolume]);

  const decodedSize =
    activeClip?.assetId && engine.sourceSize?.assetId === activeClip.assetId
      ? engine.sourceSize
      : null;

  let activeTextClip: EditorClip | null = null;
  if (selectedClipId) {
    const selected = project.clips.find((clip) => clip.id === selectedClipId);
    if (
      selected?.kind === "text" &&
      playhead >= selected.startTime &&
      playhead < selected.startTime + clipDuration(selected)
    ) {
      activeTextClip = selected;
    }
  }

  const setCanvasZoom = (next: number) => {
    const zoom = Math.min(4, Math.max(0.25, next));
    setViewportZoom(zoom);
    setZoomDraft(null);
    if (zoom <= 1) setViewportPan({ x: 0, y: 0 });
  };

  const commitZoomDraft = () => {
    if (zoomDraft == null) return;
    const raw = zoomDraft.trim().replace(/%/g, "");
    if (raw === "") {
      setZoomDraft(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setZoomDraft(null);
      return;
    }
    setCanvasZoom(n / 100);
  };

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(
        document.fullscreenElement &&
          rootRef.current &&
          document.fullscreenElement === rootRef.current,
      );
      setIsFullscreen(active);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await node.requestFullscreen();
      }
    } catch {
      // Browser may deny fullscreen without a user gesture / policy.
    }
  };

  const beginViewportPan = (
    event: React.PointerEvent<HTMLElement>,
    target: HTMLElement,
  ) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    viewportDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: viewportPan.x,
      panY: viewportPan.y,
    };
    target.setPointerCapture(event.pointerId);
  };

  const onViewportPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = viewportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewportPan({
      x: drag.panX + event.clientX - drag.x,
      y: drag.panY + event.clientY - drag.y,
    });
  };

  const onViewportPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (viewportDragRef.current?.pointerId !== event.pointerId) return;
    viewportDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const panMode = canvasTool === "pan";

  return (
    <div
      ref={rootRef}
      className={`studio-editor-preview${isFullscreen ? " is-fullscreen" : ""}${panMode ? " is-pan-tool" : ""}`}
    >
      <header className="studio-editor-preview-head">
        <div className="studio-editor-preview-head-left">
          <div className="studio-editor-preview-tools" role="group" aria-label="Canvas tool">
            <button
              type="button"
              className={`studio-editor-preview-tool${canvasTool === "select" ? " is-active" : ""}`}
              aria-pressed={canvasTool === "select"}
              title="Select — click clips on the canvas"
              aria-label="Select tool"
              onClick={() => setCanvasTool("select")}
            >
              <MousePointer2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`studio-editor-preview-tool${canvasTool === "pan" ? " is-active" : ""}`}
              aria-pressed={canvasTool === "pan"}
              title="Pan — drag to move the canvas view"
              aria-label="Pan tool"
              onClick={() => setCanvasTool("pan")}
            >
              <Hand size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="studio-editor-preview-head-center">
          <div
            className="studio-editor-preview-quality"
            title="Preview load quality — lower loads faster (720p); higher uses 1080p when available"
          >
            <CursorSelect
              value={String(previewLoadQuality)}
              options={PREVIEW_LOAD_QUALITY_OPTIONS}
              onChange={(next) => {
                const parsed = Number(next);
                if (isPreviewLoadQuality(parsed)) setPreviewLoadQuality(parsed);
              }}
              ariaLabel="Preview load quality"
              align="start"
              className="studio-editor-preview-quality-select"
            />
          </div>
        </div>

        <div className="studio-editor-preview-head-right">
          <div
            className="studio-editor-canvas-zoom-controls"
            role="group"
            aria-label="Canvas zoom"
            title="Scroll to zoom"
          >
            <button
              type="button"
              aria-label="Zoom canvas out"
              onClick={() => setCanvasZoom(viewportZoom / 1.2)}
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <label className="studio-editor-canvas-zoom-value" title="Edit zoom percentage">
              <input
                type="text"
                inputMode="decimal"
                className="studio-editor-canvas-zoom-input"
                aria-label="Canvas zoom percent"
                value={zoomDraft ?? String(Math.round(viewportZoom * 100))}
                onChange={(event) => setZoomDraft(event.target.value)}
                onFocus={(event) => {
                  setZoomDraft(String(Math.round(viewportZoom * 100)));
                  event.currentTarget.select();
                }}
                onBlur={() => commitZoomDraft()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitZoomDraft();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setZoomDraft(null);
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="studio-editor-canvas-zoom-suffix" aria-hidden="true">
                %
              </span>
            </label>
            <button
              type="button"
              aria-label="Zoom canvas in"
              onClick={() => setCanvasZoom(viewportZoom * 1.2)}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className={`studio-editor-preview-tool studio-editor-preview-fullscreen${isFullscreen ? " is-active" : ""}`}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => {
              void toggleFullscreen();
            }}
          >
            {isFullscreen ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className={`studio-editor-preview-stage${viewportZoom > 1 || panMode ? " is-zoomed" : ""}${panMode ? " is-pan-tool" : ""}`}
        onWheelCapture={(event) => {
          event.preventDefault();
          setCanvasZoom(viewportZoom * (event.deltaY > 0 ? 0.9 : 1.1));
        }}
        onPointerDown={(event) => {
          if (panMode) return;
          // Empty stage padding around the frame only — not frame children.
          if (event.button !== 0) return;
          if (event.target !== event.currentTarget) return;
          onSelectClip(null);
        }}
        onPointerDownCapture={(event) => {
          // Select tool: middle-click or Shift+drag still pans when zoomed.
          if (panMode) return;
          if (viewportZoom <= 1) return;
          if (event.button !== 1 && !(event.button === 0 && event.shiftKey)) {
            return;
          }
          beginViewportPan(event, event.currentTarget);
        }}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
      >
        {panMode ? (
          <div
            className="studio-editor-preview-pan-layer"
            aria-label="Pan canvas"
            onPointerDown={(event) => {
              beginViewportPan(event, event.currentTarget);
            }}
            onPointerMove={onViewportPointerMove}
            onPointerUp={onViewportPointerUp}
          />
        ) : null}
        <div
          className="studio-editor-preview-frame"
          style={{
            aspectRatio: frame.cssRatio,
            ["--preview-ar" as string]: String(frame.width / frame.height),
            transform: `translate(${viewportPan.x}px, ${viewportPan.y}px) scale(${viewportZoom})`,
          }}
          data-frame-ratio={project.frameRatio ?? "16:9"}
        >
          {posterUrl ? (
            // Signed CDN poster URLs are already transformed and cannot use Next's loader.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="studio-editor-preview-video studio-editor-preview-layer studio-editor-preview-poster"
              src={posterUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <canvas
            ref={engine.canvasRef}
            className="studio-editor-preview-video studio-editor-preview-layer studio-editor-preview-canvas"
          />
          <PreviewTextOverlays
            layer="under"
            project={project}
            playhead={playhead}
            canvasWidth={frame.width}
            canvasHeight={frame.height}
            selectedClipId={selectedClipId}
            playing={playing}
            suppressClipId={activeTextClip?.id ?? null}
            onSelect={(clipId) => {
              onSelectClip(clipId);
              if (playing) onPlayingChange(false);
            }}
            onTogglePlay={() => onPlayingChange(!playing)}
          />
          {activeClip ? (
            <PreviewTransformOverlay
              clip={activeClip}
              media={activeMedia}
              decodedWidth={decodedSize?.width}
              decodedHeight={decodedSize?.height}
              canvasWidth={frame.width}
              canvasHeight={frame.height}
              selected={selectedClipId === activeClip.id}
              playing={playing}
              onSelect={(clipId) => {
                onSelectClip(clipId);
                if (playing) onPlayingChange(false);
              }}
              onUpdateClip={onUpdateClip}
              onPreviewTransform={engine.previewTransform}
              onTogglePlay={() => onPlayingChange(!playing)}
            />
          ) : (
            <button
              type="button"
              className="studio-editor-preview-hit"
              aria-label={playing ? "Pause" : "Play"}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                onSelectClip(null);
              }}
              onClick={() => onPlayingChange(!playing)}
            />
          )}
          <PreviewTextOverlays
            layer="over"
            project={project}
            playhead={playhead}
            canvasWidth={frame.width}
            canvasHeight={frame.height}
            selectedClipId={selectedClipId}
            playing={playing}
            suppressClipId={activeTextClip?.id ?? null}
            onSelect={(clipId) => {
              onSelectClip(clipId);
              if (playing) onPlayingChange(false);
            }}
            onTogglePlay={() => onPlayingChange(!playing)}
          />
          {activeTextClip ? (
            <PreviewTextTransformOverlay
              clip={activeTextClip}
              canvasWidth={frame.width}
              canvasHeight={frame.height}
              selected={selectedClipId === activeTextClip.id}
              playing={playing}
              onSelect={(clipId) => {
                onSelectClip(clipId);
                if (playing) onPlayingChange(false);
              }}
              onUpdateClip={onUpdateClip}
              onPreviewTransform={(transform) => {
                engine.previewTextTransform(activeTextClip.id, transform);
              }}
              onTogglePlay={() => onPlayingChange(!playing)}
            />
          ) : null}
          {engine.buffering ? (
            <div
              className="studio-editor-preview-buffering"
              aria-busy="true"
              aria-label="Loading preview"
            >
              <MediaLoadWave size="sm" />
            </div>
          ) : null}
          {engine.error && !isSoftDecodeFailure(engine.error) ? (
            <div className="studio-editor-preview-status is-error" role="alert">
              {engine.error}
            </div>
          ) : null}
        </div>
      </div>

      {isFullscreen ? (
        <div className="studio-editor-preview-fs-transport">
          <div className="studio-editor-preview-fs-scrub">
            <div
              className="studio-editor-preview-fs-scrub-track"
              style={{
                ["--studio-fs-progress" as string]: `${Math.min(
                  100,
                  (Math.min(playhead, timelineDuration) / timelineDuration) * 100,
                )}%`,
              }}
            >
              <input
                type="range"
                className="studio-editor-preview-fs-scrub-input"
                min={0}
                max={timelineDuration}
                step={0.05}
                value={Math.min(playhead, timelineDuration)}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={timelineDuration}
                aria-valuenow={playhead}
                aria-valuetext={formatMediaTime(playhead)}
                onPointerDown={() => {
                  if (playing) onPlayingChange(false);
                }}
                onChange={(event) => {
                  onPlayheadChange(Number(event.target.value) || 0);
                }}
              />
            </div>
          </div>
          <div className="studio-editor-preview-fs-toolbar">
            <div className="studio-editor-preview-fs-toolbar-left">
              <button
                type="button"
                className="cursor-icon-btn"
                title="Back 10s"
                aria-label="Back 10 seconds"
                onClick={() =>
                  onPlayheadChange(Math.max(0, playhead - 10))
                }
              >
                <Rewind size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="cursor-icon-btn studio-editor-preview-fs-play"
                aria-label={playing ? "Pause" : "Play"}
                title={playing ? "Pause" : "Play"}
                onClick={() => onPlayingChange(!playing)}
              >
                {playing ? (
                  <Pause size={16} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Play size={16} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className="cursor-icon-btn"
                title="Forward 10s"
                aria-label="Forward 10 seconds"
                onClick={() =>
                  onPlayheadChange(
                    Math.min(timelineDuration, playhead + 10),
                  )
                }
              >
                <FastForward size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="studio-editor-preview-fs-time" aria-live="polite">
                {formatMediaTime(playhead)}
                <span className="studio-editor-preview-fs-time-sep">/</span>
                {formatMediaTime(timelineDuration)}
              </span>
            </div>
            <div className="studio-editor-preview-fs-toolbar-right">
              <button
                type="button"
                className="cursor-icon-btn"
                title={previewMuted || previewVolume === 0 ? "Unmute" : "Mute"}
                aria-label={
                  previewMuted || previewVolume === 0 ? "Unmute" : "Mute"
                }
                onClick={() => {
                  if (previewMuted || previewVolume === 0) {
                    const restore = volumeBeforeMuteRef.current || 0.85;
                    setPreviewVolume(restore);
                    setPreviewMuted(false);
                  } else {
                    volumeBeforeMuteRef.current = previewVolume || 0.85;
                    setPreviewMuted(true);
                  }
                }}
              >
                {previewMuted || previewVolume === 0 ? (
                  <VolumeX size={14} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Volume2 size={14} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                className="studio-editor-preview-fs-volume"
                min={0}
                max={1}
                step={0.02}
                value={previewMuted ? 0 : previewVolume}
                aria-label="Volume"
                onChange={(event) => {
                  const next = Number(event.target.value) || 0;
                  setPreviewVolume(next);
                  setPreviewMuted(next === 0);
                  if (next > 0) volumeBeforeMuteRef.current = next;
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function activeClipsAtPlayhead(
  project: EditorProject,
  playhead: number,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
) {
  const videoTrack = project.tracks.find((track) => track.kind === "video");
  const audioTrack = project.tracks.find((track) => track.kind === "audio");
  const videoClip = videoTrack
    ? clipAtPlayhead(project, videoTrack.id, playhead)
    : null;
  const audioClip = audioTrack
    ? clipAtPlayhead(project, audioTrack.id, playhead)
    : null;
  const videoMedia = videoClip?.assetId
    ? mediaById.get(videoClip.assetId)
    : undefined;
  return {
    videoClip,
    audioClip,
    videoUrl: videoMedia?.proxyUrl ?? videoMedia?.url,
    videoIsImage: videoMedia?.kind === "image",
    audioUrl: audioClip?.assetId
      ? mediaById.get(audioClip.assetId)?.proxyUrl ??
        mediaById.get(audioClip.assetId)?.url
      : undefined,
    audioMuted: Boolean(audioTrack?.muted),
  };
}
