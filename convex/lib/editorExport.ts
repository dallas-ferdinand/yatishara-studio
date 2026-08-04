/**
 * Shared export size helpers — client + FFmpeg export must agree.
 */

export type FrameRatio = "16:9" | "9:16" | "1:1";
export type ExportResolution = "720p" | "1080p" | "4K";
export type ExportKind = "video" | "audio" | "studio";
export type ExportAudioFormat = "mp3" | "wav" | "m4a";
export type ExportVideoFormat = "mp4";

export const DEFAULT_EXPORT_RESOLUTION: ExportResolution = "1080p";
export const DEFAULT_EXPORT_KIND: ExportKind = "video";
export const DEFAULT_EXPORT_AUDIO_FORMAT: ExportAudioFormat = "mp3";
export const DEFAULT_EXPORT_VIDEO_FORMAT: ExportVideoFormat = "mp4";

export const EXPORT_RESOLUTION_PRESETS: Array<{
  id: ExportResolution;
  label: string;
}> = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "4K", label: "4K" },
];

export const EXPORT_KIND_PRESETS: Array<{
  id: ExportKind;
  label: string;
  hint: string;
}> = [
  { id: "video", label: "Video", hint: "Rendered timeline as a video file" },
  { id: "audio", label: "Audio", hint: "Mixed soundtrack only" },
  { id: "studio", label: "Studio", hint: "Portable .studio project package" },
];

export const EXPORT_VIDEO_FORMAT_PRESETS: Array<{
  id: ExportVideoFormat;
  label: string;
}> = [{ id: "mp4", label: "MP4" }];

export const EXPORT_AUDIO_FORMAT_PRESETS: Array<{
  id: ExportAudioFormat;
  label: string;
}> = [
  { id: "mp3", label: "MP3" },
  { id: "wav", label: "WAV" },
  { id: "m4a", label: "M4A" },
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

export function normalizeExportKind(value: unknown): ExportKind {
  if (value === "video" || value === "audio" || value === "studio") return value;
  return DEFAULT_EXPORT_KIND;
}

export function normalizeExportAudioFormat(value: unknown): ExportAudioFormat {
  if (value === "mp3" || value === "wav" || value === "m4a") return value;
  return DEFAULT_EXPORT_AUDIO_FORMAT;
}

export function normalizeExportVideoFormat(value: unknown): ExportVideoFormat {
  if (value === "mp4") return value;
  return DEFAULT_EXPORT_VIDEO_FORMAT;
}

export function exportSizeForRatioAndResolution(
  ratio: unknown,
  resolution?: unknown,
): { width: number; height: number } {
  const frameRatio = normalizeFrameRatio(ratio);
  const tier = normalizeExportResolution(resolution);
  return SIZE_BY_RATIO[frameRatio][tier];
}

export function audioExportMime(format: ExportAudioFormat): string {
  if (format === "wav") return "audio/wav";
  if (format === "m4a") return "audio/mp4";
  return "audio/mpeg";
}

export function audioExportExt(format: ExportAudioFormat): string {
  return `.${format}`;
}
