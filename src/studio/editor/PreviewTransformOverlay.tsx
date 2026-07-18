"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  CLIP_TRANSFORM_LIMITS,
  clamp,
  contentRectForTransform,
  normalizeClipTransform,
  type ClipTransform,
} from "./clipTransform";
import type { EditorClip, EditorMediaItem } from "./types";

type Handle = "move" | "ne" | "nw" | "se" | "sw" | "rotate";

type PreviewTransformOverlayProps = {
  clip: EditorClip;
  media?: EditorMediaItem;
  decodedWidth?: number;
  decodedHeight?: number;
  canvasWidth: number;
  canvasHeight: number;
  selected: boolean;
  playing: boolean;
  onSelect: (clipId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorClip>) => void;
  onPreviewTransform: (transform: ClipTransform) => void;
  onTogglePlay: () => void;
};

type Rect = { left: number; top: number; width: number; height: number };
type SnapGuides = { x: number | null; y: number | null };

type DragState = {
  handle: Handle;
  start: ClipTransform;
  originX: number;
  originY: number;
  originAngle: number;
  rect: { width: number; height: number };
  startRect: Rect;
  pointerId: number;
};

/** Rotate-handle distance below the box bottom, in canvas-normalized Y. */
function rotateHandleOffset(canvasHeight: number): number {
  return 28 / Math.max(1, canvasHeight);
}

function pointerAngleDegrees(
  nx: number,
  ny: number,
  rect: Rect,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const cx = (rect.left + rect.width / 2) * canvasWidth;
  const cy = (rect.top + rect.height / 2) * canvasHeight;
  const dx = nx * canvasWidth - cx;
  const dy = ny * canvasHeight - cy;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function toLocal(
  nx: number,
  ny: number,
  rect: Rect,
  rotation: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const cx = (rect.left + rect.width / 2) * canvasWidth;
  const cy = (rect.top + rect.height / 2) * canvasHeight;
  const px = nx * canvasWidth - cx;
  const py = ny * canvasHeight - cy;
  const rad = (-rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = c * px - s * py;
  const ly = s * px + c * py;
  const halfW = (rect.width * canvasWidth) / 2;
  const halfH = (rect.height * canvasHeight) / 2;
  return {
    x: (lx + halfW) / Math.max(1, rect.width * canvasWidth),
    y: (ly + halfH) / Math.max(1, rect.height * canvasHeight),
  };
}

function hitHandle(
  nx: number,
  ny: number,
  rect: Rect,
  rotation: number,
  canvasWidth: number,
  canvasHeight: number,
): Handle | null {
  const local = toLocal(nx, ny, rect, rotation, canvasWidth, canvasHeight);
  const edge = 0.085;
  const rotateY = 1 + rotateHandleOffset(canvasHeight) / Math.max(0.001, rect.height);
  const nearRotate =
    Math.abs(local.x - 0.5) <= edge * 1.4 &&
    Math.abs(local.y - rotateY) <= edge * 1.6;
  if (nearRotate) return "rotate";

  const withinX = local.x >= -edge && local.x <= 1 + edge;
  const withinY = local.y >= -edge && local.y <= 1 + edge;
  if (!withinX || !withinY) return null;

  const nearL = Math.abs(local.x - 0) <= edge;
  const nearR = Math.abs(local.x - 1) <= edge;
  const nearT = Math.abs(local.y - 0) <= edge;
  const nearB = Math.abs(local.y - 1) <= edge;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";

  if (local.x >= 0 && local.x <= 1 && local.y >= 0 && local.y <= 1) {
    return "move";
  }
  return null;
}

function cursorForHandle(handle: Handle | null, rotation: number): string {
  if (!handle) return "default";
  if (handle === "move") return "move";
  if (handle === "rotate") return "grab";
  const order = ["nw", "ne", "se", "sw"] as const;
  const cursors = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize"];
  const idx = order.indexOf(handle);
  if (idx < 0) return "move";
  const shift = Math.round(((((rotation % 360) + 360) % 360) / 90)) % 4;
  return cursors[(idx + shift) % 4]!;
}

function closestSnap(
  candidates: Array<{ delta: number; guide: number }>,
  threshold: number,
): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.delta) > threshold) continue;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) {
      best = candidate;
    }
  }
  return best;
}

