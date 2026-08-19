"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  CLIP_TRANSFORM_LIMITS,
  normalizeClipTransform,
  resolveFitMode,
  type ClipTransform,
} from "./clipTransform";
import {
  applyHandleDelta,
  cursorForHandle,
  pointerAngleDegrees,
  snapPictureTransform,
  snapTextTransform,
  TEXT_TRANSFORM_LIMITS,
  transformMoved,
  type SnapGuides,
} from "./canvasTransformGesture";
import { clipDuration } from "./editorState";
import {
  clipIsPictureKind,
  hitSceneItemAtPoint,
  pictureContentRect,
  pictureOccupancyRect,
  pictureSourceSize,
  type PaintedSceneHit,
} from "./previewScene";
import { DEFAULT_TEXT_TRANSFORM, normalizeTextTransform, textContentRectNormalized } from "./textLayout";
import { hitTransformHandle, type TransformHandle } from "./transformHit";
import type { EditorClip, EditorMediaItem, EditorProject } from "./types";

const DRAG_THRESHOLD_PX = 4;
const EMPTY_GUIDES: SnapGuides = { x: null, y: null };

export type TransformChromeHandle = {
  setPose: (transform: ClipTransform, guides?: SnapGuides) => void;
  setDragging: (dragging: boolean) => void;
};

export type LivePreviewChrome = {
  clipId: string;
  transform: ClipTransform;
  guides: SnapGuides;
  dragging: boolean;
};

export type PreviewPointerKind = "picture" | "text";

export type PreviewPointerPick =
  | {
      action: "chrome";
      clipId: string;
      kind: PreviewPointerKind;
      handle: Exclude<TransformHandle, "move">;
    }
  | {
      action: "item";
      clipId: string;
      kind: PreviewPointerKind;
      handle: "move";
    }
  | { action: "empty" };

function poseForClip(clip: EditorClip): ClipTransform {
  return clip.kind === "text"
    ? normalizeTextTransform(clip.effects)
    : normalizeClipTransform(clip.effects);
}

function kindForClip(clip: EditorClip): PreviewPointerKind | null {
  if (clip.kind === "text") return "text";
  if (clipIsPictureKind(clip.kind)) return "picture";
  return null;
}

function clipAtPlayheadById(
  project: EditorProject,
  clipId: string | null,
  playhead: number,
): EditorClip | null {
  if (!clipId) return null;
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return null;
  if (playhead < clip.startTime || playhead >= clip.startTime + clipDuration(clip)) {
    return null;
  }
  return clip;
}

function selectedChromeRect(
  clip: EditorClip,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  paintedHits: readonly PaintedSceneHit[],
  canvasWidth: number,
  canvasHeight: number,
): { left: number; top: number; width: number; height: number; rotation: number } | null {
  const kind = kindForClip(clip);
  if (!kind) return null;
  if (kind === "text") {
    const transform = normalizeTextTransform(clip.effects);
    return {
      ...textContentRectNormalized(clip.text, clip.effects, canvasWidth, canvasHeight),
      rotation: transform.rotation,
    };
  }
  const painted = paintedHits.find((hit) => hit.clipId === clip.id);
  if (painted) return painted;
  return (
    pictureContentRect(
      clip,
      mediaById,
      sourceSizes,
      canvasWidth,
      canvasHeight,
    ) ?? pictureOccupancyRect(normalizeClipTransform(clip.effects).rotation)
  );
}

/**
 * 1. Resize / rotate on the current selection (handles only — not body move).
 * 2. Top-down scene stack (select + drag in one press, even when unselected).
 * 3. Selected body fallback when step 2 misses but the blue box still contains the point.
 */
export function pickPreviewPointer(
  nx: number,
  ny: number,
  project: EditorProject,
  playhead: number,
  selectedClipId: string | null,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  paintedHits: readonly PaintedSceneHit[],
  canvasWidth: number,
  canvasHeight: number,
): PreviewPointerPick {
  const selected = clipAtPlayheadById(project, selectedClipId, playhead);
  if (selected) {
    const chrome = selectedChromeRect(
      selected,
      mediaById,
      sourceSizes,
      paintedHits,
      canvasWidth,
      canvasHeight,
    );
    if (chrome) {
      const handle = hitTransformHandle(
        nx,
        ny,
        chrome,
        chrome.rotation,
        canvasWidth,
        canvasHeight,
      );
      const kind = kindForClip(selected);
      if (handle && handle !== "move" && kind) {
        return { action: "chrome", clipId: selected.id, kind, handle };
      }
    }
  }

  const hit = hitSceneItemAtPoint(
    nx,
    ny,
    project,
    playhead,
    mediaById,
    sourceSizes,
    canvasWidth,
    canvasHeight,
    paintedHits,
  );
  if (hit) {
    const kind = kindForClip(hit.clip);
    if (kind) {
      return { action: "item", clipId: hit.clip.id, kind, handle: "move" };
    }
  }

  if (selected) {
    const chrome = selectedChromeRect(
      selected,
      mediaById,
      sourceSizes,
      paintedHits,
      canvasWidth,
      canvasHeight,
    );
    if (chrome) {
      const handle = hitTransformHandle(
        nx,
        ny,
        chrome,
        chrome.rotation,
        canvasWidth,
        canvasHeight,
      );
      const kind = kindForClip(selected);
      if (handle === "move" && kind) {
        return { action: "item", clipId: selected.id, kind, handle: "move" };
      }
    }
  }

  return { action: "empty" };
}

