import type { EditorMediaItem } from "./types";

export const STUDIO_PREVIEW_LOAD_QUALITY_KEY = "yatishara-studio-preview-load-quality";
export const PREVIEW_LOAD_QUALITY_EVENT = "studio-preview-load-quality";
export const DEFAULT_PREVIEW_LOAD_QUALITY = 60;
export const PREVIEW_LOAD_QUALITY_VALUES = [40, 60, 80, 100] as const;

export type PreviewLoadQuality = (typeof PREVIEW_LOAD_QUALITY_VALUES)[number];

export const PREVIEW_LOAD_QUALITY_OPTIONS = PREVIEW_LOAD_QUALITY_VALUES.map((value) => ({
  value: String(value),
  label: `${value}%`,
}));

export function isPreviewLoadQuality(value: number): value is PreviewLoadQuality {
  return (PREVIEW_LOAD_QUALITY_VALUES as readonly number[]).includes(value);
}

export function readPreviewLoadQuality(): PreviewLoadQuality {
  if (typeof window === "undefined") return DEFAULT_PREVIEW_LOAD_QUALITY;
  const raw = Number(window.localStorage.getItem(STUDIO_PREVIEW_LOAD_QUALITY_KEY));
  return isPreviewLoadQuality(raw) ? raw : DEFAULT_PREVIEW_LOAD_QUALITY;
}

export function writePreviewLoadQuality(quality: PreviewLoadQuality): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STUDIO_PREVIEW_LOAD_QUALITY_KEY, String(quality));
  window.dispatchEvent(
    new CustomEvent(PREVIEW_LOAD_QUALITY_EVENT, { detail: { quality } }),
  );
}

/** 80%+ uses the 1080 edit proxy when available; lower uses the faster 720 proxy. */
export function prefersHighPreviewProxy(quality: number): boolean {
  return quality >= 80;
}

/** Pick the CDN URL the editor preview should decode for this media. */
export function playbackUrlForMedia(
  media: Pick<EditorMediaItem, "kind" | "url" | "proxyUrl" | "proxyHighUrl"> | null | undefined,
  quality: number = DEFAULT_PREVIEW_LOAD_QUALITY,
): string | undefined {
  if (!media) return undefined;
  if (media.kind === "video") {
    if (prefersHighPreviewProxy(quality)) {
      return media.proxyHighUrl ?? media.proxyUrl ?? media.url;
    }
    return media.proxyUrl ?? media.proxyHighUrl ?? media.url;
  }
  return media.proxyUrl ?? media.url;
}