function snapTransform(
  transform: ClipTransform,
  handle: Handle,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { transform: ClipTransform; guides: SnapGuides } {
  if (handle === "rotate") {
    return { transform, guides: { x: null, y: null } };
  }
  const rect = contentRectForTransform(
    transform,
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
  );
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const threshold = 0.025;

  const xCandidates =
    handle === "move"
      ? [
          { delta: -rect.left, guide: 0 },
          { delta: 1 - right, guide: 1 },
          { delta: 0.5 - centerX, guide: 0.5 },
        ]
      : [
          ...(handle.includes("w") ? [{ delta: -rect.left, guide: 0 }] : []),
          ...(handle.includes("e") ? [{ delta: 1 - right, guide: 1 }] : []),
        ];
  const yCandidates =
    handle === "move"
      ? [
          { delta: -rect.top, guide: 0 },
          { delta: 1 - bottom, guide: 1 },
          { delta: 0.5 - centerY, guide: 0.5 },
        ]
      : [
          ...(handle.includes("n") ? [{ delta: -rect.top, guide: 0 }] : []),
          ...(handle.includes("s") ? [{ delta: 1 - bottom, guide: 1 }] : []),
        ];
  const snapX = closestSnap(xCandidates, threshold);
  const snapY = closestSnap(yCandidates, threshold);
  return {
    transform: {
      ...transform,
      x: clamp(
        transform.x + (snapX?.delta ?? 0),
        CLIP_TRANSFORM_LIMITS.panMin,
        CLIP_TRANSFORM_LIMITS.panMax,
      ),
      y: clamp(
        transform.y + (snapY?.delta ?? 0),
        CLIP_TRANSFORM_LIMITS.panMin,
        CLIP_TRANSFORM_LIMITS.panMax,
      ),
    },
    guides: { x: snapX?.guide ?? null, y: snapY?.guide ?? null },
  };
}

function applyHandleDelta(
  handle: Handle,
  start: ClipTransform,
  dx: number,
  dy: number,
  startRect: { width: number; height: number },
  angleDelta = 0,
): ClipTransform {
  if (handle === "rotate") {
    return {
      ...start,
      rotation: ((start.rotation + angleDelta) % 360 + 360) % 360,
    };
  }
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, CLIP_TRANSFORM_LIMITS.panMin, CLIP_TRANSFORM_LIMITS.panMax),
      y: clamp(start.y + dy, CLIP_TRANSFORM_LIMITS.panMin, CLIP_TRANSFORM_LIMITS.panMax),
    };
  }
  const horizontalFactor =
    1 +
    (dx / Math.max(0.001, startRect.width)) *
      (handle.includes("w") ? -1 : 1);
  const verticalFactor =
    1 +
    (dy / Math.max(0.001, startRect.height)) *
      (handle.includes("n") ? -1 : 1);
  const factor =
    Math.abs(horizontalFactor - 1) > Math.abs(verticalFactor - 1)
      ? horizontalFactor
      : verticalFactor;
  const nextScale = clamp(
    start.scale * factor,
    CLIP_TRANSFORM_LIMITS.scaleMin,
    CLIP_TRANSFORM_LIMITS.scaleMax,
  );
  const appliedFactor = nextScale / start.scale;
  const widthDelta = startRect.width * (appliedFactor - 1);
  const heightDelta = startRect.height * (appliedFactor - 1);
  return {
    ...start,
    scale: nextScale,
    x: clamp(
      start.x +
        (handle.includes("e") ? widthDelta / 2 : 0) -
        (handle.includes("w") ? widthDelta / 2 : 0),
      CLIP_TRANSFORM_LIMITS.panMin,
      CLIP_TRANSFORM_LIMITS.panMax,
    ),
    y: clamp(
      start.y +
        (handle.includes("s") ? heightDelta / 2 : 0) -
        (handle.includes("n") ? heightDelta / 2 : 0),
      CLIP_TRANSFORM_LIMITS.panMin,
      CLIP_TRANSFORM_LIMITS.panMax,
    ),
  };
}

