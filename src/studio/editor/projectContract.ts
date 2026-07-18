/**
 * Shared editor project helpers used by client + export.
 * Keep export semantics aligned with these rules.
 */

import type { FrameRatio } from "./types";

export const EDITOR_PROJECT_VERSION = 2;

export const EXPORT_FPS = 30;

export const DEFAULT_FRAME_RATIO: FrameRatio = "16:9";

export const FRAME_RATIO_PRESETS: Array<{
  id: FrameRatio;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  cssRatio: string;
}> = [
  { id: "16:9", label: "Landscape", shortLabel: "16:9", width: 1280, height: 720, cssRatio: "16 / 9" },
  { id: "9:16", label: "Portrait", shortLabel: "9:16", width: 720, height: 1280, cssRatio: "9 / 16" },
  { id: "1:1", label: "Square", shortLabel: "1:1", width: 1080, height: 1080, cssRatio: "1 / 1" },
];

/** @deprecated Prefer exportSizeForRatio — kept for callers that assume 16:9. */
export const EXPORT_WIDTH = 1280;
/** @deprecated Prefer exportSizeForRatio — kept for callers that assume 16:9. */
export const EXPORT_HEIGHT = 720;

export function normalizeFrameRatio(value: unknown): FrameRatio {
  if (value === "9:16" || value === "1:1" || value === "16:9") return value;
  return DEFAULT_FRAME_RATIO;
}

export function exportSizeForRatio(ratio: FrameRatio | undefined): {
  width: number;
  height: number;
  cssRatio: string;
} {
  const id = normalizeFrameRatio(ratio);
  const preset = FRAME_RATIO_PRESETS.find((item) => item.id === id) ?? FRAME_RATIO_PRESETS[0]!;
  return { width: preset.width, height: preset.height, cssRatio: preset.cssRatio };
}

export function clipDurationSec(clip: { trimIn: number; trimOut: number }): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

export function sortedClipsOnTrack<T extends { trackId: string; startTime: number }>(
  clips: T[],
  trackId: string,
): T[] {
  return clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
}

/** Flatten a track into sequential segments including black/gap pads. */
export function timelineSegmentsForTrack<
  T extends { startTime: number; trimIn: number; trimOut: number },
>(clips: T[]): Array<{ type: "gap"; duration: number } | { type: "clip"; clip: T; duration: number }> {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const segments: Array<
    { type: "gap"; duration: number } | { type: "clip"; clip: T; duration: number }
  > = [];
  let cursor = 0;
  for (const clip of sorted) {
    const duration = clipDurationSec(clip);
    if (clip.startTime > cursor + 0.02) {
      segments.push({ type: "gap", duration: clip.startTime - cursor });
    }
    segments.push({ type: "clip", clip, duration });
    cursor = Math.max(cursor, clip.startTime + duration);
  }
  return segments;
}

export function isLikelyEditorProject(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return Array.isArray(project.tracks) && Array.isArray(project.clips);
}
