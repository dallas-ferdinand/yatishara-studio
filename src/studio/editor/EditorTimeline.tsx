// @ts-nocheck
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GripVertical,
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
  Sparkles,
  Magnet,
} from "lucide-react";
import {
  transitionLabel,
  clampAudioFadePair,
  clampAudioFadeSec,
  resolveAudioFadePair,
} from "./editorEffects";
import { transitionJointsOnTrack, visibleTracks } from "./editorTimelineUtils";
import { computeRippleLayout, isMainStoryTrack, collapsePlacementsForTrack } from "./editorRipple";
import { clipCanSplitAt, clipDuration, formatTimecodeFull, formatTimecodeRuler } from "./editorState";
import { MIN_CLIP_SEC, quantizeToFrame } from "./projectContract";
import {
  collectSnapTimes,
  snapClipMove,
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
  TRACK_INSERT_HIT_PX,
  TRACK_RAIL_WIDTH,
  VIDEO_TRACK_HEIGHT,
} from "./types";

function trackHeightForKind(kind) {
  if (kind === "text") return TEXT_TRACK_HEIGHT;
  if (kind === "audio") return AUDIO_TRACK_HEIGHT;
  return VIDEO_TRACK_HEIGHT;
}

/** Dark bottom mask + white name; double-click to rename. */
function ClipNameBadge({ label, editable = false, onRename, renameToken }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  useEffect(() => {
    if (renameToken == null || !editable || !onRename) return;
    setEditing(true);
  }, [renameToken, editable, onRename]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== label) onRename?.(next);
    else setDraft(label);
  };

  const stopWhileEditing = (event) => {
    event.stopPropagation();
  };

  if (editing && editable) {
    return (
      <input
        ref={inputRef}
        className="studio-editor-clip-name is-editing"
        value={draft}
        size={Math.max(draft.length || 1, 4)}
        aria-label="Clip name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(label);
            setEditing(false);
          }
          event.stopPropagation();
        }}
        onPointerDown={stopWhileEditing}
        onClick={stopWhileEditing}
        onDoubleClick={stopWhileEditing}
      />
    );
  }

  return (
    <span
      className={`studio-editor-clip-name${editable ? " is-editable" : ""}`}
      title={editable ? `${label} — double-click to rename` : label}
      onDoubleClick={(event) => {
        if (!editable || !onRename) return;
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {label}
    </span>
  );
}

/** CapCut-style soft scooped fade wedges — stronger early curve, eases into the handle. */
function ClipAudioFadeMask({ fadeInSec, fadeOutSec, clipDurationSec, pps }) {
  const duration = Math.max(0.05, clipDurationSec);
  const { fadeIn, fadeOut } = clampAudioFadePair(fadeInSec, fadeOutSec, duration);
  if (fadeIn <= 0 && fadeOut <= 0) return null;
  const inPx = Math.max(0, fadeIn * pps);
  const outPx = Math.max(0, fadeOut * pps);
  return (
    <div className="studio-editor-clip-fade-mask" aria-hidden="true">
      {inPx > 0 ? (
        <svg
          className="studio-editor-clip-fade is-in"
          width={inPx}
          height="100%"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Cubic: drops faster near the clip start, flatter into the diamond. */}
          <path d="M0 0 H1 C 0.72 0.06, 0.22 0.48, 0 1 Z" />
        </svg>
      ) : null}
      {outPx > 0 ? (
        <svg
          className="studio-editor-clip-fade is-out"
          width={outPx}
          height="100%"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M1 0 H0 C 0.28 0.06, 0.78 0.48, 1 1 Z" />
        </svg>
      ) : null}
    </div>
  );
}

/** Hit size of .studio-editor-clip-fade-handle — centers must stay ≥ this apart. */
const FADE_HANDLE_HIT_PX = 14;

/**
 * Place fade diamonds so they never overlap (edge-to-edge when fades meet).
 * Returns x positions for the handle centers within the clip width.
 */
function fadeHandleCentersPx(fadeInSec, fadeOutSec, widthPx, pps) {
  const minGap = FADE_HANDLE_HIT_PX;
  let inX = Math.max(0, fadeInSec * pps);
  let outX = Math.max(0, widthPx - fadeOutSec * pps);
  if (outX - inX < minGap) {
    const mid = (inX + outX) / 2;
    inX = mid - minGap / 2;
    outX = mid + minGap / 2;
  }
  const half = minGap / 2;
  inX = Math.max(half, Math.min(widthPx - half, inX));
  outX = Math.max(half, Math.min(widthPx - half, outX));
  if (outX - inX < minGap) {
    if (inX <= half + 0.5) {
      inX = half;
      outX = Math.min(widthPx - half, inX + minGap);
    } else {
      outX = widthPx - half;
      inX = Math.max(half, outX - minGap);
    }
  }
  return { inX, outX };
}

function clipLaneWidthPx(durationSec, pps) {
  return Math.max(1, durationSec * pps);
}

function RippleGhostClip({ clip, startTime, pps, media, isDragged }) {
  const width = clipLaneWidthPx(clipDuration(clip), pps);
  const isVideo = clip.kind === "video" || clip.kind === "image";
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
        <>
          <ClipFilmstrip
            media={media}
            label={clip.label}
            widthPx={width}
            trimIn={clip.trimIn}
            trimOut={clip.trimOut}
          />
          <ClipAudioFadeMask
            fadeInSec={clip.effects?.fadeIn ?? 0}
            fadeOutSec={clip.effects?.fadeOut ?? 0}
            clipDurationSec={clipDuration(clip)}
            pps={pps}
          />
          <ClipNameBadge label={clip.label} />
        </>
      ) : clip.kind === "audio" ? (
        <>
          <ClipAudioWaveform clipId={clip.id} widthPx={width} />
          <ClipAudioFadeMask
            fadeInSec={
              resolveAudioFadePair(clip.effects, clipDuration(clip), "audio").fadeIn
            }
            fadeOutSec={
              resolveAudioFadePair(clip.effects, clipDuration(clip), "audio").fadeOut
            }
            clipDurationSec={clipDuration(clip)}
            pps={pps}
          />
          <ClipNameBadge label={clip.label} />
        </>
      ) : null}
    </div>
  );
}

