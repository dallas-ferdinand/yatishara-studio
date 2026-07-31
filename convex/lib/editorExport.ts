/**
 * Shared export size helpers — client + FFmpeg export must agree.
 */

export type FrameRatio = "16:9" | "9:16" | "1:1";
export type ExportResolution = "720p" | "1080p" | "4K";

export const DEFAULT_EXPORT_RESOLUTION: ExportResolution = "1080p";

export const EXPORT_RESOLUTION_PRESETS: Array<{
  id: ExportResolution;
  label: string;
}> = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "4K", label: "4K" },
];

const SIZE_BY_RATIO: Record<
  FrameRatio,
  Record<ExportResolution, { width: number; height: number }>
> = {
  "16:9": {
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
    "4K": { width: 3840, height: 2160 },
  },
  "9:16": {
    "720p": { width: 720, height: 1280 },
    "1080p": { width: 1080, height: 1920 },
    "4K": { width: 2160, height: 3840 },
  },
  "1:1": {
    "720p": { width: 720, height: 720 },
    "1080p": { width: 1080, height: 1080 },
    "4K": { width: 2160, height: 2160 },
  },
};

export function normalizeFrameRatio(value: unknown): FrameRatio {
  if (value === "9:16" || value === "1:1" || value === "16:9") return value;
  return "16:9";
}

export function normalizeExportResolution(value: unknown): ExportResolution {
  if (value === "720p" || value === "1080p" || value === "4K") return value;
  return DEFAULT_EXPORT_RESOLUTION;
}

export function exportSizeForRatioAndResolution(
  ratio: unknown,
  resolution?: unknown,
): { width: number; height: number } {
  const frameRatio = normalizeFrameRatio(ratio);
  const tier = normalizeExportResolution(resolution);
  return SIZE_BY_RATIO[frameRatio][tier];
}
