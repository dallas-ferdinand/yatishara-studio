import type { ClipEffects } from "./types";

export type ClipTransform = {
  /** 1 = 100% of the largest contained size, preserving source aspect. */
  scale: number;
  /** Pan as a fraction of canvas size. 0 = centered. */
  x: number;
  /** Pan as a fraction of canvas size. 0 = centered. */
  y: number;
  /** Rotation in degrees. */
  rotation: number;
};

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
};

export const CLIP_TRANSFORM_LIMITS = {
  scaleMin: 0.2,
  scaleMax: 4,
  panMin: -1.5,
  panMax: 1.5,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeClipTransform(
  effects: ClipEffects | undefined,
): ClipTransform {
  const rotation = Number.isFinite(effects?.rotation)
    ? Number(effects?.rotation)
    : 0;
  return {
    scale: clamp(
      Number.isFinite(effects?.scale) ? Number(effects?.scale) : 1,
      CLIP_TRANSFORM_LIMITS.scaleMin,
      CLIP_TRANSFORM_LIMITS.scaleMax,
    ),
    x: clamp(
      Number.isFinite(effects?.x) ? Number(effects?.x) : 0,
      CLIP_TRANSFORM_LIMITS.panMin,
      CLIP_TRANSFORM_LIMITS.panMax,
    ),
    y: clamp(
      Number.isFinite(effects?.y) ? Number(effects?.y) : 0,
      CLIP_TRANSFORM_LIMITS.panMin,
      CLIP_TRANSFORM_LIMITS.panMax,
    ),
    rotation: ((rotation % 360) + 360) % 360,
  };
}

/**
 * Contain-sized content rect in normalized canvas coordinates [0,1], after
 * user scale/pan. Used by the preview selection overlay.
 */
export function contentRectForTransform(
  transform: ClipTransform,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { left: number; top: number; width: number; height: number } {
  const canvasAspect = canvasWidth / Math.max(1, canvasHeight);
  const sourceAspect =
    (sourceWidth || canvasWidth) / Math.max(1, sourceHeight || canvasHeight);
  let containW = 1;
  let containH = 1;
  if (sourceAspect > canvasAspect) {
    containW = 1;
    containH = canvasAspect / sourceAspect;
  } else {
    containW = sourceAspect / canvasAspect;
    containH = 1;
  }
  const width = containW * transform.scale;
  const height = containH * transform.scale;
  const left = 0.5 + transform.x - width / 2;
  const top = 0.5 + transform.y - height / 2;
  return { left, top, width, height };
}

/** FFmpeg contain + size/position/rotation matching the GPU compositor. */
export function ffmpegTransformFilter(
  width: number,
  height: number,
  effects: ClipEffects | undefined,
): string {
  const transform = normalizeClipTransform(effects);
  const scale = transform.scale;
  const scaledW = Math.max(2, Math.round(width * scale));
  const scaledH = Math.max(2, Math.round(height * scale));
  const panX = Math.round(transform.x * width);
  const panY = Math.round(transform.y * height);
  const rad = (-transform.rotation * Math.PI) / 180;
  const filters = [
    `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease`,
  ];
  if (Math.abs(transform.rotation) > 0.05) {
    // FFmpeg positive angles are CCW; editor/CSS positive is CW.
    filters.push(
      `rotate=${rad}:c=black@0:ow=rotw(iw):oh=roth(ih)`,
    );
  }
  filters.push(
    `crop='min(iw,${width})':'min(ih,${height})':'max(0,min(iw-${width},(iw-${width})/2-${panX}))':'max(0,min(ih-${height},(ih-${height})/2-${panY}))'`,
    `pad=${width}:${height}:'max(0,min(ow-iw,(ow-iw)/2+${panX}))':'max(0,min(oh-ih,(oh-ih)/2+${panY}))':black`,
  );
  return filters.join(",");
}