function FloatingPickupClip({ pickup }) {
  if (!pickup || typeof document === "undefined") return null;
  const { clip, media, widthPx, heightPx, clientX, clientY, grabX, grabY, viable } = pickup;
  const isVideo = clip.kind === "video" || clip.kind === "image";
  const isText = clip.kind === "text";
  const height =
    heightPx ??
    trackHeightForKind(isText ? "text" : clip.kind === "audio" ? "audio" : "video");
  const durationSec = clipDuration(clip);
  const pps = widthPx / Math.max(0.05, durationSec);
  return createPortal(
    <div
      className={`studio-editor-clip is-${clip.kind} is-pickup-float${viable ? "" : " is-not-viable"}`}
      style={{
        width: widthPx,
        height,
        transform: `translate(${clientX - grabX}px, ${clientY - grabY}px)`,
        zIndex: 1000001,
      }}
      aria-hidden="true"
    >
      <div className="studio-editor-clip-body">
        {isText ? (
          <span className="studio-editor-clip-label is-text">{clip.text?.text || clip.label}</span>
        ) : isVideo ? (
          <>
            <ClipFilmstrip
              media={media}
              label={clip.label}
              widthPx={widthPx}
              trimIn={clip.trimIn}
              trimOut={clip.trimOut}
            />
            <ClipAudioFadeMask
              fadeInSec={clip.effects?.fadeIn ?? 0}
              fadeOutSec={clip.effects?.fadeOut ?? 0}
              clipDurationSec={durationSec}
              pps={pps}
            />
            <ClipNameBadge label={clip.label} />
          </>
        ) : (
          <>
            <ClipAudioWaveform clipId={clip.id} widthPx={widthPx} />
            <ClipAudioFadeMask
              fadeInSec={
                resolveAudioFadePair(clip.effects, durationSec, "audio").fadeIn
              }
              fadeOutSec={
                resolveAudioFadePair(clip.effects, durationSec, "audio").fadeOut
              }
              clipDurationSec={durationSec}
              pps={pps}
            />
            <ClipNameBadge label={clip.label} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Themed landing-slot ghost — same width as the clip, accent tint (not a second filmstrip). */
function SlotDropGhost({ kind, startTime, widthPx, pps }) {
  if (startTime == null || !widthPx) return null;
  return (
    <div
      className={`studio-editor-slot-ghost is-${kind}`}
      style={{ left: startTime * pps, width: widthPx }}
      aria-hidden="true"
    />
  );
}

function DropGhost({ preview, pps, mediaById }) {
  if (!preview) return null;
  const width = clipLaneWidthPx(preview.duration, pps);
  const media = preview.assetId ? mediaById?.get(preview.assetId) : null;
  const kind = media?.kind === "audio" ? "audio" : "video";
  return (
    <div
      className={`studio-editor-slot-ghost is-${kind} is-media-drop`}
      style={{ left: preview.startTime * pps, width }}
      aria-hidden="true"
    >
      {kind === "audio" ? (
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
  onUpdateClip,
  onRename,
  onContextMenu,
  renameToken,
  onSnapGuide,
  resolveDropTarget,
  timeFromPointerX,
  onHighlightInsert,
  onRipplePreview,
  onPickupChange,
  rippleActive,
  rippleStartTime,
  isPickedUp,
  overlaySnapEnabled = true,
  onSplit,
  onPlayheadScrub,
  onPlayheadScrubbing,
}) {
  const durationSec = clipDuration(clip);
  const width = clipLaneWidthPx(durationSec, pps);
  const left = (rippleStartTime != null ? rippleStartTime : clip.startTime) * pps;
  const [dragging, setDragging] = useState(null);
  const [lifted, setLifted] = useState(false);
  const isVideo = clip.kind === "video" || clip.kind === "image";
  const isText = clip.kind === "text";
  /** Timeline diamonds edit picture fades only — audio fades are inspector-only. */
  const supportsPictureFade = clip.kind === "video" || clip.kind === "image";
  const thresholdSec = snapThresholdSec(pps);
  const widthPx = width;
  const pictureFadePair = clampAudioFadePair(
    clip.effects?.fadeIn ?? 0,
    clip.effects?.fadeOut ?? 0,
    durationSec,
  );
  const audioFadePair = resolveAudioFadePair(clip.effects, durationSec, clip.kind);
  // Video/image: show picture fade wedges + diamonds. Audio: show audio wedges only (no drag).
  const fadeInSec = supportsPictureFade ? pictureFadePair.fadeIn : audioFadePair.fadeIn;
  const fadeOutSec = supportsPictureFade ? pictureFadePair.fadeOut : audioFadePair.fadeOut;
  const fadeHandles = fadeHandleCentersPx(fadeInSec, fadeOutSec, widthPx, pps);

  const onPointerDown = (event, mode) => {
    // Let middle-click / Alt+drag bubble for timeline pan.
    if (event.button === 1 || event.altKey) return;
    if (event.button !== 0) return;
    // Fade/trim handles sit on the clip — never start a move/pickup from them.
    if (
      mode === "move" &&
      event.target?.closest?.(
        ".studio-editor-clip-fade-handle, .studio-editor-clip-handle, .studio-editor-clip-snip",
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const additive = Boolean(
      event.ctrlKey || event.metaKey || event.shiftKey,
    );
    onSelect(clip.id, { additive });
    // Modifier+click toggles selection only — do not start a drag.
    if (additive && mode === "move") return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originStart = clip.startTime;
    const originTrackId = clip.trackId;
    const originTrimIn = clip.trimIn;
    const originTrimOut = clip.trimOut;
    const originEffects = { ...(clip.effects ?? {}) };
    const originFadePair = clampAudioFadePair(
      originEffects.fadeIn ?? 0,
      originEffects.fadeOut ?? 0,
      durationSec,
    );
    const originFadeIn = originFadePair.fadeIn;
    const originFadeOut = originFadePair.fadeOut;
    const snapTimes = collectSnapTimes(project, clip.trackId, clip.id, playhead);
    const clipEl = event.currentTarget.closest?.(".studio-editor-clip") ?? event.currentTarget;
    const clipRect = clipEl.getBoundingClientRect();
    const grabX = event.clientX - clipRect.left;
    const grabY = event.clientY - clipRect.top;
    const pickupHeightPx = Math.max(1, clipRect.height);
    let lastStart = originStart;
    let lastTrackId = originTrackId;
    let lastTrimIn = originTrimIn;
    let lastTrimOut = originTrimOut;
    let lastFadeIn = originFadeIn;
    let lastFadeOut = originFadeOut;
    let lastInsertAt = null;
    let lastViable = false;
    let lastDropStart = originStart;
    let lastArrangeProbe = originStart;
    let moved = mode !== "move";
    let pickedUp = false;
    setDragging(mode);

    const targetEl = event.currentTarget;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const onMoveEvent = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;

      const deltaSec = dx / pps;

      if (mode === "move") {
        if (!pickedUp) {
          pickedUp = true;
          setLifted(true);
          document.body.classList.add("is-clip-pickup");
        }

        const target = resolveDropTarget?.(moveEvent.clientY, clip.kind);
        lastInsertAt = null;
        let allowedTrackId = null;
        lastViable = false;

        if (target?.type === "insert") {
          lastInsertAt = target.index;
          lastViable = true;
          onHighlightInsert?.({
            index: lastInsertAt,
            kind: clip.kind,
            mode: "insert",
          });
        } else if (target?.type === "track") {
          allowedTrackId = target.trackId;
          lastViable = true;
          onHighlightInsert?.(null);
        } else {
          onHighlightInsert?.(null);
        }

        const leftEdgeX = moveEvent.clientX - grabX;
        const rawStart = timeFromPointerX
          ? timeFromPointerX(leftEdgeX)
          : Math.max(0, originStart + deltaSec);
        const pointerTime = timeFromPointerX
          ? Math.max(0, timeFromPointerX(moveEvent.clientX))
          : Math.max(0, originStart + deltaSec);

        const destIsMain = Boolean(
          allowedTrackId && isMainStoryTrack(project, allowedTrackId),
        );

        if (allowedTrackId && !destIsMain) {
          const disableSnap =
            moveEvent.altKey || !lastViable || !overlaySnapEnabled;
          if (!disableSnap) {
            const overlaySnapTimes = collectSnapTimes(
              project,
              allowedTrackId,
              clip.id,
              playhead,
              { includeTimelineStart: true },
            );
            const { startTime, guide } = snapClipMove(
              clip,
              rawStart,
              overlaySnapTimes,
              thresholdSec,
              false,
            );
            lastStart = startTime;
            onSnapGuide?.(guide);
          } else {
            lastStart = Math.max(0, rawStart);
            onSnapGuide?.(null);
          }
        } else {
          // Magnetic snap by default on the main line (vertical guides); Alt disables.
          const disableSnap = moveEvent.altKey || !lastViable;
          if (!disableSnap) {
            const moveSnapTimes = collectSnapTimes(
              project,
              allowedTrackId ?? clip.trackId,
              clip.id,
              playhead,
              { includeTimelineStart: false },
            );
            const { startTime, guide } = snapClipMove(
              clip,
              rawStart,
              moveSnapTimes,
              thresholdSec,
              false,
            );
            lastStart = startTime;
            onSnapGuide?.(guide);
          } else {
            lastStart = Math.max(0, rawStart);
            onSnapGuide?.(null);
          }
        }
        lastTrackId = allowedTrackId;

        // Main line: probe insert with the pointer (aim between clips).
        // Overlay: left edge — gap fits stays put; too small / start shoves later clips.
        const arrangeProbe = destIsMain ? pointerTime : lastStart;
        lastArrangeProbe = arrangeProbe;

        lastDropStart = lastStart;
        if (allowedTrackId || lastInsertAt !== null) {
          const destTrackId = allowedTrackId;
          let placements = destTrackId
            ? computeRippleLayout({
                project,
                trackId: destTrackId,
                draggedClip: clip,
                centerTime: arrangeProbe,
              })
            : [];
          if (destTrackId) {
            lastDropStart =
              placements.find((p) => p.clipId === clip.id)?.startTime ?? lastStart;
          }

          // Leaving the main storyline — live-collapse the gap it leaves behind.
          const leavingMain =
            isMainStoryTrack(project, originTrackId) &&
            (lastInsertAt !== null ||
              (destTrackId !== null && destTrackId !== originTrackId));
          if (leavingMain) {
            placements = [
              ...placements,
              ...collapsePlacementsForTrack(project, originTrackId, clip.id),
            ];
          }

          onRipplePreview?.({
            trackId: destTrackId ?? originTrackId,
            draggedClipId: clip.id,
            placements,
          });
        } else {
          onRipplePreview?.(null);
        }

        onPickupChange?.({
          clipId: clip.id,
          clip,
          media,
          widthPx,
          heightPx: pickupHeightPx,
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
          grabX,
          grabY,
          viable: lastViable,
          hoverTrackId: allowedTrackId,
          dropStartTime: allowedTrackId ? lastDropStart : null,
        });
      } else if (mode === "trim-left") {
        const disableSnap = moveEvent.altKey;
        const rawTrimIn = Math.min(originTrimOut - MIN_CLIP_SEC, Math.max(0, originTrimIn + deltaSec));
        const trimDelta = rawTrimIn - originTrimIn;
        const rawStart = Math.max(0, originStart + trimDelta);
        const snapped = snapTrimLeft(clip, rawTrimIn, rawStart, snapTimes, thresholdSec, disableSnap);
        lastTrimIn = snapped.trimIn;
        lastStart = snapped.startTime;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, snapped.trimIn, originTrimOut, snapped.startTime, true);
      } else if (mode === "trim-right") {
        const disableSnap = moveEvent.altKey;
        const rawTrimOut = Math.max(originTrimIn + MIN_CLIP_SEC, originTrimOut + deltaSec);
        const snapped = snapTrimRight(clip, rawTrimOut, snapTimes, thresholdSec, disableSnap);
        lastTrimOut = snapped.trimOut;
        onSnapGuide?.(snapped.guide);
        onTrim(clip.id, originTrimIn, snapped.trimOut, undefined, true);
      } else if (mode === "fade-in") {
        lastFadeIn = clampAudioFadeSec(originFadeIn + deltaSec, durationSec, originFadeOut);
        onUpdateClip?.(
          clip.id,
          { effects: { ...originEffects, fadeIn: lastFadeIn, fadeOut: originFadeOut } },
          true,
        );
      } else if (mode === "fade-out") {
        lastFadeOut = clampAudioFadeSec(originFadeOut - deltaSec, durationSec, originFadeIn);
        onUpdateClip?.(
          clip.id,
          { effects: { ...originEffects, fadeIn: originFadeIn, fadeOut: lastFadeOut } },
          true,
        );
      }
    };

    const onUp = (upEvent) => {
      try {
        targetEl.releasePointerCapture?.(upEvent.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(null);
      setLifted(false);
      onSnapGuide?.(null);
      onRipplePreview?.(null);
      onHighlightInsert?.(null);
      onPickupChange?.(null);
      document.body.classList.remove("is-clip-pickup");
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (mode === "move") {
        if (!moved) return;
        // Re-resolve at release so a thin insert band isn't lost to the last hover jitter.
        const releaseTarget = resolveDropTarget?.(upEvent.clientY, clip.kind);
        let commitInsertAt = lastInsertAt;
        let commitTrackId = lastTrackId;
        if (releaseTarget?.type === "insert") {
          commitInsertAt = releaseTarget.index;
          commitTrackId = null;
        } else if (releaseTarget?.type === "track") {
          commitInsertAt = null;
          commitTrackId = releaseTarget.trackId;
        }
        if (commitInsertAt === null && !commitTrackId) return;

        if (commitInsertAt !== null) {
          onMoveToTrack?.({
            clipId: clip.id,
            startTime: lastArrangeProbe,
            insertTrackAt: commitInsertAt,
          });
        } else if (commitTrackId) {
          onMove(
            clip.id,
            lastArrangeProbe,
            commitTrackId !== originTrackId ? commitTrackId : undefined,
            false,
          );
        }
      } else if (mode === "trim-left") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, lastStart, false);
      } else if (mode === "trim-right") {
        onTrim(clip.id, lastTrimIn, lastTrimOut, undefined, false);
      } else if (mode === "fade-in") {
        onUpdateClip?.(
          clip.id,
          { effects: { ...originEffects, fadeIn: lastFadeIn, fadeOut: originFadeOut } },
          false,
        );
      } else if (mode === "fade-out") {
        onUpdateClip?.(
          clip.id,
          { effects: { ...originEffects, fadeIn: originFadeIn, fadeOut: lastFadeOut } },
          false,
        );
      }
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className={`studio-editor-clip is-${clip.kind}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${lifted || isPickedUp ? " is-picked-up" : ""}${rippleActive ? " is-ripple-shifting" : ""}`}
      style={{ left: isPickedUp ? 0 : Math.max(0, left), width: isPickedUp ? 0 : widthPx }}
      onPointerDown={(event) => onPointerDown(event, "move")}
      onContextMenu={(event) => {
        if (isPickedUp) return;
        // macOS Ctrl+click opens context menu — treat as multi-select instead.
        if (event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(clip.id, { additive: true });
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onSelect(clip.id, { additive: Boolean(event.shiftKey || event.metaKey) });
        onContextMenu?.(clip.id, event.clientX, event.clientY);
      }}
      title={clip.label}
      aria-hidden={isPickedUp || undefined}
    >
      <div className="studio-editor-clip-body">
        {isText ? (
          <span className="studio-editor-clip-label is-text">{clip.text?.text || clip.label}</span>
        ) : isVideo ? (
          <>
            <ClipFilmstrip
              media={media}
              label={clip.label}
              widthPx={widthPx}
              trimIn={clip.trimIn}
              trimOut={clip.trimOut}
            />
            <ClipAudioFadeMask
              fadeInSec={fadeInSec}
              fadeOutSec={fadeOutSec}
              clipDurationSec={durationSec}
              pps={pps}
            />
            <ClipNameBadge
              label={clip.label}
              editable={!isPickedUp}
              renameToken={renameToken}
              onRename={(next) => onRename?.(clip.id, next)}
            />
          </>
        ) : (
          <>
            <ClipAudioWaveform clipId={clip.id} widthPx={widthPx} />
            <ClipAudioFadeMask
              fadeInSec={fadeInSec}
              fadeOutSec={fadeOutSec}
              clipDurationSec={durationSec}
              pps={pps}
            />
            <ClipNameBadge
              label={clip.label}
              editable={!isPickedUp}
              renameToken={renameToken}
              onRename={(next) => onRename?.(clip.id, next)}
            />
          </>
        )}
      </div>
      {!isText ? (
        <>
          <span
            className="studio-editor-clip-handle is-left"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPointerDown(event, "trim-left");
            }}
          />
          <span
            className="studio-editor-clip-handle is-right"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPointerDown(event, "trim-right");
            }}
          />
          {supportsPictureFade && !isPickedUp && widthPx >= FADE_HANDLE_HIT_PX * 2 ? (
            <>
              <span
                className={`studio-editor-clip-fade-handle is-in${fadeInSec > 0 ? " is-active" : ""}`}
                style={{ left: fadeHandles.inX }}
                title="Picture fade in"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPointerDown(event, "fade-in");
                }}
              />
              <span
                className={`studio-editor-clip-fade-handle is-out${fadeOutSec > 0 ? " is-active" : ""}`}
                style={{ left: fadeHandles.outX }}
                title="Picture fade out"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPointerDown(event, "fade-out");
                }}
              />
            </>
          ) : null}
        </>
      ) : (
        <span
          className="studio-editor-clip-handle is-right"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPointerDown(event, "trim-right");
          }}
        />
      )}
      {!isText && !isPickedUp && !dragging && onSplit && clipCanSplitAt(clip, playhead) ? (
        <button
          type="button"
          className="studio-editor-clip-snip"
          style={{
            left: (playhead - (rippleStartTime != null ? rippleStartTime : clip.startTime)) * pps,
          }}
          title="Split here (S)"
          aria-label="Split clip at playhead"
          onPointerDown={(event) => {
            if (event.button === 1 || event.altKey) return;
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startY = event.clientY;
            let dragged = false;

            const applyScrub = (clientX) => {
              const time = timeFromPointerX ? timeFromPointerX(clientX) : playhead;
              onPlayheadScrub?.(quantizeToFrame(Math.max(0, time)));
            };

            const onMove = (moveEvent) => {
              if (
                !dragged &&
                Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4
              ) {
                return;
              }
              if (!dragged) {
                dragged = true;
                onPlayheadScrubbing?.(true);
              }
              applyScrub(moveEvent.clientX);
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", onUp);
              if (dragged) {
                onPlayheadScrubbing?.(false);
                return;
              }
              onSelect(clip.id);
              onSplit(clip.id);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
          }}
        >
          <span className="studio-editor-clip-snip-icon" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function LaneInsertSlot({ index, active, onDragOver, onDragLeave, onDrop, onClick }) {
  return (
    <div
      className={`studio-editor-track-insert-wrap${active ? " is-active" : ""}`}
      style={{ height: TRACK_INSERT_HIT_PX }}
      onDragOver={(event) => onDragOver?.(event, index)}
      onDragLeave={(event) => onDragLeave?.(event, index)}
      onDrop={(event) => onDrop?.(event, index)}
      onPointerDown={(event) => {
        if (!onClick || event.button !== 0 || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        onClick(index);
      }}
      aria-hidden="true"
    >
      <div
        className={`studio-editor-track-insert${active ? " is-active" : ""}`}
        style={{ marginLeft: TRACK_RAIL_WIDTH, height: TRACK_INSERT_HEIGHT }}
      />
    </div>
  );
}

const MIN_TRANSITION_DURATION = 0.1;
const MAX_TRANSITION_DURATION = 2;
/** Visible cut-adder chip — 4px was crushing the sparkles icon. */
const ADDER_JOINT_WIDTH_PX = 22;

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
  const widthPx = hasTransition
    ? Math.max(8, duration * pps)
    : ADDER_JOINT_WIDTH_PX;
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
        <Sparkles size={12} strokeWidth={2.25} aria-hidden="true" />
      )}
    </button>
  );
}

