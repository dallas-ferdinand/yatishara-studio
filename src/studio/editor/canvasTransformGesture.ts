import {
  CLIP_TRANSFORM_LIMITS,
  clamp,
  contentRectForTransform,
  type ClipTransform,
  type MediaFitMode,
} from "./clipTransform";
import { textContentRectNormalized } from "./textLayout";
import type { TransformHandle } from "./transformHit";
import type { EditorClip } from "./types";

export type TransformRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SnapGuides = { x: number | null; y: number | null };

export const TEXT_TRANSFORM_LIMITS = {
  ...CLIP_TRANSFORM_LIMITS,
  scaleMin: 0,
  scaleMax: 6,
} as const;

type ScaleLimits = {
  scaleMin: number;
  scaleMax: number;
  panMin: number;
  panMax: number;
};

export function pointerAngleDegrees(
  nx: number,
  ny: number,
  rect: TransformRect,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const cx = (rect.left + rect.width / 2) * canvasWidth;
  const cy = (rect.top + rect.height / 2) * canvasHeight;
  const dx = nx * canvasWidth - cx;
  const dy = ny * canvasHeight - cy;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function cursorForHandle(
  handle: TransformHandle | null,
  rotation: number,
): string {
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

function snapByRect(
  transform: ClipTransform,
  handle: TransformHandle,
  rect: TransformRect,
): { transform: ClipTransform; guides: SnapGuides } {
  if (handle === "rotate") {
    return { transform, guides: { x: null, y: null } };
  }
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

export function snapPictureTransform(
  transform: ClipTransform,
  handle: TransformHandle,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fitMode: MediaFitMode = "cover",
): { transform: ClipTransform; guides: SnapGuides } {
  if (handle === "rotate") {
    return { transform, guides: { x: null, y: null } };
  }
  return snapByRect(
    transform,
    handle,
    contentRectForTransform(
      transform,
      canvasWidth,
      canvasHeight,
      sourceWidth,
      sourceHeight,
      fitMode,
    ),
  );
}

export function snapTextTransform(
  transform: ClipTransform,
  handle: TransformHandle,
  clip: EditorClip,
  canvasWidth: number,
  canvasHeight: number,
): { transform: ClipTransform; guides: SnapGuides } {
  if (handle === "rotate") {
    return { transform, guides: { x: null, y: null } };
  }
  return snapByRect(
    transform,
    handle,
    textContentRectNormalized(
      clip.text,
      {
        scale: transform.scale,
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation,
      },
      canvasWidth,
      canvasHeight,
    ),
  );
}

export function applyHandleDelta(
  handle: TransformHandle,
  start: ClipTransform,
  dx: number,
  dy: number,
  startRect: { width: number; height: number },
  angleDelta: number,
  limits: ScaleLimits,
  zeroScaleGrow = false,
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
      x: clamp(start.x + dx, limits.panMin, limits.panMax),
      y: clamp(start.y + dy, limits.panMin, limits.panMax),
    };
  }
  const horizontalFactor =
    1 +
    (dx / Math.max(0.001, startRect.width)) * (handle.includes("w") ? -1 : 1);
  const verticalFactor =
    1 +
    (dy / Math.max(0.001, startRect.height)) * (handle.includes("n") ? -1 : 1);
  const factor =
    Math.abs(horizontalFactor - 1) > Math.abs(verticalFactor - 1)
      ? horizontalFactor
      : verticalFactor;
  const nextScale = clamp(
    zeroScaleGrow && start.scale <= 1e-6
      ? Math.max(0, factor - 1)
      : start.scale * factor,
    limits.scaleMin,
    limits.scaleMax,
  );
  const appliedFactor =
    zeroScaleGrow && start.scale <= 1e-6 ? 1 : nextScale / Math.max(start.scale, 1e-9);
  const widthDelta =
    zeroScaleGrow && start.scale <= 1e-6
      ? nextScale * Math.max(startRect.width, 0.12)
      : startRect.width * (appliedFactor - 1);
  const heightDelta =
    zeroScaleGrow && start.scale <= 1e-6
      ? nextScale * Math.max(startRect.height, 0.12)
      : startRect.height * (appliedFactor - 1);
  return {
    ...start,
    scale: nextScale,
    x: clamp(
      start.x +
        (handle.includes("e") ? widthDelta / 2 : 0) -
        (handle.includes("w") ? widthDelta / 2 : 0),
      limits.panMin,
      limits.panMax,
    ),
    y: clamp(
      start.y +
        (handle.includes("s") ? heightDelta / 2 : 0) -
        (handle.includes("n") ? heightDelta / 2 : 0),
      limits.panMin,
      limits.panMax,
    ),
  };
}

export function transformMoved(
  next: ClipTransform,
  start: ClipTransform,
): boolean {
  return (
    Math.abs(next.scale - start.scale) > 1e-4 ||
    Math.abs(next.x - start.x) > 1e-4 ||
    Math.abs(next.y - start.y) > 1e-4 ||
    Math.abs(next.rotation - start.rotation) > 0.05
  );
}
