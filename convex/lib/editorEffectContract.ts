/**
 * Pure preview/export transition contract. This module intentionally has no
 * Convex or browser dependencies so the compositor and FFmpeg exporter use the
 * same normalized effect IDs.
 */
export const EDITOR_TRANSITION_SPECS = {
  none: { shaderId: 0, ffmpeg: "fade" },
  crossfade: { shaderId: 1, ffmpeg: "fade" },
  dipToBlack: { shaderId: 2, ffmpeg: "fadeblack" },
  dipToWhite: { shaderId: 3, ffmpeg: "fadewhite" },
  wipeLeft: { shaderId: 4, ffmpeg: "wipeleft" },
  wipeRight: { shaderId: 5, ffmpeg: "wiperight" },
  wipeUp: { shaderId: 6, ffmpeg: "wipeup" },
  slideLeft: { shaderId: 7, ffmpeg: "slideleft" },
  zoomIn: { shaderId: 8, ffmpeg: "zoomin" },
  // FFmpeg has no direct equivalent to the realtime two-pass blur.
  blur: { shaderId: 9, ffmpeg: "smoothleft" },
} as const;

export type EditorTransitionName = keyof typeof EDITOR_TRANSITION_SPECS;

export function normalizeEditorTransition(value: unknown): EditorTransitionName {
  return typeof value === "string" && value in EDITOR_TRANSITION_SPECS
    ? (value as EditorTransitionName)
    : "crossfade";
}

export function ffmpegTransitionFor(value: unknown): string {
  return EDITOR_TRANSITION_SPECS[normalizeEditorTransition(value)].ffmpeg;
}

export function transitionShaderIdFor(value: unknown): number {
  return EDITOR_TRANSITION_SPECS[normalizeEditorTransition(value)].shaderId;
}
