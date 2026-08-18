import {
  ffmpegFitAspect,
  resolveFitMode,
} from "../../../convex/lib/clipFit";
import type { ClipEffects } from "./types";

export {
  contentRectForTransform,
  defaultFitModeForKind,
  ffmpegFitAspect,
  fittedNormalizedSize,
  isMediaFitMode,
  resolveFitMode,
  type MediaFitMode,
} from "../../../convex/lib/clipFit";

export type ClipTransform = {
  /** 1 = 100% of the fitted quad (contain for stills, cover for video). */
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
  /** 0% allowed — 1% slider steps in the inspector. */
  scaleMin: 0,
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

/** Decoded pixels first, then stored media size. Never the canvas frame. */
export function overlaySourceSize(
  decoded?: { width?: number; height?: number } | null,
  media?: { width?: number; height?: number } | null,
): { width: number; height: number } | null {
  const decodedW = decoded?.width;
  const decodedH = decoded?.height;
  if (decodedW && decodedW > 1 && decodedH && decodedH > 1) {
    return { width: decodedW, height: decodedH };
  }
  const mediaW = media?.width;
  const mediaH = media?.height;
  if (mediaW && mediaW > 1 && mediaH && mediaH > 1) {
    return { width: mediaW, height: mediaH };
  }
  return null;
}

/** FFmpeg fit + crop matching the compositor. Scale 1 = the fitted quad. */
export function ffmpegTransformFilter(
  width: number,
  height: number,
  effects: ClipEffects | undefined,
  kind?: string,
): string {
  const transform = normalizeClipTransform(effects);
  const fitMode = resolveFitMode(effects, kind);
  const scale = transform.scale;
  // Near-zero → tiny then pad to black (matches invisible GPU scale).
  const scaledW = Math.max(2, Math.round(width * Math.max(scale, 0)));
  const scaledH = Math.max(2, Math.round(height * Math.max(scale, 0)));
  const panX = Math.round(transform.x * width);
  const panY = Math.round(transform.y * height);
  const rad = (-transform.rotation * Math.PI) / 180;
  const filters = [
    scale < 0.005
      ? `scale=2:2`
      : `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=${ffmpegFitAspect(fitMode)}`,
  ];
  if (Math.abs(transform.rotation) > 0.05 && scale >= 0.005) {
    // FFmpeg positive angles are CCW; editor/CSS positive is CW.
    filters.push(
      `rotate=${rad}:c=black@0:ow=rotw(iw):oh=roth(ih)`,
    );
  }
  filters.push(
    `crop='min(iw,${width})':'min(ih,${height})':'max(0,min(iw-${width},(iw-${width})/2-${panX}))':'max(0,min(ih-${height},(ih-${height})/2-${panY}))'`,
    `pad=${width}:${height}:'max(0,min(ow-iw,(ow-iw)/2+${panX}))':'max(0,min(oh-ih,(oh-ih)/2+${panY}))':black`,
  );
  const opacity = clampClipOpacity(effects?.opacity);
  if (opacity < 0.999) {
    // Fade toward black (opaque export canvas) — matches preview over u_background.
    filters.push(
      `lutrgb=r='val*${opacity.toFixed(4)}':g='val*${opacity.toFixed(4)}':b='val*${opacity.toFixed(4)}'`,
    );
  }
  return filters.join(",");
}

export function clampClipOpacity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0, 1);
}