function TrackRailButton({ track, onToggleMute, onReorderPointerDown, reordering }) {
  return (
    <div className={`studio-editor-track-rail-inner${reordering ? " is-reordering" : ""}`}>
      <button
        type="button"
        className="studio-editor-track-btn is-grip"
        aria-label="Reorder lane"
        title="Drag to reorder lane"
        onPointerDown={(event) => onReorderPointerDown?.(event, track)}
      >
        <GripVertical size={track.kind === "text" ? 10 : 12} aria-hidden="true" />
      </button>
      {track.kind === "audio" ? (
        <button
          type="button"
          className={`studio-editor-track-btn${track.muted ? " is-active" : ""}`}
          aria-label={track.muted ? "Unmute track" : "Mute track"}
          title={track.muted ? "Unmute" : "Mute"}
          onClick={() => onToggleMute(track.id)}
        >
          {track.muted ? <VolumeX size={ICON} aria-hidden="true" /> : <Volume2 size={ICON} aria-hidden="true" />}
        </button>
      ) : track.kind === "text" ? null : (
        <button
          type="button"
          className={`studio-editor-track-btn${track.muted ? " is-active" : ""}`}
          aria-label={track.muted ? "Unmute track" : "Mute track"}
          title={track.muted ? "Unmute" : "Mute"}
          onClick={() => onToggleMute?.(track.id)}
        >
          {track.muted ? <VolumeX size={ICON} aria-hidden="true" /> : <Volume2 size={ICON} aria-hidden="true" />}
        </button>
      )}
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
  overlaySnapEnabled = true,
  onOverlaySnapChange,
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
        <button
          type="button"
          className={`studio-editor-overlay-snap${overlaySnapEnabled ? " is-active" : ""}`}
          aria-pressed={overlaySnapEnabled}
          aria-label={
            overlaySnapEnabled
              ? "Overlay snap on — edges magnet when close"
              : "Overlay snap off — free place on secondary lanes"
          }
          title={
            overlaySnapEnabled
              ? "Overlay snap on. Secondary clips magnet to nearby starts/ends. Click to place freely."
              : "Overlay snap off. Secondary clips stay free; they still stop at a touch instead of overlapping. Click to magnet to edges."
          }
          onClick={() => onOverlaySnapChange?.(!overlaySnapEnabled)}
        >
          <Magnet size={ICON} aria-hidden="true" />
        </button>
        <div className="studio-editor-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(MIN_PPS, Math.round(pixelsPerSecond * 0.9)))}>
            <ZoomOut size={ICON} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(MAX_PPS, Math.round(pixelsPerSecond * 1.12)))}>
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
  selectedClipIds = [],
  selectedJointKey,
  selectedJointKeys = [],
  editorMode: _editorMode,
  mediaById,
  onSelectClip,
  onSelectJoint,
  onSetPlayhead,
  onAddClip,
  onMoveClip,
  onTrimClip,
  onUpdateClip,
  onRenameClip,
  onClipContextMenu,
  renameRequest,
  onToggleTrackMute,
  onApplyTrackLayout,
  onRippleAddClip,
  onMoveToTrack,
  onReorderTracks,
  onZoom,
  onSetJointTransition,
  onAddTextClip: _onAddTextClip,
  overlaySnapEnabled = true,
  onSplitClip,
  playing = false,
}) {
  const scrollRef = useRef(null);
  const trackRowRefs = useRef(new Map());
  const insertZoneRefs = useRef(new Map());
  const zoomAnchorRef = useRef(null);
  const timelineWidth = Math.max(project.duration * pixelsPerSecond + 240, 720);
  const [dropPreview, setDropPreview] = useState(null);
  const [ripplePreview, setRipplePreview] = useState(null);
  const [snapGuideTime, setSnapGuideTime] = useState(null);
  /** Full-height lane slot preview: insert new lane or reorder existing lane. */
  const [lanePreview, setLanePreview] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [panning, setPanning] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [reorderingTrackId, setReorderingTrackId] = useState(null);
  const displayTracks = useMemo(() => visibleTracks(project), [project.tracks, project.clips]);

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

  /**
   * Ctrl/Cmd + drag on timeline: right/up zoom in, left/down zoom out (anchored under cursor).
   */
  const beginTimelineZoomDrag = useCallback(
    (event) => {
      if (!onZoom) return;
      if (event.button !== 0) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const scroll = scrollRef.current;
      if (!scroll) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startPps = pixelsPerSecond;
      const rect = scroll.getBoundingClientRect();
      const xInView = startX - rect.left;
      const time = Math.max(
        0,
        (scroll.scrollLeft + xInView - TRACK_RAIL_WIDTH) / Math.max(startPps, 1),
      );
      let lastPps = startPps;
      const STEP_PX = 28;

      document.body.classList.add("is-timeline-zoom-drag");
      const captureEl = event.currentTarget;
      captureEl?.setPointerCapture?.(event.pointerId);

      const onMove = (moveEvent) => {
        // Right / up → zoom in; left / down → zoom out.
        const score = (moveEvent.clientX - startX) - (moveEvent.clientY - startY);
        const steps = Math.trunc(score / STEP_PX);
        const factor = Math.pow(1.1, steps);
        const next = Math.max(MIN_PPS, Math.min(MAX_PPS, Math.round(startPps * factor)));
        if (next === lastPps) return;
        lastPps = next;
        zoomAnchorRef.current = { time, xInView };
        onZoom(next);
      };

      const onUp = (upEvent) => {
        try {
          captureEl?.releasePointerCapture?.(upEvent.pointerId);
        } catch {
          /* ignore */
        }
        document.body.classList.remove("is-timeline-zoom-drag");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
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

      const overRuler = Boolean(
        event.target instanceof Element &&
          event.target.closest(".studio-editor-ruler"),
      );

      // Horizontal trackpad swipe → pan in time.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        scroll.scrollLeft += event.deltaX;
        return;
      }

      // Wheel over the ruler → horizontal pan in time (no Shift).
      if (overRuler) {
        event.preventDefault();
        scroll.scrollLeft += event.deltaY;
        return;
      }

      // Lanes: Shift + wheel → horizontal pan; plain wheel → native vertical.
      if (event.shiftKey) {
        event.preventDefault();
        scroll.scrollLeft += event.deltaY;
      }
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

  const resolveInsertIndexAtY = useCallback(
    (clientY, options = {}) => {
      const allowMidRow = Boolean(options.allowMidRow);
      const tracks = visibleTracks(project);

      // Prefer the expanded insert-slot hit bands (taller than the thin line).
      const slotKeys = [...insertZoneRefs.current.keys()].sort((a, b) => a - b);
      for (const key of slotKeys) {
        const el = insertZoneRefs.current.get(key);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) return key;
      }

      const gapPx = TRACK_INSERT_HIT_PX;
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
          return index >= tracks.length
            ? project.tracks.length
            : project.tracks.findIndex((t) => t.id === tracks[index]!.id);
        }
      }

      // Rail reorder: treat top/bottom half of a row as insert before/after.
      if (allowMidRow) {
        for (let i = 0; i < tracks.length; i += 1) {
          const row = trackRowRefs.current.get(tracks[i]!.id);
          if (!row) continue;
          const rect = row.getBoundingClientRect();
          if (clientY < rect.top || clientY > rect.bottom) continue;
          const mid = (rect.top + rect.bottom) / 2;
          if (clientY < mid) {
            return project.tracks.findIndex((t) => t.id === tracks[i]!.id);
          }
          if (i + 1 < tracks.length) {
            return project.tracks.findIndex((t) => t.id === tracks[i + 1]!.id);
          }
          return project.tracks.length;
        }
      }
      return null;
    },
    [project],
  );

  const resolveDropTarget = useCallback(
    (clientY, clipKind) => {
      const tracks = visibleTracks(project);
      // Prefer landing on a same-kind lane (critical for thin text rows where
      // insert hit-bands otherwise swallow the whole track).
      for (const track of tracks) {
        const row = trackRowRefs.current.get(track.id);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top || clientY > rect.bottom) continue;
        if (track.kind === clipKind) {
          return { type: "track", trackId: track.id };
        }
      }

      const insertAt = resolveInsertIndexAtY(clientY);
      if (insertAt !== null) return { type: "insert", index: insertAt };

      return null;
    },
    [project, resolveInsertIndexAtY],
  );

  const timeFromPointerX = useCallback(
    (clientX) => {
      const scroll = scrollRef.current;
      if (!scroll) return 0;
      const canvas = scroll.querySelector(".studio-editor-timeline-canvas");
      if (!canvas) return 0;
      // Canvas lives inside the scroller — getBoundingClientRect already
      // includes horizontal scroll. Do not add scrollLeft again.
      const canvasRect = canvas.getBoundingClientRect();
      const x = clientX - canvasRect.left - TRACK_RAIL_WIDTH;
      return Math.max(0, Math.min(project.duration, x / Math.max(pixelsPerSecond, 1)));
    },
    [pixelsPerSecond, project.duration],
  );

  const beginTrackReorder = useCallback(
    (event, track) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const originIndex = project.tracks.findIndex((item) => item.id === track.id);
      if (originIndex < 0) return;

      setReorderingTrackId(track.id);
      setRipplePreview(null);
      setDropPreview(null);
      let lastIndex = originIndex;
      setLanePreview({
        index: originIndex,
        kind: track.kind,
        mode: "reorder",
        trackId: track.id,
        name: track.label,
      });

      const onMoveEvent = (moveEvent) => {
        const nextIndex = resolveInsertIndexAtY(moveEvent.clientY, { allowMidRow: true });
        if (nextIndex === null) return;
        lastIndex = nextIndex;
        setLanePreview({
          index: nextIndex,
          kind: track.kind,
          mode: "reorder",
          trackId: track.id,
          name: track.label,
        });
      };

      const onUp = () => {
        setReorderingTrackId(null);
        setLanePreview(null);
        window.removeEventListener("pointermove", onMoveEvent);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (lastIndex !== originIndex && lastIndex !== originIndex + 1) {
          onReorderTracks?.(track.id, lastIndex);
        }
      };

      window.addEventListener("pointermove", onMoveEvent);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [project.tracks, resolveInsertIndexAtY, onReorderTracks],
  );

  const timeFromClientX = useCallback(
    (clientX, laneEl) => {
      if (!laneEl) return 0;
      // Lane is inside the scrolled canvas; rect.left already reflects scroll.
      const rect = laneEl.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(0, Math.min(project.duration, x / pixelsPerSecond));
    },
    [pixelsPerSecond, project.duration],
  );

  /** Click-drag scrub on the ruler, empty lanes, or playhead. */
  const beginPlayheadScrub = useCallback(
    (event, source) => {
      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        beginTimelineZoomDrag(event);
        return;
      }
      if (event.button === 1 || event.altKey) {
        beginTimelinePan(event);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const el = event.currentTarget;
      const apply = (clientX) => {
        const clamp = (time) =>
          quantizeToFrame(Math.max(0, Math.min(project.duration, time)));
        if (source === "ruler") {
          // Ruler is scrolled content (marginLeft = rail); rect already includes scroll.
          const rect = el.getBoundingClientRect();
          const x = clientX - rect.left;
          onSetPlayhead(clamp(x / pixelsPerSecond));
          return;
        }
        if (source === "playhead") {
          const canvas = el.closest(".studio-editor-timeline-canvas");
          if (!canvas) return;
          const canvasRect = canvas.getBoundingClientRect();
          const x = clientX - canvasRect.left - TRACK_RAIL_WIDTH;
          onSetPlayhead(clamp(x / pixelsPerSecond));
          return;
        }
        onSetPlayhead(clamp(timeFromClientX(clientX, el)));
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
    [beginTimelinePan, beginTimelineZoomDrag, onSetPlayhead, pixelsPerSecond, project.duration, timeFromClientX],
  );

  /**
   * Empty timeline pointer (lane or bottom filler):
   * small drag → marquee across ALL layers; click → scrub.
   */
  const beginLanePointer = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        beginTimelineZoomDrag(event);
        return;
      }
      if (event.button === 1 || event.altKey) {
        beginTimelinePan(event);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const captureEl = event.currentTarget;
      const canvasEl =
        captureEl.closest(".studio-editor-timeline-canvas") ||
        scrollRef.current?.querySelector(".studio-editor-timeline-canvas");
      if (!canvasEl) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const canvasRect0 = canvasEl.getBoundingClientRect();
      const startLocal = {
        x: startX - canvasRect0.left,
        y: startY - canvasRect0.top,
      };
      let mode = null; // null | "marquee"
      let lastMarquee = null;

      const timeFromCanvasX = (clientX) => {
        const rect = canvasEl.getBoundingClientRect();
        const x = clientX - rect.left - TRACK_RAIL_WIDTH;
        return Math.max(0, Math.min(project.duration, x / Math.max(pixelsPerSecond, 1)));
      };

      const clipsInCanvasMarquee = (box) => {
        const t0 = Math.min(box.left, box.left + box.width) - TRACK_RAIL_WIDTH;
        const t1 = Math.max(box.left, box.left + box.width) - TRACK_RAIL_WIDTH;
        const time0 = t0 / Math.max(pixelsPerSecond, 1);
        const time1 = t1 / Math.max(pixelsPerSecond, 1);
        const y0 = Math.min(box.top, box.top + box.height);
        const y1 = Math.max(box.top, box.top + box.height);
        const canvasRect = canvasEl.getBoundingClientRect();
        const ids = [];

        for (const clip of project.clips) {
          const row = trackRowRefs.current.get(clip.trackId);
          if (!row) continue;
          const lane = row.querySelector(".studio-editor-track-lane");
          if (!lane) continue;
          const laneRect = lane.getBoundingClientRect();
          const laneTop = laneRect.top - canvasRect.top;
          const laneBottom = laneRect.bottom - canvasRect.top;
          if (y1 < laneTop || y0 > laneBottom) continue;

          const start = clip.startTime;
          const end = start + clipDuration(clip);
          if (end < Math.min(time0, time1) || start > Math.max(time0, time1)) continue;
          ids.push(clip.id);
        }
        return ids;
      };

      const toMarquee = (clientX, clientY) => {
        const rect = canvasEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const left = Math.min(startLocal.x, x);
        const top = Math.min(startLocal.y, y);
        const width = Math.abs(x - startLocal.x);
        const height = Math.abs(y - startLocal.y);
        const box = { left, top, width, height };
        return { ...box, clipIds: clipsInCanvasMarquee(box) };
      };

      captureEl.setPointerCapture?.(event.pointerId);

      const onMove = (moveEvent) => {
        const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (mode == null && dist < 5) return;
        if (mode == null) {
          mode = "marquee";
          onSelectJoint?.(null);
        }
        if (mode === "marquee") {
          lastMarquee = toMarquee(moveEvent.clientX, moveEvent.clientY);
          setMarquee(lastMarquee);
        }
      };

      const onUp = (upEvent) => {
        try {
          captureEl.releasePointerCapture?.(upEvent.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setMarquee(null);

        if (mode === "marquee" && lastMarquee) {
          const ids = lastMarquee.clipIds?.length
            ? lastMarquee.clipIds
            : clipsInCanvasMarquee(lastMarquee);
          if (ids.length) onSelectClip(ids, { replace: true });
          else {
            onSelectClip(null);
            onSelectJoint?.(null);
          }
          return;
        }

        onSelectClip(null);
        onSelectJoint?.(null);
        const clamp = (time) =>
          quantizeToFrame(Math.max(0, Math.min(project.duration, time)));
        onSetPlayhead(clamp(timeFromCanvasX(upEvent.clientX)));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [
      beginTimelinePan,
      beginTimelineZoomDrag,
      onSelectClip,
      onSelectJoint,
      onSetPlayhead,
      pixelsPerSecond,
      project.clips,
      project.duration,
    ],
  );

  const selectedIdSet = useMemo(() => {
    const ids =
      selectedClipIds?.length > 0
        ? selectedClipIds
        : selectedClipId
          ? [selectedClipId]
          : [];
    // Live marquee preview — highlight before mouse-up commits selection.
    if (marquee?.clipIds?.length) {
      return new Set(marquee.clipIds);
    }
    return new Set(ids);
  }, [selectedClipId, selectedClipIds, marquee]);

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
      setLanePreview(null);
      setRipplePreview(null);
      setSnapGuideTime(null);
      setDropPreview({
        trackId: track.id,
        assetId: payload.assetId,
        startTime: rawStart,
        duration: payload.duration,
        name: payload.name,
        thumbnailUrl: payload.thumbnailUrl,
      });
    },
    [timeFromClientX],
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
      onAddClip({
        assetId: payload.assetId,
        trackId: track.id,
        startTime: rawStart,
        trimIn: 0,
        trimOut: payload.duration,
        sourceDuration: payload.duration,
        label: payload.name,
        kind: clipKindForTrack(track.kind, payload.mediaKind),
      });
    },
    [onAddClip, timeFromClientX],
  );

  const onInsertDragOver = useCallback((event, index) => {
    if (!isTimelineDropDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    const payload = peekTimelineDragPayload();
    const kind = payload?.mediaKind === "audio" ? "audio" : "video";
    setLanePreview({
      index,
      kind,
      mode: "insert",
    });
    setDropPreview(null);
    setRipplePreview(null);
  }, []);

  const onInsertDragLeave = useCallback((event, index) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setLanePreview((prev) => (prev?.index === index && prev?.mode === "insert" ? null : prev));
  }, []);

  const onInsertDrop = useCallback(
    (event, index) => {
      event.preventDefault();
      event.stopPropagation();
      setLanePreview(null);
      setDropPreview(null);
      setRipplePreview(null);
      setSnapGuideTime(null);

      const payload = readTimelineDropPayload(event);
      if (!payload) return;

      const lane = scrollRef.current?.querySelector(".studio-editor-track-row .studio-editor-track-lane");
      const rawStart = lane ? timeFromClientX(event.clientX, lane) : 0;
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
        // Left edge — freeform place (gaps ok); overlap parks at a touch, neighbors stay.
        centerTime: Math.max(0, rawStart),
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
      setLanePreview(null);
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

  useEffect(() => {
    document.body.classList.toggle("is-timeline-media-drag", externalDrag);
    return () => document.body.classList.remove("is-timeline-media-drag");
  }, [externalDrag]);

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
            title="Click or drag to seek · Ctrl+drag or Ctrl+scroll to zoom"
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
            const trackHasRippleShift = Boolean(
              ripplePreview?.placements.some((placement) => {
                const owned = project.clips.find((c) => c.id === placement.clipId);
                return owned?.trackId === track.id && placement.clipId !== ripplePreview.draggedClipId;
              }),
            );
            const insertActive = lanePreview?.index === trackIndex;
            return (
              <div key={track.id}>
                <div
                  ref={(node) => {
                    if (node) insertZoneRefs.current.set(trackIndex, node);
                    else insertZoneRefs.current.delete(trackIndex);
                  }}
                >
                  <LaneInsertSlot
                    index={trackIndex}
                    active={insertActive}
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
                  className={`studio-editor-track-row is-${track.kind}${preview || pickup?.hoverTrackId === track.id ? " is-drop-target" : ""}${trackRipple || trackHasRippleShift ? " is-ripple-active" : ""}${reorderingTrackId === track.id ? " is-reordering" : ""}`}
                  style={
                    track.kind === "text"
                      ? { height: trackHeight, maxHeight: trackHeight, minHeight: 0, overflow: "hidden" }
                      : { height: trackHeight }
                  }
                  onDragOver={(event) => onTrackDragOver(event, track)}
                  onDragLeave={(event) => onTrackDragLeave(event, track)}
                  onDrop={(event) => onTrackDrop(event, track)}
                >
                <div className="studio-editor-track-rail" style={{ width: TRACK_RAIL_WIDTH, minHeight: 0 }}>
                  <TrackRailButton
                    track={track}
                    onToggleMute={onToggleTrackMute}
                    onReorderPointerDown={beginTrackReorder}
                    reordering={reorderingTrackId === track.id}
                  />
                </div>
                <div
                  className="studio-editor-track-lane"
                  style={track.kind === "text" ? { minHeight: 0 } : undefined}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || event.altKey) return;
                    const target = event.target;
                    if (!(target instanceof Element)) return;
                    // Keep selection when clicking clips/joints/handles — empty lane only.
                    if (
                      target.closest(
                        ".studio-editor-clip, .studio-editor-joint, .studio-editor-clip-fade-handle, .studio-editor-clip-handle, .studio-editor-track-btn",
                      )
                    ) {
                      return;
                    }
                    beginLanePointer(event);
                  }}
                >
                  {trackRipple && !pickup ? (
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
                      const placement = ripplePreview?.placements.find((p) => p.clipId === clip.id);
                      const shifting =
                        Boolean(pickup) &&
                        pickup.clipId !== clip.id &&
                        placement != null &&
                        placement.startTime !== clip.startTime;
                      return (
                        <TimelineClipBlock
                          key={clip.id}
                          clip={clip}
                          pps={pixelsPerSecond}
                          selected={selectedIdSet.has(clip.id)}
                          media={media}
                          project={project}
                          playhead={playhead}
                          rippleActive={shifting || Boolean(
                            pickup && trackRipple && pickup.clipId !== clip.id && placement,
                          )}
                          rippleStartTime={
                            pickup && pickup.clipId !== clip.id && placement
                              ? placement.startTime
                              : undefined
                          }
                          isPickedUp={pickup?.clipId === clip.id}
                          overlaySnapEnabled={overlaySnapEnabled}
                          onSplit={playing ? undefined : onSplitClip}
                          onPlayheadScrub={onSetPlayhead}
                          onPlayheadScrubbing={setScrubbing}
                          renameToken={
                            renameRequest?.clipId === clip.id ? renameRequest.token : undefined
                          }
                          onSelect={(id, opts) => {
                            onSelectJoint?.(null);
                            onSelectClip(id, opts);
                            // Text rows are thin and sat under insert hit bands — selecting a
                            // text clip must not invent a new one at the playhead. Keep the
                            // playhead on the clip so canvas preview stays in sync.
                            if (clip.kind === "text" && !opts?.additive) {
                              const end = clip.startTime + clipDuration(clip);
                              if (playhead < clip.startTime || playhead >= end) {
                                onSetPlayhead(
                                  clip.startTime + Math.min(0.05, clipDuration(clip) * 0.25),
                                );
                              }
                            }
                          }}
                          onMove={onMoveClip}
                          onMoveToTrack={onMoveToTrack}
                          onRename={onRenameClip}
                          onContextMenu={onClipContextMenu}
                          onSnapGuide={setSnapGuideTime}
                          onHighlightInsert={setLanePreview}
                          onRipplePreview={setRipplePreview}
                          onPickupChange={setPickup}
                          resolveDropTarget={resolveDropTarget}
                          timeFromPointerX={timeFromPointerX}
                          onTrim={(clipId, trimIn, trimOut, startTime, live) => {
                            onTrimClip(clipId, trimIn, trimOut, startTime, live);
                          }}
                          onUpdateClip={(clipId, patch, live) => {
                            onUpdateClip?.(clipId, patch, live);
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
                          selected={
                            selectedJointKey === joint.key ||
                            selectedJointKeys.includes(joint.key)
                          }
                          onSelect={onSelectJoint}
                          onSetTransition={onSetJointTransition}
                        />
                      ))
                    : null}
                  <DropGhost preview={trackRipple && !pickup ? null : preview} pps={pixelsPerSecond} mediaById={mediaById} />
                  {pickup?.hoverTrackId === track.id && pickup.dropStartTime != null ? (
                    <SlotDropGhost
                      kind={pickup.clip.kind}
                      startTime={pickup.dropStartTime}
                      widthPx={pickup.widthPx}
                      pps={pixelsPerSecond}
                    />
                  ) : null}
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
          >
            <LaneInsertSlot
              index={project.tracks.length}
              active={lanePreview?.index === project.tracks.length}
              onDragOver={onInsertDragOver}
              onDragLeave={onInsertDragLeave}
              onDrop={onInsertDrop}
            />
          </div>
          <div className="studio-editor-timeline-empty-row" aria-hidden="false">
            <div
              className="studio-editor-track-rail studio-editor-timeline-empty-rail"
              style={{ width: TRACK_RAIL_WIDTH }}
            />
            <div
              className="studio-editor-timeline-empty"
              onPointerDown={(event) => {
                if (event.button !== 0 || event.altKey) return;
                beginLanePointer(event);
              }}
            />
          </div>
          <div
            className={`studio-editor-playhead${scrubbing ? " is-scrubbing" : ""}`}
            style={{ left: TRACK_RAIL_WIDTH + playhead * pixelsPerSecond }}
          >
            <span
              className="studio-editor-playhead-grip"
              onPointerDown={(event) => beginPlayheadScrub(event, "playhead")}
            />
          </div>
          {snapGuideTime !== null ? (
            <div
              className="studio-editor-snap-guide"
              style={{ left: TRACK_RAIL_WIDTH + snapGuideTime * pixelsPerSecond }}
              aria-hidden="true"
            />
          ) : null}
          {marquee ? (
            <div
              className="studio-editor-marquee"
              style={{
                left: marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
      <FloatingPickupClip pickup={pickup} />
    </div>
  );
}
