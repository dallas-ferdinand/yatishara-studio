// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  Pause,
  Play,
  Scissors,
  Trash2,
  Undo2,
  Redo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { clipDuration, formatTimecodeFull, formatTimecodeRuler } from "./editorState";
import {
  collectSnapTimes,
  snapClipMove,
  snapDropStart,
  snapThresholdSec,
  snapTrimLeft,
  snapTrimRight,
} from "./editorSnap";
import {
  clipKindForTrack,
  isTimelineDropDrag,
  peekTimelineDragPayload,
  readTimelineDropPayload,
  trackAcceptsMediaKind,
} from "./editorDnd";
import { ClipFilmstrip } from "./ClipFilmstrip";
import {
  AUDIO_TRACK_HEIGHT,
  MAX_PPS,
  MIN_PPS,
  RULER_HEIGHT,
  TRACK_RAIL_WIDTH,
  VIDEO_TRACK_HEIGHT,
} from "./types";

function TimelineClipBlock({
  clip,
  pps,
  selected,
  media,
  project,
  playhead,
  onSelect,
  onMove,
  onTrim,
  onSnapGuide,
}) {
  const width = clipDuration(clip) * pps;
  const left = clip.startTime * pps;
  const [dragging, setDragging] = useState(null);
  const isVideo = clip.kind === "video";
  const thresholdSec = snapThresholdSec(pps);
  const widthPx = Math.max(width, 28);

  const onPointerDown = (event, mode) => {
    event.stopPropagation();
    onSelect(clip.id);
    const startX = event.clientX;
    const originStart = clip.startTime;
    const originTrimIn = clip.trimIn;
    const originTrimOut = clip.trimOut;
    const snapTimes = collectSnapTimes(project, clip.trackId, clip.id, playhead);
    let lastStart = originStart;
    let lastTrimIn = originTrimIn;
    let lastTrimOut = originTrimOut;
    setDragging(mode);

    const onMoveEvent = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaSec = deltaPx / pps;

      if (mode === "move") {
        const rawStart = Math.max(0, originStart + deltaSec);
        const { startTime, guide } = snapClipMove(clip, rawStart, snapTimes, thresholdSec);
        lastStart = startTime;
        onSnapGuide?.(guide);
        onMove(clip.id, startTime, undefined, true);
      } else if (mode === "trim-left") {
        const rawTrimIn = Math.min(originTrimOut - 0.05, Math.max(0, originTrimIn + deltaSec));
        const trimDelta = rawTrimIn - originTrimIn;
        const rawStart = originStart + trimDelta;
        const snapped = snapTrimLeft(clip, rawTrimIn, rawStart, snapTimes, thresholdSec);
        lastTrimIn = snapped.trimIn;
        lastStart = snapped.startTime;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, snapped.trimIn, originTrimOut, snapped.startTime, true);
      } else if (mode === "trim-right") {
        const rawTrimOut = Math.max(originTrimIn + 0.05, originTrimOut + deltaSec);
        const snapped = snapTrimRight(clip, rawTrimOut, snapTimes, thresholdSec);
        lastTrimOut = snapped.trimOut;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, originTrimIn, snapped.trimOut, undefined, true);
      }
    };

    const onUp = () => {
      setDragging(null);
      onSnapGuide?.(null);
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);

      if (mode === "move") {
        onMove(clip.id, lastStart, undefined, false);
      } else if (mode === "trim-left") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, lastStart, false);
      } else if (mode === "trim-right") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, undefined, false);
      }
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`studio-editor-clip is-${clip.kind}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ left, width: widthPx }}
      onPointerDown={(event) => onPointerDown(event, "move")}
    >
      {isVideo ? (
        <ClipFilmstrip media={media} label={clip.label} widthPx={widthPx} />
      ) : (
        <span className="studio-editor-clip-label">{clip.label}</span>
      )}
      <span
        className="studio-editor-clip-handle is-left"
        onPointerDown={(event) => onPointerDown(event, "trim-left")}
      />
      <span
        className="studio-editor-clip-handle is-right"
        onPointerDown={(event) => onPointerDown(event, "trim-right")}
      />
    </div>
  );
}

function DropGhost({ preview, pps, mediaById }) {
  if (!preview) return null;
  const width = Math.max(preview.duration * pps, 28);
  const media = preview.assetId ? mediaById?.get(preview.assetId) : null;
  return (
    <div
      className="studio-editor-drop-ghost"
      style={{ left: preview.startTime * pps, width }}
      aria-hidden="true"
    >
      {media ? (
        <ClipFilmstrip media={media} label={preview.name} widthPx={width} />
      ) : (
        <span className="studio-editor-drop-ghost-label">{preview.name}</span>
      )}
    </div>
  );
}

function TrackRailButton({ track, onToggleMute }) {
  if (track.kind === "audio") {
    return (
      <button
        type="button"
        className={`studio-editor-track-btn${track.muted ? " is-active" : ""}`}
        aria-label={track.muted ? "Unmute track" : "Mute track"}
        title={track.muted ? "Unmute" : "Mute"}
        onClick={() => onToggleMute(track.id)}
      >
        {track.muted ? <VolumeX size={ICON} aria-hidden="true" /> : <Volume2 size={ICON} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <span className="studio-editor-track-btn is-static" aria-hidden="true">
      <Film size={ICON} aria-hidden="true" />
    </span>
  );
}

const ICON = 14;

export function EditorTransportBar({
  playing,
  playhead,
  duration,
  canUndo,
  canRedo,
  canSplit,
  hasSelection,
  exporting,
  pixelsPerSecond,
  onPlayingChange,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  onZoom,
  onExport,
}) {
  return (
    <div className="studio-editor-transport">
      <div className="studio-editor-transport-left">
        <button type="button" disabled={!canUndo} onClick={onUndo} title="Undo" aria-label="Undo">
          <Undo2 size={ICON} aria-hidden="true" />
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo} title="Redo" aria-label="Redo">
          <Redo2 size={ICON} aria-hidden="true" />
        </button>
        <button type="button" disabled={!canSplit} onClick={onSplit} title="Split at playhead" aria-label="Split">
          <Scissors size={ICON} aria-hidden="true" />
        </button>
        <button type="button" disabled={!hasSelection} onClick={onDelete} title="Delete clip" aria-label="Delete">
          <Trash2 size={ICON} aria-hidden="true" />
        </button>
      </div>
      <div className="studio-editor-transport-center">
        <button
          type="button"
          className="studio-editor-transport-play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => onPlayingChange(!playing)}
        >
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        </button>
        <span className="studio-editor-transport-time">
          {formatTimecodeFull(playhead)}
          <span className="studio-editor-transport-sep">|</span>
          {formatTimecodeFull(duration)}
        </span>
      </div>
      <div className="studio-editor-transport-right">
        <div className="studio-editor-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(MIN_PPS, pixelsPerSecond - 12))}>
            <ZoomOut size={ICON} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(MAX_PPS, pixelsPerSecond + 12))}>
            <ZoomIn size={ICON} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="studio-editor-export-btn"
          disabled={exporting}
          onClick={onExport}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
    </div>
  );
}

export function EditorTimeline({
  project,
  playhead,
  pixelsPerSecond,
  selectedClipId,
  mediaById,
  onSelectClip,
  onSetPlayhead,
  onAddClip,
  onMoveClip,
  onTrimClip,
  onToggleTrackMute,
}) {
  const scrollRef = useRef(null);
  const timelineWidth = Math.max(project.duration * pixelsPerSecond + 240, 720);
  const [dropPreview, setDropPreview] = useState(null);
  const [snapGuideTime, setSnapGuideTime] = useState(null);
  const snapThreshold = snapThresholdSec(pixelsPerSecond);

  const timeFromClientX = useCallback(
    (clientX, laneEl) => {
      const scroll = scrollRef.current;
      if (!scroll || !laneEl) return 0;
      const rect = laneEl.getBoundingClientRect();
      const x = clientX - rect.left + scroll.scrollLeft;
      return Math.max(0, x / pixelsPerSecond);
    },
    [pixelsPerSecond],
  );

  const onTrackDragOver = useCallback(
    (event, track) => {
      if (!isTimelineDropDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";

      const payload = peekTimelineDragPayload();
      if (!payload || !trackAcceptsMediaKind(track.kind, payload.mediaKind)) {
        setDropPreview(null);
        return;
      }

      const lane = event.currentTarget.querySelector(".studio-editor-track-lane");
      const rawStart = timeFromClientX(event.clientX, lane);
      const snapTimes = collectSnapTimes(project, track.id, null, playhead);
      const { startTime, guide } = snapDropStart(rawStart, payload.duration, snapTimes, snapThreshold);
      setSnapGuideTime(guide);
      setDropPreview({
        trackId: track.id,
        assetId: payload.assetId,
        startTime,
        duration: payload.duration,
        name: payload.name,
        thumbnailUrl: payload.thumbnailUrl,
      });
    },
    [timeFromClientX, project, playhead, snapThreshold],
  );

  const onTrackDragLeave = useCallback((event, track) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropPreview((prev) => (prev?.trackId === track.id ? null : prev));
    setSnapGuideTime(null);
  }, []);

  const onTrackDrop = useCallback(
    (event, track) => {
      event.preventDefault();
      event.stopPropagation();
      setDropPreview(null);
      setSnapGuideTime(null);

      const payload = readTimelineDropPayload(event);
      if (!payload || !trackAcceptsMediaKind(track.kind, payload.mediaKind)) return;

      const lane = event.currentTarget.querySelector(".studio-editor-track-lane");
      const rawStart = timeFromClientX(event.clientX, lane);
      const snapTimes = collectSnapTimes(project, track.id, null, playhead);
      const { startTime } = snapDropStart(rawStart, payload.duration, snapTimes, snapThreshold);
      onAddClip({
        assetId: payload.assetId,
        trackId: track.id,
        startTime,
        trimIn: 0,
        trimOut: payload.duration,
        sourceDuration: payload.duration,
        label: payload.name,
        kind: clipKindForTrack(track.kind, payload.mediaKind),
      });
    },
    [onAddClip, timeFromClientX, project, playhead, snapThreshold],
  );

  useEffect(() => {
    const clearPreview = () => {
      setDropPreview(null);
      setSnapGuideTime(null);
    };
    document.addEventListener("dragend", clearPreview);
    document.addEventListener("drop", clearPreview);
    return () => {
      document.removeEventListener("dragend", clearPreview);
      document.removeEventListener("drop", clearPreview);
    };
  }, []);

  const ticks = [];
  const step = pixelsPerSecond >= 120 ? 5 : 10;
  for (let t = 0; t <= project.duration; t += step) {
    ticks.push(t);
  }

  return (
    <div className="studio-editor-timeline-wrap">
      <div className="studio-editor-timeline-scroll" ref={scrollRef}>
        <div className="studio-editor-timeline-canvas" style={{ width: timelineWidth }}>
          <div
            className="studio-editor-ruler"
            style={{ height: RULER_HEIGHT, marginLeft: TRACK_RAIL_WIDTH }}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
              onSetPlayhead(x / pixelsPerSecond);
            }}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="studio-editor-ruler-tick"
                style={{ left: tick * pixelsPerSecond }}
              >
                {formatTimecodeRuler(tick)}
              </span>
            ))}
          </div>
          {project.tracks.map((track) => {
            const trackHeight = track.kind === "video" ? VIDEO_TRACK_HEIGHT : AUDIO_TRACK_HEIGHT;
            const preview = dropPreview?.trackId === track.id ? dropPreview : null;
            return (
              <div
                key={track.id}
                className={`studio-editor-track-row${preview ? " is-drop-target" : ""}`}
                style={{ height: trackHeight }}
                onDragOver={(event) => onTrackDragOver(event, track)}
                onDragLeave={(event) => onTrackDragLeave(event, track)}
                onDrop={(event) => onTrackDrop(event, track)}
              >
                <div className="studio-editor-track-rail" style={{ width: TRACK_RAIL_WIDTH }}>
                  <TrackRailButton track={track} onToggleMute={onToggleTrackMute} />
                </div>
                <div
                  className="studio-editor-track-lane"
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      onSelectClip(null);
                      onSetPlayhead(timeFromClientX(event.clientX, event.currentTarget));
                    }
                  }}
                >
                  {project.clips
                    .filter((clip) => clip.trackId === track.id)
                    .map((clip) => {
                      const media = mediaById?.get(clip.assetId);
                      return (
                        <TimelineClipBlock
                          key={clip.id}
                          clip={clip}
                          pps={pixelsPerSecond}
                          selected={clip.id === selectedClipId}
                          media={media}
                          project={project}
                          playhead={playhead}
                          onSelect={onSelectClip}
                          onMove={onMoveClip}
                          onSnapGuide={setSnapGuideTime}
                          onTrim={(clipId, trimIn, trimOut, startTime, live) => {
                            onTrimClip(clipId, trimIn, trimOut, startTime, live);
                          }}
                        />
                      );
                    })}
                  <DropGhost preview={preview} pps={pixelsPerSecond} mediaById={mediaById} />
                </div>
              </div>
            );
          })}
          <div
            className="studio-editor-playhead"
            style={{ left: TRACK_RAIL_WIDTH + playhead * pixelsPerSecond }}
          />
          {snapGuideTime !== null ? (
            <div
              className="studio-editor-snap-guide"
              style={{ left: TRACK_RAIL_WIDTH + snapGuideTime * pixelsPerSecond }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
