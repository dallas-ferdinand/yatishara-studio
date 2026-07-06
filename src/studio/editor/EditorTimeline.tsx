// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  Pause,
  Play,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Sunrise,
  Sunset,
  Sparkles,
} from "lucide-react";
import { transitionLabel } from "./editorEffects";
import { transitionJointsOnTrack } from "./editorTimelineUtils";
import { computeRippleLayout, computeRippleInsertForNewClip } from "./editorRipple";
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
  TEXT_TRACK_HEIGHT,
  TRACK_RAIL_WIDTH,
  VIDEO_TRACK_HEIGHT,
} from "./types";

function trackHeightForKind(kind) {
  if (kind === "text") return TEXT_TRACK_HEIGHT;
  if (kind === "audio") return AUDIO_TRACK_HEIGHT;
  return VIDEO_TRACK_HEIGHT;
}

function FadeOverlay({ fadeIn, fadeOut, duration, pps }) {
  const fadeInPx = (fadeIn ?? 0) * pps;
  const fadeOutPx = (fadeOut ?? 0) * pps;
  return (
    <>
      {fadeInPx > 2 ? (
        <span className="studio-editor-clip-fade is-in" style={{ width: fadeInPx }} aria-hidden="true" />
      ) : null}
      {fadeOutPx > 2 ? (
        <span
          className="studio-editor-clip-fade is-out"
          style={{ width: fadeOutPx, right: 0 }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function RippleGhostClip({ clip, startTime, pps, media, isDragged }) {
  const width = Math.max(clipDuration(clip) * pps, 28);
  const isVideo = clip.kind === "video";
  const isText = clip.kind === "text";
  return (
    <div
      className={`studio-editor-ripple-ghost is-${clip.kind}${isDragged ? " is-dragged" : ""}`}
      style={{ left: startTime * pps, width }}
      aria-hidden="true"
    >
      {isText ? (
        <span className="studio-editor-clip-label is-text">{clip.text?.text || clip.label}</span>
      ) : isVideo && media ? (
        <ClipFilmstrip media={media} label={clip.label} widthPx={width} />
      ) : (
        <span className="studio-editor-clip-label">{clip.label}</span>
      )}
    </div>
  );
}

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
  resolveTrackAtY,
  onRipplePreview,
  onApplyRippleLayout,
  rippleActive,
}) {
  const width = clipDuration(clip) * pps;
  const left = clip.startTime * pps;
  const [dragging, setDragging] = useState(null);
  const isVideo = clip.kind === "video";
  const isText = clip.kind === "text";
  const thresholdSec = snapThresholdSec(pps);
  const widthPx = Math.max(width, 28);
  const duration = clipDuration(clip);

  const onPointerDown = (event, mode) => {
    event.stopPropagation();
    onSelect(clip.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const originStart = clip.startTime;
    const originTrackId = clip.trackId;
    const originTrimIn = clip.trimIn;
    const originTrimOut = clip.trimOut;
    const snapTimes = collectSnapTimes(project, clip.trackId, clip.id, playhead);
    let lastStart = originStart;
    let lastTrackId = originTrackId;
    let lastTrimIn = originTrimIn;
    let lastTrimOut = originTrimOut;
    let lastRipplePlacements = null;
    let freeMove = false;
    setDragging(mode);

    const targetEl = event.currentTarget;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const onMoveEvent = (moveEvent) => {
      const disableSnap = moveEvent.altKey;
      const deltaPx = moveEvent.clientX - startX;
      const deltaSec = deltaPx / pps;

      if (mode === "move") {
        const targetTrackId = resolveTrackAtY?.(moveEvent.clientY) ?? originTrackId;
        const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
        const allowedTrackId =
          targetTrack && targetTrack.kind === clip.kind ? targetTrackId : originTrackId;
        const rawStart = Math.max(0, originStart + deltaSec);
        freeMove = disableSnap;

        if (disableSnap) {
          onRipplePreview?.(null);
          const trackForSnap = allowedTrackId || originTrackId;
          const moveSnapTimes = collectSnapTimes(project, trackForSnap, clip.id, playhead);
          const { startTime, guide } = snapClipMove(clip, rawStart, moveSnapTimes, thresholdSec, true);
          lastStart = startTime;
          lastTrackId = allowedTrackId;
          onSnapGuide?.(guide);
          onMove(clip.id, startTime, lastTrackId !== originTrackId ? lastTrackId : undefined, true);
        } else {
          const centerTime = rawStart + clipDuration(clip) / 2;
          const placements = computeRippleLayout({
            project,
            trackId: allowedTrackId,
            draggedClip: clip,
            centerTime,
          });
          lastRipplePlacements = placements;
          lastTrackId = allowedTrackId;
          const draggedPlacement = placements.find((p) => p.clipId === clip.id);
          lastStart = draggedPlacement?.startTime ?? rawStart;
          onSnapGuide?.(null);
          onRipplePreview?.({
            trackId: allowedTrackId,
            draggedClipId: clip.id,
            placements,
          });
        }
      } else if (mode === "trim-left") {
        const rawTrimIn = Math.min(originTrimOut - 0.05, Math.max(0, originTrimIn + deltaSec));
        const trimDelta = rawTrimIn - originTrimIn;
        const rawStart = Math.max(0, originStart + trimDelta);
        const snapped = snapTrimLeft(clip, rawTrimIn, rawStart, snapTimes, thresholdSec, disableSnap);
        lastTrimIn = snapped.trimIn;
        lastStart = snapped.startTime;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, snapped.trimIn, originTrimOut, snapped.startTime, true);
      } else if (mode === "trim-right") {
        const rawTrimOut = Math.max(originTrimIn + 0.05, originTrimOut + deltaSec);
        const snapped = snapTrimRight(clip, rawTrimOut, snapTimes, thresholdSec, disableSnap);
        lastTrimOut = snapped.trimOut;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, originTrimIn, snapped.trimOut, undefined, true);
      }
    };

    const onUp = (upEvent) => {
      try {
        targetEl.releasePointerCapture?.(upEvent.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(null);
      onSnapGuide?.(null);
      onRipplePreview?.(null);
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (mode === "move") {
        if (!freeMove && lastRipplePlacements?.length) {
          onApplyRippleLayout?.(lastRipplePlacements);
        } else {
          onMove(clip.id, lastStart, lastTrackId !== originTrackId ? lastTrackId : undefined, false);
        }
      } else if (mode === "trim-left") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, lastStart, false);
      } else if (mode === "trim-right") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, undefined, false);
      }
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className={`studio-editor-clip is-${clip.kind}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${rippleActive ? " is-ripple-dimmed" : ""}`}
      style={{ left, width: widthPx }}
      onPointerDown={(event) => onPointerDown(event, "move")}
      title={clip.label}
    >
      {isText ? (
        <span className="studio-editor-clip-label is-text">{clip.text?.text || clip.label}</span>
      ) : isVideo ? (
        <ClipFilmstrip media={media} label={clip.label} widthPx={widthPx} />
      ) : (
        <span className="studio-editor-clip-label">{clip.label}</span>
      )}
      <FadeOverlay fadeIn={clip.effects?.fadeIn} fadeOut={clip.effects?.fadeOut} duration={duration} pps={pps} />
      {(clip.effects?.fadeIn ?? 0) > 0 ? (
        <span className="studio-editor-clip-edge-icon is-in" title="Fade in">
          <Sunrise size={10} aria-hidden="true" />
        </span>
      ) : null}
      {(clip.effects?.fadeOut ?? 0) > 0 ? (
        <span className="studio-editor-clip-edge-icon is-out" title="Fade out">
          <Sunset size={10} aria-hidden="true" />
        </span>
      ) : null}
      {clip.transitionOut?.type && clip.transitionOut.type !== "none" ? (
        <span className="studio-editor-clip-transition-badge" title={`${clip.transitionOut.type} out`}>
          {clip.transitionOut.type === "crossfade" ? "×" : "→"}
        </span>
      ) : null}
      {!isText ? (
        <>
          <span
            className="studio-editor-clip-handle is-left"
            onPointerDown={(event) => onPointerDown(event, "trim-left")}
          />
          <span
            className="studio-editor-clip-handle is-right"
            onPointerDown={(event) => onPointerDown(event, "trim-right")}
          />
        </>
      ) : (
        <span
          className="studio-editor-clip-handle is-right"
          onPointerDown={(event) => onPointerDown(event, "trim-right")}
        />
      )}
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

function TransitionJointMarker({ joint, leftClip, pps, selected, onSelect }) {
  const left = joint.time * pps - 10;
  const hasTransition = leftClip?.transitionOut?.type && leftClip.transitionOut.type !== "none";
  return (
    <button
      type="button"
      className={`studio-editor-joint${selected ? " is-selected" : ""}${hasTransition ? " has-transition" : ""}`}
      style={{ left: Math.max(0, left) }}
      title={hasTransition ? transitionLabel(leftClip.transitionOut.type) : "Add transition"}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(joint.key);
      }}
    >
      <Sparkles size={11} aria-hidden="true" />
    </button>
  );
}

function TrackRailButton({ track, onToggleMute }) {
  if (track.kind === "audio") {
    return (
      <div className="studio-editor-track-rail-inner">
        <span className="studio-editor-track-label">{track.label}</span>
        <button
          type="button"
          className={`studio-editor-track-btn${track.muted ? " is-active" : ""}`}
          aria-label={track.muted ? "Unmute track" : "Mute track"}
          title={track.muted ? "Unmute" : "Mute"}
          onClick={() => onToggleMute(track.id)}
        >
          {track.muted ? <VolumeX size={ICON} aria-hidden="true" /> : <Volume2 size={ICON} aria-hidden="true" />}
        </button>
      </div>
    );
  }

  if (track.kind === "text") {
    return (
      <div className="studio-editor-track-rail-inner" title="Text layer">
        <span className="studio-editor-track-label">{track.label}</span>
        <Type size={ICON} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="studio-editor-track-rail-inner" title={track.label}>
      <span className="studio-editor-track-label">{track.label}</span>
      <Film size={ICON} aria-hidden="true" />
    </div>
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
  pixelsPerSecond,
  onPlayingChange,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  onZoom,
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
        <button type="button" disabled={!canSplit} onClick={onSplit} title="Split at playhead (S)" aria-label="Split">
          <Scissors size={ICON} aria-hidden="true" />
        </button>
        <button type="button" disabled={!hasSelection} onClick={onDelete} title="Delete clip (Del)" aria-label="Delete">
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
      </div>
    </div>
  );
}

export function EditorTimeline({
  project,
  playhead,
  pixelsPerSecond,
  selectedClipId,
  selectedJointKey,
  editorMode,
  mediaById,
  onSelectClip,
  onSelectJoint,
  onSetPlayhead,
  onAddClip,
  onMoveClip,
  onTrimClip,
  onToggleTrackMute,
  onApplyTrackLayout,
  onRippleAddClip,
}) {
  const scrollRef = useRef(null);
  const trackRowRefs = useRef(new Map());
  const timelineWidth = Math.max(project.duration * pixelsPerSecond + 240, 720);
  const [dropPreview, setDropPreview] = useState(null);
  const [ripplePreview, setRipplePreview] = useState(null);
  const [snapGuideTime, setSnapGuideTime] = useState(null);
  const snapThreshold = snapThresholdSec(pixelsPerSecond);

  const resolveTrackAtY = useCallback(
    (clientY) => {
      for (const track of project.tracks) {
        const row = trackRowRefs.current.get(track.id);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return track.id;
        }
      }
      return null;
    },
    [project.tracks],
  );

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
      const centerTime = rawStart + payload.duration / 2;
      const tempClip = {
        id: "__drop-preview__",
        trackId: track.id,
        startTime: rawStart,
        trimIn: 0,
        trimOut: payload.duration,
        label: payload.name,
        kind: clipKindForTrack(track.kind, payload.mediaKind),
        assetId: payload.assetId,
      };
      const placements = computeRippleInsertForNewClip({
        project,
        trackId: track.id,
        clip: tempClip,
        centerTime,
      });
      setRipplePreview({
        trackId: track.id,
        draggedClipId: tempClip.id,
        placements,
      });
      setSnapGuideTime(null);
      setDropPreview({
        trackId: track.id,
        assetId: payload.assetId,
        startTime: placements.find((p) => p.clipId === tempClip.id)?.startTime ?? rawStart,
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
    setRipplePreview((prev) => (prev?.trackId === track.id ? null : prev));
    setSnapGuideTime(null);
  }, []);

  const onTrackDrop = useCallback(
    (event, track) => {
      event.preventDefault();
      event.stopPropagation();
      setDropPreview(null);
      setRipplePreview(null);
      setSnapGuideTime(null);

      const payload = readTimelineDropPayload(event);
      if (!payload || !trackAcceptsMediaKind(track.kind, payload.mediaKind)) return;

      const lane = event.currentTarget.querySelector(".studio-editor-track-lane");
      const rawStart = timeFromClientX(event.clientX, lane);
      const centerTime = rawStart + payload.duration / 2;

      if (onRippleAddClip) {
        onRippleAddClip({
          assetId: payload.assetId,
          trackId: track.id,
          startTime: rawStart,
          trimIn: 0,
          trimOut: payload.duration,
          sourceDuration: payload.duration,
          label: payload.name,
          kind: clipKindForTrack(track.kind, payload.mediaKind),
          centerTime,
        });
        return;
      }

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
    [onAddClip, onRippleAddClip, timeFromClientX, project, playhead, snapThreshold],
  );

  useEffect(() => {
    const clearPreview = () => {
      setDropPreview(null);
      setRipplePreview(null);
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
            const trackHeight = trackHeightForKind(track.kind);
            const preview = dropPreview?.trackId === track.id ? dropPreview : null;
            const trackRipple = ripplePreview?.trackId === track.id ? ripplePreview : null;
            const rippleClipIds = new Set(trackRipple?.placements.map((p) => p.clipId) ?? []);
            return (
              <div
                key={track.id}
                ref={(node) => {
                  if (node) trackRowRefs.current.set(track.id, node);
                  else trackRowRefs.current.delete(track.id);
                }}
                className={`studio-editor-track-row is-${track.kind}${preview ? " is-drop-target" : ""}${trackRipple ? " is-ripple-active" : ""}`}
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
                      onSelectJoint?.(null);
                      onSetPlayhead(timeFromClientX(event.clientX, event.currentTarget));
                    }
                  }}
                >
                  {trackRipple ? (
                    <div className="studio-editor-ripple-layer" aria-hidden="true">
                      {trackRipple.placements.map((placement) => {
                        const ghostClip =
                          placement.clipId === "__drop-preview__"
                            ? {
                                id: "__drop-preview__",
                                trackId: track.id,
                                startTime: placement.startTime,
                                trimIn: 0,
                                trimOut: preview?.duration ?? 4,
                                label: preview?.name ?? "New clip",
                                kind: track.kind,
                                assetId: preview?.assetId,
                              }
                            : project.clips.find((c) => c.id === placement.clipId);
                        if (!ghostClip) return null;
                        const media = mediaById?.get(ghostClip.assetId);
                        return (
                          <RippleGhostClip
                            key={`ghost-${placement.clipId}`}
                            clip={ghostClip}
                            startTime={placement.startTime}
                            pps={pixelsPerSecond}
                            media={media}
                            isDragged={placement.clipId === trackRipple.draggedClipId}
                          />
                        );
                      })}
                    </div>
                  ) : null}
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
                          rippleActive={Boolean(trackRipple && rippleClipIds.has(clip.id))}
                          onSelect={(id) => {
                            onSelectJoint?.(null);
                            onSelectClip(id);
                          }}
                          onMove={onMoveClip}
                          onSnapGuide={setSnapGuideTime}
                          onRipplePreview={setRipplePreview}
                          onApplyRippleLayout={onApplyTrackLayout}
                          resolveTrackAtY={resolveTrackAtY}
                          onTrim={(clipId, trimIn, trimOut, startTime, live) => {
                            onTrimClip(clipId, trimIn, trimOut, startTime, live);
                          }}
                        />
                      );
                    })}
                  {track.kind === "video" && !trackRipple
                    ? transitionJointsOnTrack(project, track.id).map((joint) => (
                        <TransitionJointMarker
                          key={joint.key}
                          joint={joint}
                          leftClip={project.clips.find((c) => c.id === joint.leftClipId)}
                          pps={pixelsPerSecond}
                          selected={selectedJointKey === joint.key}
                          onSelect={onSelectJoint}
                        />
                      ))
                    : null}
                  <DropGhost preview={trackRipple ? null : preview} pps={pixelsPerSecond} mediaById={mediaById} />
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
