/** Bunny Optimizer query params — present only on thumbnail/preview transforms. */
const THUMB_MAX_WIDTH = 1280;

export function isBunnyOptimizedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("blur")) return true;
    const width = Number(parsed.searchParams.get("width") || 0);
    if (width > 0 && width <= THUMB_MAX_WIDTH) return true;
    const quality = Number(parsed.searchParams.get("quality") || 0);
    // Full reads use quality=100 + a high width ceiling; thumbs use ~58–88.
    if (quality > 0 && quality < 95 && (width <= 0 || width <= THUMB_MAX_WIDTH)) return true;
    return false;
  } catch {
    return false;
  }
}

/** First absolute URL that is not a Bunny thumbnail/preview transform. */
export function fullQualityUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      /^https?:\/\//i.test(candidate) &&
      !isBunnyOptimizedUrl(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

/** Prefer an optimized thumb when available; otherwise any absolute URL. */
export function thumbnailDisplayUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  let fallback: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !/^https?:\/\//i.test(candidate)) continue;
    if (isBunnyOptimizedUrl(candidate)) return candidate;
    if (!fallback) fallback = candidate;
  }
  return fallback;
}

/** Trigger a real file download (works for cross-origin CDN URLs with CORS). */
export async function downloadMediaUrl(url: string, filename = "download") {
  if (!url) return false;
  const safeName = filename.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
    return true;
  } catch {
    // Fallback: still try the download attribute without a new-tab target.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return false;
  }
}
