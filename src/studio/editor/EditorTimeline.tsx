// @ts-nocheck
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
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
  Sparkles,
} from "lucide-react";
import { transitionLabel } from "./editorEffects";
import { transitionJointsOnTrack, visibleTracks } from "./editorTimelineUtils";
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
import { ClipAudioWaveform } from "./ClipAudioWaveform";
import { ClipFilmstrip } from "./ClipFilmstrip";
import {
  AUDIO_TRACK_HEIGHT,
  MAX_PPS,
  MIN_PPS,
  RULER_HEIGHT,
  TEXT_TRACK_HEIGHT,
  TRACK_INSERT_HEIGHT,
  TRACK_RAIL_WIDTH,
  VIDEO_TRACK_HEIGHT,
} from "./types";

function trackHeightForKind(kind) {
  if (kind === "text") return TEXT_TRACK_HEIGHT;
  if (kind === "audio") return AUDIO_TRACK_HEIGHT;
  return VIDEO_TRACK_HEIGHT;
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
      ) : isVideo ? (
        <ClipFilmstrip
          media={media}
          label={clip.label}
          widthPx={width}
          trimIn={clip.trimIn}
          trimOut={clip.trimOut}
        />
      ) : clip.kind === "audio" ? (
        <ClipAudioWaveform clipId={clip.id} widthPx={width} />
      ) : null}
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
  onMoveToTrack,
  onTrim,
  onSnapGuide,
  resolveDropTarget,
  onHighlightInsert,
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

  const onPointerDown = (event, mode) => {
    // Let middle-click / Alt+drag bubble for timeline pan.
    if (event.button === 1 || event.altKey) return;
    if (event.button !== 0) return;
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
    let lastInsertAt = null;
    let freeMove = false;
    let moved = mode !== "move";
    setDragging(mode);

    const targetEl = event.currentTarget;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const onMoveEvent = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;

      const disableSnap = moveEvent.altKey;
      const deltaPx = dx;
      const deltaSec = deltaPx / pps;

      if (mode === "move") {
        const target = resolveDropTarget?.(moveEvent.clientY, clip.kind);
        let allowedTrackId = originTrackId;
        lastInsertAt = null;
        onHighlightInsert?.(null);

        if (target?.type === "insert") {
          lastInsertAt = target.index;
          onHighlightInsert?.(target.index);
        } else if (target?.type === "track") {
          allowedTrackId = target.trackId;
        }

        const rawStart = Math.max(0, originStart + deltaSec);
        freeMove = disableSnap;

        if (disableSnap || lastInsertAt !== null) {
          onRipplePreview?.(null);
          const trackForSnap = allowedTrackId || originTrackId;
          const moveSnapTimes = collectSnapTimes(project, trackForSnap, clip.id, playhead);
          const { startTime, guide } = snapClipMove(clip, rawStart, moveSnapTimes, thresholdSec, true);
          lastStart = startTime;
          lastTrackId = allowedTrackId;
          onSnapGuide?.(guide);
          if (lastInsertAt == null) {
            onMove(clip.id, startTime, lastTrackId !== originTrackId ? lastTrackId : undefined, true);
          }
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
      onHighlightInsert?.(null);
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (mode === "move") {
        if (!moved) return;
        if (lastInsertAt !== null) {
          onMoveToTrack?.({
            clipId: clip.id,
            startTime: lastStart,
            insertTrackAt: lastInsertAt,
            ripplePlacements: !freeMove ? lastRipplePlacements : undefined,
          });
        } else if (!freeMove && lastRipplePlacements?.length) {
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
      <div className="studio-editor-clip-body">
        {isText ? (
          <span className="studio-editor-clip-label is-text">{clip.text?.text || clip.label}</span>
        ) : isVideo ? (
          <ClipFilmstrip
            media={media}
            label={clip.label}
            widthPx={widthPx}
            trimIn={clip.trimIn}
            trimOut={clip.trimOut}
          />
        ) : (
          <ClipAudioWaveform clipId={clip.id} widthPx={widthPx} />
        )}
      </div>
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

function TrackInsertZone({ index, active, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className={`studio-editor-track-insert${active ? " is-active" : ""}`}
      style={{ height: TRACK_INSERT_HEIGHT, marginLeft: TRACK_RAIL_WIDTH }}
      onDragOver={(event) => onDragOver(event, index)}
      onDragLeave={(event) => onDragLeave(event, index)}
      onDrop={(event) => onDrop(event, index)}
      aria-hidden="true"
    />
  );
}

function DropGhost({ preview, pps, mediaById }) {
  if (!preview) return null;
  const width = Math.max(preview.duration * pps, 28);
  const media = preview.assetId ? mediaById?.get(preview.assetId) : null;
  const isAudio = media?.kind === "audio";
  return (
    <div
      className={`studio-editor-drop-ghost${isAudio ? " is-audio" : ""}`}
      style={{ left: preview.startTime * pps, width }}
      aria-hidden="true"
    >
      {isAudio ? (
        <ClipAudioWaveform clipId={preview.assetId || preview.name} widthPx={width} />
      ) : (
        <ClipFilmstrip
          media={media}
          label={preview.name}
          widthPx={width}
          trimIn={0}
          trimOut={preview.duration ?? 4}
        />
      )}
    </div>
  );
}

const MIN_TRANSITION_DURATION = 0.1;
const MAX_TRANSITION_DURATION = 2;

function maxTransitionDurationForJoint(leftClip, rightClip) {
  const leftDur = leftClip ? clipDuration(leftClip) : MAX_TRANSITION_DURATION;
  const rightDur = rightClip ? clipDuration(rightClip) : MAX_TRANSITION_DURATION;
  return Math.max(
    MIN_TRANSITION_DURATION,
    Math.min(MAX_TRANSITION_DURATION, leftDur * 0.45, rightDur * 0.45),
  );
}

function TransitionJointMarker({
  joint,
  leftClip,
  rightClip,
  pps,
  selected,
  onSelect,
  onSetTransition,
}) {
  const hasTransition = leftClip?.transitionOut?.type && leftClip.transitionOut.type !== "none";
  const duration = Number(leftClip?.transitionOut?.duration) || 0.5;
  const widthPx = hasTransition ? Math.max(28, duration * pps) : 18;
  const left = joint.time * pps - widthPx / 2;

  const onHandlePointerDown = (event, side) => {
    if (!hasTransition || !leftClip?.transitionOut) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(joint.key);

    const startX = event.clientX;
    const originDuration = Number(leftClip.transitionOut.duration) || 0.5;
    const type = leftClip.transitionOut.type;
    const maxDuration = maxTransitionDurationForJoint(leftClip, rightClip);
    let lastDuration = originDuration;
    const targetEl = event.currentTarget;
    targetEl.setPointerCapture?.(event.pointerId);

    const onMoveEvent = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      // Left handle: drag outward (left) increases duration; right handle opposite.
      const deltaSec = (side === "left" ? -dx : dx) / pps;
      const next = Math.min(
        maxDuration,
        Math.max(MIN_TRANSITION_DURATION, originDuration + deltaSec),
      );
      const rounded = Math.round(next * 100) / 100;
      if (rounded === lastDuration) return;
      lastDuration = rounded;
      onSetTransition?.(joint.key, { type, duration: rounded }, true);
    };

    const onUp = (upEvent) => {
      try {
        targetEl.releasePointerCapture?.(upEvent.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      onSetTransition?.(joint.key, { type, duration: lastDuration }, false);
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <button
      type="button"
      className={`studio-editor-joint${hasTransition ? " has-transition" : " is-adder"}${selected ? " is-selected" : ""}`}
      style={{ left: Math.max(0, left), width: widthPx }}
      title={
        hasTransition
          ? `${transitionLabel(leftClip.transitionOut.type)} · ${duration.toFixed(2)}s — drag edges to resize`
          : "Add transition"
      }
      onClick={(event) => {
        event.stopPropagation();
        onSelect(joint.key);
      }}
    >
      {hasTransition ? (
        <>
          <span
            className="studio-editor-joint-handle is-left"
            onPointerDown={(event) => onHandlePointerDown(event, "left")}
          />
          <span
            className="studio-editor-joint-handle is-right"
            onPointerDown={(event) => onHandlePointerDown(event, "right")}
          />
        </>
      ) : (
        <Sparkles size={11} aria-hidden="true" />
      )}
    </button>
  );
}

function TrackRailButton({ track, onToggleMute }) {
  if (track.kind === "audio") {
    return (
      <div className="studio-editor-track-rail-inner">
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
      <div className="studio-editor-track-rail-inner" title="Text">
        <Type size={ICON} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="studio-editor-track-rail-inner" title="Video">
      <button
        type="button"
        className={`studio-editor-track-btn${track.muted ? " is-active" : ""}`}
        aria-label={track.muted ? "Unmute track" : "Mute track"}
        title={track.muted ? "Unmute" : "Mute"}
        onClick={() => onToggleMute?.(track.id)}
      >
        {track.muted ? <VolumeX size={ICON} aria-hidden="true" /> : <Volume2 size={ICON} aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Nice time steps (seconds) for ruler marks — denser as zoom (pps) increases. */
const RULER_NICE_STEPS = [
  1 / 30, // 1 frame @ 30fps
  1 / 15,
  0.1,
  0.2,
  0.5,
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
];

function pickNiceStep(pps, minPx) {
  for (const step of RULER_NICE_STEPS) {
    if (step * pps >= minPx) return step;
  }
  return RULER_NICE_STEPS[RULER_NICE_STEPS.length - 1];
}

/** Minor ≈ 8px apart, major ≈ 72px — more lines the more you zoom in. */
function rulerScale(pps) {
  const minor = pickNiceStep(pps, 8);
  let major = pickNiceStep(pps, 72);
  if (major < minor * 2) {
    major = minor * 5;
  }
  // Keep an even subdivision count (5 or 10) so the grid reads cleanly.
  const ratio = Math.round(major / minor);
  if (ratio >= 8) major = minor * 10;
  else if (ratio >= 4) major = minor * 5;
  else major = minor * Math.max(2, ratio);
  return { major, minor };
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
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onDelete}
          title="Delete selection (Del)"
          aria-label="Delete"
        >
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
  onMoveToTrack,
  onZoom,
  onSetJointTransition,
}) {
  const scrollRef = useRef(null);
  const trackRowRefs = useRef(new Map());
  const insertZoneRefs = useRef(new Map());
  const zoomAnchorRef = useRef(null);
  const timelineWidth = Math.max(project.duration * pixelsPerSecond + 240, 720);
  const [dropPreview, setDropPreview] = useState(null);
  const [ripplePreview, setRipplePreview] = useState(null);
  const [snapGuideTime, setSnapGuideTime] = useState(null);
  const [activeInsert, setActiveInsert] = useState(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [panning, setPanning] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const displayTracks = useMemo(() => visibleTracks(project), [project.tracks, project.clips]);
  const snapThreshold = snapThresholdSec(pixelsPerSecond);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const anchor = zoomAnchorRef.current;
    if (!scroll || !anchor) return;
    scroll.scrollLeft = Math.max(
      0,
      anchor.time * pixelsPerSecond + TRACK_RAIL_WIDTH - anchor.xInView,
    );
    zoomAnchorRef.current = null;
  }, [pixelsPerSecond]);

  const zoomAtClientX = useCallback(
    (clientX, deltaY) => {
      if (!onZoom) return;
      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const xInView = clientX - rect.left;
      const time = Math.max(
        0,
        (scroll.scrollLeft + xInView - TRACK_RAIL_WIDTH) / Math.max(pixelsPerSecond, 1),
      );
      const factor = deltaY > 0 ? 0.9 : 1.12;
      const next = Math.max(MIN_PPS, Math.min(MAX_PPS, Math.round(pixelsPerSecond * factor)));
      if (next === pixelsPerSecond) return;
      zoomAnchorRef.current = { time, xInView };
      onZoom(next);
    },
    [onZoom, pixelsPerSecond],
  );

  const beginTimelinePan = useCallback((event) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const originLeft = scroll.scrollLeft;
    const originTop = scroll.scrollTop;
    setPanning(true);
    document.body.classList.add("is-timeline-panning");

    const onMove = (moveEvent) => {
      scroll.scrollLeft = originLeft - (moveEvent.clientX - startX);
      scroll.scrollTop = originTop - (moveEvent.clientY - startY);
    };
    const onUp = () => {
      setPanning(false);
      document.body.classList.remove("is-timeline-panning");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  const onTimelineWheel = useCallback(
    (event) => {
      const scroll = scrollRef.current;
      if (!scroll) return;

      // Pinch / Ctrl/Cmd + wheel → zoom toward cursor.
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAtClientX(event.clientX, event.deltaY);
        return;
      }

      // Shift + wheel → horizontal pan in time.
      if (event.shiftKey) {
        event.preventDefault();
        scroll.scrollLeft += event.deltaY;
        return;
      }

      // Horizontal trackpad swipe → pan in time.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        scroll.scrollLeft += event.deltaX;
        return;
      }

      // Plain vertical scroll moves the timeline space up/down (native).
    },
    [zoomAtClientX],
  );

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    // Non-passive so we can preventDefault for zoom/pan.
    scroll.addEventListener("wheel", onTimelineWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", onTimelineWheel);
  }, [onTimelineWheel]);

  const resolveDropTarget = useCallback(
    (clientY, clipKind) => {
      const gapPx = 7;
      const tracks = visibleTracks(project);

      for (let index = 0; index <= tracks.length; index += 1) {
        let boundaryY = null;
        if (index === 0) {
          const first = tracks[0] ? trackRowRefs.current.get(tracks[0].id) : null;
          if (first) boundaryY = first.getBoundingClientRect().top;
        } else if (index === tracks.length) {
          const last = tracks[tracks.length - 1]
            ? trackRowRefs.current.get(tracks[tracks.length - 1].id)
            : null;
          if (last) boundaryY = last.getBoundingClientRect().bottom;
        } else {
          const prev = trackRowRefs.current.get(tracks[index - 1]!.id);
          const next = trackRowRefs.current.get(tracks[index]!.id);
          if (prev && next) {
            const prevRect = prev.getBoundingClientRect();
            const nextRect = next.getBoundingClientRect();
            boundaryY = (prevRect.bottom + nextRect.top) / 2;
          }
        }
        if (boundaryY !== null && Math.abs(clientY - boundaryY) <= gapPx) {
          const insertAt =
            index >= tracks.length
              ? project.tracks.length
              : project.tracks.findIndex((t) => t.id === tracks[index]!.id);
          return { type: "insert", index: insertAt };
        }
      }

      for (const track of tracks) {
        const row = trackRowRefs.current.get(track.id);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          if (track.kind === clipKind) return { type: "track", trackId: track.id };
          return null;
        }
      }
      return null;
    },
    [project],
  );

  const timeFromClientX = useCallback(
    (clientX, laneEl) => {
      const scroll = scrollRef.current;
      if (!scroll || !laneEl) return 0;
      const rect = laneEl.getBoundingClientRect();
      const x = clientX - rect.left + scroll.scrollLeft;
      return Math.max(0, Math.min(project.duration, x / pixelsPerSecond));
    },
    [pixelsPerSecond, project.duration],
  );

  /** Click-drag scrub on the ruler, empty lanes, or playhead. */
  const beginPlayheadScrub = useCallback(
    (event, source) => {
      if (event.button === 1 || event.altKey) {
        beginTimelinePan(event);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const el = event.currentTarget;
      const apply = (clientX) => {
        if (source === "ruler") {
          const rect = el.getBoundingClientRect();
          const x = clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
          onSetPlayhead(Math.max(0, Math.min(project.duration, x / pixelsPerSecond)));
          return;
        }
        if (source === "playhead") {
          const canvas = el.closest(".studio-editor-timeline-canvas");
          const scroll = scrollRef.current;
          if (!canvas || !scroll) return;
          const canvasRect = canvas.getBoundingClientRect();
          const x = clientX - canvasRect.left + scroll.scrollLeft - TRACK_RAIL_WIDTH;
          onSetPlayhead(Math.max(0, Math.min(project.duration, x / pixelsPerSecond)));
          return;
        }
        onSetPlayhead(timeFromClientX(clientX, el));
      };

      apply(event.clientX);
      setScrubbing(true);
      el.setPointerCapture?.(event.pointerId);

      const onMove = (moveEvent) => {
        apply(moveEvent.clientX);
      };
      const onUp = (upEvent) => {
        try {
          el.releasePointerCapture?.(upEvent.pointerId);
        } catch {
          /* already released */
        }
        setScrubbing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [beginTimelinePan, onSetPlayhead, pixelsPerSecond, project.duration, timeFromClientX],
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

  const onInsertDragOver = useCallback(
    (event, index) => {
      if (!isTimelineDropDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setActiveInsert(index);
      setDropPreview(null);
      setRipplePreview(null);
    },
    [],
  );

  const onInsertDragLeave = useCallback((event, index) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setActiveInsert((prev) => (prev === index ? null : prev));
  }, []);

  const onInsertDrop = useCallback(
    (event, index) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveInsert(null);
      setDropPreview(null);
      setRipplePreview(null);
      setSnapGuideTime(null);

      const payload = readTimelineDropPayload(event);
      if (!payload) return;

      const lane = scrollRef.current?.querySelector(".studio-editor-track-row .studio-editor-track-lane");
      const rawStart = lane ? timeFromClientX(event.clientX, lane) : 0;
      const centerTime = rawStart + payload.duration / 2;
      const kind = payload.mediaKind === "audio" ? "audio" : "video";

      onRippleAddClip?.({
        assetId: payload.assetId,
        trackId: "",
        startTime: rawStart,
        trimIn: 0,
        trimOut: payload.duration,
        sourceDuration: payload.duration,
        label: payload.name,
        kind,
        centerTime,
        insertTrackAt: index,
      });
    },
    [onRippleAddClip, timeFromClientX],
  );

  useEffect(() => {
    const onDragEnter = (event) => {
      if (isTimelineDropDrag(event)) setExternalDrag(true);
    };
    const clearPreview = () => {
      setDropPreview(null);
      setRipplePreview(null);
      setSnapGuideTime(null);
      setActiveInsert(null);
      setExternalDrag(false);
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragend", clearPreview);
    document.addEventListener("drop", clearPreview);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragend", clearPreview);
      document.removeEventListener("drop", clearPreview);
    };
  }, []);

  const { major: majorStep, minor: minorStep } = rulerScale(pixelsPerSecond);
  const majorTicks = [];
  const minorTicks = [];
  const majorsEvery = Math.max(1, Math.round(majorStep / minorStep));
  const tickCount = Math.floor(project.duration / minorStep + 1e-9) + 1;
  for (let i = 0; i < tickCount; i += 1) {
    const t = Number((i * minorStep).toFixed(4));
    if (t > project.duration + 1e-6) break;
    if (i % majorsEvery === 0) majorTicks.push(t);
    else minorTicks.push(t);
  }

  return (
    <div className={`studio-editor-timeline-wrap${panning ? " is-panning" : ""}`}>
      <div
        className="studio-editor-timeline-scroll"
        ref={scrollRef}
        onPointerDown={(event) => {
          if (event.button === 1 || (event.button === 0 && event.altKey)) {
            beginTimelinePan(event);
          }
        }}
        onAuxClick={(event) => {
          // Prevent middle-click autoscroll chrome.
          if (event.button === 1) event.preventDefault();
        }}
      >
        <div className="studio-editor-timeline-canvas" style={{ width: timelineWidth }}>
          <div
            className="studio-editor-ruler"
            style={{ height: RULER_HEIGHT, marginLeft: TRACK_RAIL_WIDTH }}
            onPointerDown={(event) => beginPlayheadScrub(event, "ruler")}
            title="Click or drag to seek · Ctrl+scroll to zoom"
          >
            {minorTicks.map((tick) => (
              <span
                key={`m-${tick}`}
                className="studio-editor-ruler-mark is-minor"
                style={{ left: tick * pixelsPerSecond }}
                aria-hidden="true"
              />
            ))}
            {majorTicks.map((tick) => (
              <span
                key={`M-${tick}`}
                className="studio-editor-ruler-mark is-major"
                style={{ left: tick * pixelsPerSecond }}
              >
                <span className="studio-editor-ruler-label">{formatTimecodeRuler(tick)}</span>
              </span>
            ))}
          </div>
          {displayTracks.map((track) => {
            const trackIndex = project.tracks.findIndex((item) => item.id === track.id);
            const trackHeight = trackHeightForKind(track.kind);
            const preview = dropPreview?.trackId === track.id ? dropPreview : null;
            const trackRipple = ripplePreview?.trackId === track.id ? ripplePreview : null;
            const rippleClipIds = new Set(trackRipple?.placements.map((p) => p.clipId) ?? []);
            return (
              <div key={track.id}>
                <div
                  ref={(node) => {
                    if (node) insertZoneRefs.current.set(trackIndex, node);
                    else insertZoneRefs.current.delete(trackIndex);
                  }}
                  className={`studio-editor-track-insert-wrap${externalDrag || activeInsert !== null ? " is-visible" : ""}`}
                >
                  <TrackInsertZone
                    index={trackIndex}
                    active={activeInsert === trackIndex}
                    onDragOver={onInsertDragOver}
                    onDragLeave={onInsertDragLeave}
                    onDrop={onInsertDrop}
                  />
                </div>
                <div
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
                    if (event.target !== event.currentTarget) return;
                    onSelectClip(null);
                    onSelectJoint?.(null);
                    beginPlayheadScrub(event, "lane");
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
                          onMoveToTrack={onMoveToTrack}
                          onSnapGuide={setSnapGuideTime}
                          onHighlightInsert={setActiveInsert}
                          onRipplePreview={setRipplePreview}
                          onApplyRippleLayout={onApplyTrackLayout}
                          resolveDropTarget={resolveDropTarget}
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
                          rightClip={project.clips.find((c) => c.id === joint.rightClipId)}
                          pps={pixelsPerSecond}
                          selected={selectedJointKey === joint.key}
                          onSelect={onSelectJoint}
                          onSetTransition={onSetJointTransition}
                        />
                      ))
                    : null}
                  <DropGhost preview={trackRipple ? null : preview} pps={pixelsPerSecond} mediaById={mediaById} />
                </div>
              </div>
              </div>
            );
          })}
          <div
            ref={(node) => {
              if (node) insertZoneRefs.current.set(project.tracks.length, node);
              else insertZoneRefs.current.delete(project.tracks.length);
            }}
            className={`studio-editor-track-insert-wrap${externalDrag || activeInsert !== null ? " is-visible" : ""}`}
          >
            <TrackInsertZone
              index={project.tracks.length}
              active={activeInsert === project.tracks.length}
              onDragOver={onInsertDragOver}
              onDragLeave={onInsertDragLeave}
              onDrop={onInsertDrop}
            />
          </div>
          <div
            className={`studio-editor-playhead${scrubbing ? " is-scrubbing" : ""}`}
            style={{ left: TRACK_RAIL_WIDTH + playhead * pixelsPerSecond }}
            onPointerDown={(event) => beginPlayheadScrub(event, "playhead")}
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