export function PreviewTransformOverlay({
  clip,
  media,
  decodedWidth,
  decodedHeight,
  canvasWidth,
  canvasHeight,
  selected,
  playing,
  onSelect,
  onUpdateClip,
  onPreviewTransform,
  onTogglePlay,
}: PreviewTransformOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const guidesRef = useRef<SnapGuides>({ x: null, y: null });
  const [guides, setGuides] = useState<SnapGuides>({ x: null, y: null });
  const dragRef = useRef<DragState | null>(null);
  const latestRef = useRef({
    canvasWidth,
    canvasHeight,
    sourceW: 0,
    sourceH: 0,
    transform: normalizeClipTransform(clip.effects),
    rect: { left: 0, top: 0, width: 1, height: 1 },
    onPreviewTransform,
    onUpdateClip,
    onSelect,
    onTogglePlay,
    clipId: clip.id,
    effects: clip.effects,
    selected,
    playing,
  });

  const transform = normalizeClipTransform(clip.effects);
  const sourceW = decodedWidth || media?.width || canvasWidth;
  const sourceH = decodedHeight || media?.height || canvasHeight;
  const rect = contentRectForTransform(
    transform,
    canvasWidth,
    canvasHeight,
    sourceW,
    sourceH,
  );

  latestRef.current = {
    canvasWidth,
    canvasHeight,
    sourceW,
    sourceH,
    transform,
    rect,
    onPreviewTransform,
    onUpdateClip,
    onSelect,
    onTogglePlay,
    clipId: clip.id,
    effects: clip.effects,
    selected,
    playing,
  };

  const applyBoxImmediately = (next: ClipTransform) => {
    const box = boxRef.current;
    if (!box) return;
    const latest = latestRef.current;
    const nextRect = contentRectForTransform(
      next,
      latest.canvasWidth,
      latest.canvasHeight,
      latest.sourceW,
      latest.sourceH,
    );
    box.style.left = `${nextRect.left * 100}%`;
    box.style.top = `${nextRect.top * 100}%`;
    box.style.width = `${nextRect.width * 100}%`;
    box.style.height = `${nextRect.height * 100}%`;
    box.style.transform = `rotate(${next.rotation}deg)`;
    if (badgeRef.current) {
      badgeRef.current.textContent =
        Math.abs(next.rotation) > 0.5
          ? `${Math.round(next.rotation)}°`
          : `${Math.round(next.scale * 100)}%`;
    }
  };

  const applyGuidesImmediately = (next: SnapGuides) => {
    const prev = guidesRef.current;
    if (prev.x === next.x && prev.y === next.y) return;
    guidesRef.current = next;
    setGuides(next);
  };

  const commit = (next: ClipTransform) => {
    const { clipId, effects, onUpdateClip: update } = latestRef.current;
    update(clipId, {
      effects: {
        ...(effects ?? {}),
        scale: Number(next.scale.toFixed(3)),
        x: Number(next.x.toFixed(3)),
        y: Number(next.y.toFixed(3)),
        rotation: Number(next.rotation.toFixed(1)),
      },
    });
  };

  /** Normalize against the visible canvas frame, not the expanded hit pad. */
  const clientToNorm = (clientX: number, clientY: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
    return {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    };
  };

  const setHoverCursor = (point: { x: number; y: number }) => {
    const hit = hitRef.current;
    const latest = latestRef.current;
    if (!hit || latest.playing) return;
    if (!latest.selected) {
      hit.style.cursor = "default";
      return;
    }
    const handle = hitHandle(
      point.x,
      point.y,
      latest.rect,
      latest.transform.rotation,
      latest.canvasWidth,
      latest.canvasHeight,
    );
    hit.style.cursor = cursorForHandle(handle, latest.transform.rotation);
  };

  const endDrag = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    boxRef.current?.classList.remove("is-dragging");
    const latest = latestRef.current;
    const point = clientToNorm(clientX, clientY);
    const angleDelta =
      drag.handle === "rotate"
        ? pointerAngleDegrees(
            point.x,
            point.y,
            drag.startRect,
            latest.canvasWidth,
            latest.canvasHeight,
          ) - drag.originAngle
        : 0;
    const raw = applyHandleDelta(
      drag.handle,
      drag.start,
      point.x - drag.originX,
      point.y - drag.originY,
      drag.rect,
      angleDelta,
    );
    const { transform: next } = snapTransform(
      raw,
      drag.handle,
      latest.canvasWidth,
      latest.canvasHeight,
      latest.sourceW,
      latest.sourceH,
    );
    applyGuidesImmediately({ x: null, y: null });
    latest.onPreviewTransform(next);
    commit(next);
    setHoverCursor(point);
    try {
      hitRef.current?.releasePointerCapture(drag.pointerId);
    } catch {
      // ignore
    }
  };

  const applyBoxRef = useRef(applyBoxImmediately);
  const applyGuidesRef = useRef(applyGuidesImmediately);
  const endDragRef = useRef(endDrag);
  const clientToNormRef = useRef(clientToNorm);
  applyBoxRef.current = applyBoxImmediately;
  applyGuidesRef.current = applyGuidesImmediately;
  endDragRef.current = endDrag;
  clientToNormRef.current = clientToNorm;

  useEffect(() => {
    const onWindowMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const latest = latestRef.current;
      const point = clientToNormRef.current(event.clientX, event.clientY);
      const angleDelta =
        drag.handle === "rotate"
          ? pointerAngleDegrees(
              point.x,
              point.y,
              drag.startRect,
              latest.canvasWidth,
              latest.canvasHeight,
            ) - drag.originAngle
          : 0;
      const raw = applyHandleDelta(
        drag.handle,
        drag.start,
        point.x - drag.originX,
        point.y - drag.originY,
        drag.rect,
        angleDelta,
      );
      const { transform: next, guides: nextGuides } = snapTransform(
        raw,
        drag.handle,
        latest.canvasWidth,
        latest.canvasHeight,
        latest.sourceW,
        latest.sourceH,
      );
      applyGuidesRef.current(nextGuides);
      applyBoxRef.current(next);
      latest.onPreviewTransform(next);
    };
    const onWindowUp = (event: PointerEvent) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) {
        return;
      }
      endDragRef.current(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (playing) {
      event.preventDefault();
      event.stopPropagation();
      onTogglePlay();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect(clip.id);
    const point = clientToNorm(event.clientX, event.clientY);
    const handle = hitHandle(
      point.x,
      point.y,
      rect,
      transform.rotation,
      canvasWidth,
      canvasHeight,
    );
    if (!handle) return;
    dragRef.current = {
      handle,
      start: transform,
      originX: point.x,
      originY: point.y,
      originAngle: pointerAngleDegrees(
        point.x,
        point.y,
        rect,
        canvasWidth,
        canvasHeight,
      ),
      rect: { width: rect.width, height: rect.height },
      startRect: rect,
      pointerId: event.pointerId,
    };
    boxRef.current?.classList.add("is-dragging");
    event.currentTarget.style.cursor = cursorForHandle(handle, transform.rotation);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    setHoverCursor(clientToNorm(event.clientX, event.clientY));
  };

  const left = `${rect.left * 100}%`;
  const top = `${rect.top * 100}%`;
  const width = `${rect.width * 100}%`;
  const height = `${rect.height * 100}%`;

  return (
    <div
      ref={rootRef}
      className={`studio-editor-transform-layer${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`}
    >
      <div
        ref={hitRef}
        className="studio-editor-transform-hit"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (!dragRef.current && hitRef.current) {
            hitRef.current.style.cursor = "";
          }
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const reset = { scale: 1, x: 0, y: 0, rotation: 0 };
          onPreviewTransform(reset);
          commit(reset);
        }}
      />
      {selected && !playing ? (
        <div
          ref={boxRef}
          className="studio-editor-transform-box"
          style={{
            left,
            top,
            width,
            height,
            transform: `rotate(${transform.rotation}deg)`,
          }}
        >
          <span className="studio-editor-transform-handle is-nw" />
          <span className="studio-editor-transform-handle is-ne" />
          <span className="studio-editor-transform-handle is-sw" />
          <span className="studio-editor-transform-handle is-se" />
          <span className="studio-editor-transform-rotate" aria-hidden="true">
            <span className="studio-editor-transform-rotate-stem" />
            <span className="studio-editor-transform-rotate-knob">
              <RotateCw size={12} strokeWidth={2.25} aria-hidden="true" />
            </span>
          </span>
          <span ref={badgeRef} className="studio-editor-transform-badge">
            {Math.abs(transform.rotation) > 0.5
              ? `${Math.round(transform.rotation)}°`
              : `${Math.round(transform.scale * 100)}%`}
          </span>
        </div>
      ) : null}
      <span
        className={`studio-editor-transform-guide is-vertical${guides.x === 0.5 ? " is-center" : ""}`}
        style={{
          display: guides.x == null ? "none" : "block",
          left: guides.x == null ? undefined : `${guides.x * 100}%`,
        }}
      />
      <span
        className={`studio-editor-transform-guide is-horizontal${guides.y === 0.5 ? " is-center" : ""}`}
        style={{
          display: guides.y == null ? "none" : "block",
          top: guides.y == null ? undefined : `${guides.y * 100}%`,
        }}
      />
    </div>
  );
}