function clientToNorm(
  clientX: number,
  clientY: number,
  frame: HTMLElement,
): { x: number; y: number } | null {
  const box = frame.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    x: (clientX - box.left) / box.width,
    y: (clientY - box.top) / box.height,
  };
}

function hitCanvasSize(
  frame: HTMLElement,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  const box = frame.getBoundingClientRect();
  if (box.width > 1 && box.height > 1) {
    return { width: box.width, height: box.height };
  }
  return { width: fallbackWidth, height: fallbackHeight };
}

function isChromeControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-preview-chrome]"));
}

type Gesture = {
  pointerId: number;
  clipId: string;
  kind: PreviewPointerKind;
  handle: TransformHandle;
  start: ClipTransform;
  originX: number;
  originY: number;
  originAngle: number;
  startRect: { left: number; top: number; width: number; height: number };
  pointerDownX: number;
  pointerDownY: number;
  armed: boolean;
};

type PreviewPointerRouterProps = {
  frameRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  project: EditorProject;
  playhead: number;
  mediaById: ReadonlyMap<string, EditorMediaItem>;
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>;
  getPaintedHits: () => readonly PaintedSceneHit[];
  canvasWidth: number;
  canvasHeight: number;
  selectedClipId: string | null;
  playing: boolean;
  /** Shift+drag pans a zoomed stage; don't also pick clips. */
  allowShiftPan: boolean;
  pictureChromeRef: RefObject<TransformChromeHandle | null>;
  textChromeRef: RefObject<TransformChromeHandle | null>;
  liveChromeRef: RefObject<LivePreviewChrome | null>;
  onSelect: (clipId: string | null) => void;
  onTogglePlay: () => void;
  onPreviewPicture: (clipId: string, transform: ClipTransform) => void;
  onPreviewText: (clipId: string, transform: ClipTransform) => void;
  onCommitTransform: (clipId: string, transform: ClipTransform) => void;
};

/**
 * One pointer owner for the preview stage (Konva / Grida / AiCut model):
 * capture-phase pick, coords relative to the frame so cover overflow outside
 * the visible canvas still hits, chrome is paint-only, select+drag is one
 * gesture, native click is ignored.
 */
