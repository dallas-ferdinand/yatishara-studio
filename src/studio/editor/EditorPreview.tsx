"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { clipAtPlayhead } from "./editorState";
import { exportSizeForRatio } from "./projectContract";
import { PreviewTransformOverlay } from "./PreviewTransformOverlay";
import type { EditorClip, EditorMediaItem, EditorProject } from "./types";
import { usePlaybackEngine } from "./playback/use-playback-engine";
import { MediaLoadWave } from "@/studio/components/media-load-frame";

type EditorPreviewProps = {
  project: EditorProject;
  playhead: number;
  playing: boolean;
  mediaById: ReadonlyMap<string, EditorMediaItem>;
  selectedClipId: string | null;
  onPlayheadChange: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorClip>) => void;
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
  const [viewportZoom, setViewportZoom] = useState(1);
  const [viewportPan, setViewportPan] = useState({ x: 0, y: 0 });
  const viewportDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const frame = exportSizeForRatio(project.frameRatio);
  const videoTrack = project.tracks.find((track) => track.kind === "video");
  const activeClip = videoTrack
    ? clipAtPlayhead(project, videoTrack.id, playhead)
    : null;
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
    width: frame.width,
    height: frame.height,
    onPlayheadChange,
    onPlayingChange,
  });
  const decodedSize =
    activeClip?.assetId && engine.sourceSize?.assetId === activeClip.assetId
      ? engine.sourceSize
      : null;

  const setCanvasZoom = (next: number) => {
    const zoom = Math.min(4, Math.max(0.25, next));
    setViewportZoom(zoom);
    if (zoom <= 1) setViewportPan({ x: 0, y: 0 });
  };

  return (
    <div className="studio-editor-preview">
      <div
        className={`studio-editor-preview-stage${viewportZoom > 1 ? " is-zoomed" : ""}`}
        onWheelCapture={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setCanvasZoom(viewportZoom * (event.deltaY > 0 ? 0.9 : 1.1));
        }}
        onPointerDownCapture={(event) => {
          if (
            viewportZoom <= 1 ||
            (event.button !== 1 && !event.shiftKey)
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          viewportDragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX: viewportPan.x,
            panY: viewportPan.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = viewportDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setViewportPan({
            x: drag.panX + event.clientX - drag.x,
            y: drag.panY + event.clientY - drag.y,
          });
        }}
        onPointerUp={(event) => {
          if (viewportDragRef.current?.pointerId !== event.pointerId) return;
          viewportDragRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }}
      >
        <div
          className="studio-editor-canvas-zoom-controls"
          role="group"
          aria-label="Canvas zoom"
          title="Canvas view: Ctrl/⌘ + wheel to zoom, Shift + drag to pan"
        >
          <button
            type="button"
            aria-label="Zoom canvas out"
            onClick={() => setCanvasZoom(viewportZoom / 1.2)}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="studio-editor-canvas-zoom-value"
            onClick={() => {
              setViewportZoom(1);
              setViewportPan({ x: 0, y: 0 });
            }}
            title="Reset canvas view"
          >
            {Math.round(viewportZoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom canvas in"
            onClick={() => setCanvasZoom(viewportZoom * 1.2)}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
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
              onClick={() => onPlayingChange(!playing)}
            />
          )}
          {engine.buffering ? (
            <div className="studio-editor-preview-buffering" aria-busy="true" aria-label="Loading preview">
              <MediaLoadWave size="sm" />
            </div>
          ) : null}
          {engine.error ? (
            <div className="studio-editor-preview-status is-error" role="alert">
              {engine.error}
            </div>
          ) : null}
        </div>
      </div>
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