export function usePreviewPointerRouter({
  frameRef,
  stageRef,
  enabled,
  project,
  playhead,
  mediaById,
  sourceSizes,
  getPaintedHits,
  canvasWidth,
  canvasHeight,
  selectedClipId,
  playing,
  allowShiftPan,
  pictureChromeRef,
  textChromeRef,
  liveChromeRef,
  onSelect,
  onTogglePlay,
  onPreviewPicture,
  onPreviewText,
  onCommitTransform,
}: PreviewPointerRouterProps): void {
  const gestureRef = useRef<Gesture | null>(null);
  const latestRef = useRef({
    enabled,
    project,
    playhead,
    mediaById,
    sourceSizes,
    getPaintedHits,
    canvasWidth,
    canvasHeight,
    selectedClipId,
    playing,
    allowShiftPan,
    onSelect,
    onTogglePlay,
    onPreviewPicture,
    onPreviewText,
    onCommitTransform,
    pictureChromeRef,
    textChromeRef,
    liveChromeRef,
  });
  latestRef.current = {
    enabled,
    project,
    playhead,
    mediaById,
    sourceSizes,
    getPaintedHits,
    canvasWidth,
    canvasHeight,
    selectedClipId,
    playing,
    allowShiftPan,
    onSelect,
    onTogglePlay,
    onPreviewPicture,
    onPreviewText,
    onCommitTransform,
    pictureChromeRef,
    textChromeRef,
    liveChromeRef,
  };

  useEffect(() => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!stage || !frame) return;

    const captureTarget = stage;

    const canvasForHit = () =>
      hitCanvasSize(
        frame,
        latestRef.current.canvasWidth,
        latestRef.current.canvasHeight,
      );

    const chromeFor = (kind: PreviewPointerKind) =>
      kind === "text"
        ? latestRef.current.textChromeRef.current
        : latestRef.current.pictureChromeRef.current;

    const emitPreview = (kind: PreviewPointerKind, clipId: string, next: ClipTransform) => {
      if (kind === "text") latestRef.current.onPreviewText(clipId, next);
      else latestRef.current.onPreviewPicture(clipId, next);
    };

    const writeLive = (
      clipId: string,
      transform: ClipTransform,
      guides: SnapGuides,
      dragging: boolean,
    ) => {
      latestRef.current.liveChromeRef.current = {
        clipId,
        transform,
        guides,
        dragging,
      };
    };

    const poseNow = (gesture: Gesture, point: { x: number; y: number }) => {
      const latest = latestRef.current;
      const angleDelta =
        gesture.handle === "rotate"
          ? pointerAngleDegrees(
              point.x,
              point.y,
              gesture.startRect,
              latest.canvasWidth,
              latest.canvasHeight,
            ) - gesture.originAngle
          : 0;
      const limits =
        gesture.kind === "text" ? TEXT_TRANSFORM_LIMITS : CLIP_TRANSFORM_LIMITS;
      const raw = applyHandleDelta(
        gesture.handle,
        gesture.start,
        point.x - gesture.originX,
        point.y - gesture.originY,
        { width: gesture.startRect.width, height: gesture.startRect.height },
        angleDelta,
        limits,
        gesture.kind === "picture",
      );
      const clip = latest.project.clips.find((item) => item.id === gesture.clipId);
      if (gesture.kind === "text" && clip) {
        return snapTextTransform(
          raw,
          gesture.handle,
          clip,
          latest.canvasWidth,
          latest.canvasHeight,
        );
      }
      const source = clip
        ? pictureSourceSize(
            clip,
            latest.mediaById,
            latest.sourceSizes,
            latest.canvasWidth,
            latest.canvasHeight,
          )
        : { width: latest.canvasWidth, height: latest.canvasHeight };
      return snapPictureTransform(
        raw,
        gesture.handle,
        latest.canvasWidth,
        latest.canvasHeight,
        source?.width ?? latest.canvasWidth,
        source?.height ?? latest.canvasHeight,
        resolveFitMode(clip?.effects, clip?.kind),
      );
    };

    const hoverCursor = (point: { x: number; y: number } | null) => {
      const latest = latestRef.current;
      if (!latest.enabled || latest.playing || !point) {
        frame.style.cursor = latest.playing ? "pointer" : "default";
        return;
      }
      const pick = pickPreviewPointer(
        point.x,
        point.y,
        latest.project,
        latest.playhead,
        latest.selectedClipId,
        latest.mediaById,
        latest.sourceSizes,
        latest.getPaintedHits(),
        canvasForHit().width,
        canvasForHit().height,
      );
      if (pick.action === "empty") {
        frame.style.cursor = "default";
        return;
      }
      const selected = clipAtPlayheadById(
        latest.project,
        latest.selectedClipId,
        latest.playhead,
      );
      const rotation = selected ? poseForClip(selected).rotation : 0;
      frame.style.cursor = cursorForHandle(pick.handle, rotation);
    };

    const endGesture = (clientX: number, clientY: number) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      gestureRef.current = null;
      const latest = latestRef.current;
      const point = clientToNorm(clientX, clientY, frame);
      chromeFor(gesture.kind)?.setDragging(false);
      if (!gesture.armed || !point) {
        writeLive(gesture.clipId, gesture.start, EMPTY_GUIDES, false);
        chromeFor(gesture.kind)?.setPose(gesture.start, EMPTY_GUIDES);
        emitPreview(gesture.kind, gesture.clipId, gesture.start);
        latest.liveChromeRef.current = null;
        hoverCursor(point);
        try {
          captureTarget.releasePointerCapture(gesture.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      const { transform: next } = poseNow(gesture, point);
      writeLive(gesture.clipId, next, EMPTY_GUIDES, false);
      chromeFor(gesture.kind)?.setPose(next, EMPTY_GUIDES);
      if (transformMoved(next, gesture.start)) {
        emitPreview(gesture.kind, gesture.clipId, next);
        latest.onCommitTransform(gesture.clipId, next);
      } else {
        emitPreview(gesture.kind, gesture.clipId, gesture.start);
        chromeFor(gesture.kind)?.setPose(gesture.start, EMPTY_GUIDES);
      }
      latest.liveChromeRef.current = null;
      hoverCursor(point);
      try {
        captureTarget.releasePointerCapture(gesture.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const latest = latestRef.current;
      if (!latest.enabled) return;
      if (event.button !== 0) return;
      if (event.shiftKey && latest.allowShiftPan) return;
      if (isChromeControl(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (latest.playing) {
        latest.onTogglePlay();
        return;
      }
      const point = clientToNorm(event.clientX, event.clientY, frame);
      if (!point) return;
      const pick = pickPreviewPointer(
        point.x,
        point.y,
        latest.project,
        latest.playhead,
        latest.selectedClipId,
        latest.mediaById,
        latest.sourceSizes,
        latest.getPaintedHits(),
        canvasForHit().width,
        canvasForHit().height,
      );
      if (pick.action === "empty") {
        gestureRef.current = null;
        latest.onSelect(null);
        frame.style.cursor = "default";
        return;
      }
      const clip = latest.project.clips.find((item) => item.id === pick.clipId);
      if (!clip) return;
      if (latest.selectedClipId !== pick.clipId) {
        latest.onSelect(pick.clipId);
      }
      const hit = canvasForHit();
      const chrome = selectedChromeRect(
        clip,
        latest.mediaById,
        latest.sourceSizes,
        latest.getPaintedHits(),
        hit.width,
        hit.height,
      );
      if (!chrome) return;
      const start = poseForClip(clip);
      gestureRef.current = {
        pointerId: event.pointerId,
        clipId: pick.clipId,
        kind: pick.kind,
        handle: pick.handle,
        start,
        originX: point.x,
        originY: point.y,
        originAngle: pointerAngleDegrees(
          point.x,
          point.y,
          chrome,
          hit.width,
          hit.height,
        ),
        startRect: chrome,
        pointerDownX: event.clientX,
        pointerDownY: event.clientY,
        armed: false,
      };
      try {
        captureTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      const point = clientToNorm(event.clientX, event.clientY, frame);
      if (!gesture || event.pointerId !== gesture.pointerId) {
        if (event.target === stage || stage.contains(event.target as Node)) {
          hoverCursor(point);
        }
        return;
      }
      if (!point) return;
      event.preventDefault();
      if (!gesture.armed) {
        const dist = Math.hypot(
          event.clientX - gesture.pointerDownX,
          event.clientY - gesture.pointerDownY,
        );
        if (dist < DRAG_THRESHOLD_PX) return;
        gesture.armed = true;
        chromeFor(gesture.kind)?.setDragging(true);
      }
      const { transform: next, guides } = poseNow(gesture, point);
      writeLive(gesture.clipId, next, guides, true);
      chromeFor(gesture.kind)?.setPose(next, guides);
      emitPreview(gesture.kind, gesture.clipId, next);
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      endGesture(event.clientX, event.clientY);
    };

    const onWindowMove = (event: PointerEvent) => {
      if (!gestureRef.current || event.pointerId !== gestureRef.current.pointerId) {
        return;
      }
      onPointerMove(event);
    };

    const onDblClick = (event: MouseEvent) => {
      const latest = latestRef.current;
      if (!latest.enabled || latest.playing) return;
      if (isChromeControl(event.target)) return;
      const point = clientToNorm(event.clientX, event.clientY, frame);
      if (!point) return;
      const pick = pickPreviewPointer(
        point.x,
        point.y,
        latest.project,
        latest.playhead,
        latest.selectedClipId,
        latest.mediaById,
        latest.sourceSizes,
        latest.getPaintedHits(),
        canvasForHit().width,
        canvasForHit().height,
      );
      if (pick.action === "empty") return;
      event.preventDefault();
      const reset =
        pick.kind === "text"
          ? { ...DEFAULT_TEXT_TRANSFORM }
          : { scale: 1, x: 0, y: 0, rotation: 0 };
      emitPreview(pick.kind, pick.clipId, reset);
      latest.onCommitTransform(pick.clipId, reset);
      chromeFor(pick.kind)?.setPose(reset, EMPTY_GUIDES);
    };

    captureTarget.addEventListener("pointerdown", onPointerDown, { capture: true });
    captureTarget.addEventListener("pointermove", onPointerMove);
    captureTarget.addEventListener("pointerup", onPointerUp);
    captureTarget.addEventListener("pointercancel", onPointerUp);
    captureTarget.addEventListener("dblclick", onDblClick);
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      gestureRef.current = null;
      captureTarget.removeEventListener("pointerdown", onPointerDown, { capture: true });
      captureTarget.removeEventListener("pointermove", onPointerMove);
      captureTarget.removeEventListener("pointerup", onPointerUp);
      captureTarget.removeEventListener("pointercancel", onPointerUp);
      captureTarget.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [frameRef, stageRef]);
}
