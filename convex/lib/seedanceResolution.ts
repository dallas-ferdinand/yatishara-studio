/**
 * Seedance gateway parameter alignment (default: Seedance 2.5).
 *
 * Vercel AI Gateway catalog for `bytedance/seedance-2.5`:
 *   Resolutions: `480p` / `720p` only (not WxH, not 1080p/4K).
 *   Aspect ratios: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9.
 *   Duration: 4–30s.
 *
 * Studio may store WxH for pricing/UI; convert at the gateway boundary.
 * 1080p / 4K requests are clamped to 720p (2.5 does not list those tiers).
 */
export type SeedanceResolutionLabel = "480p" | "720p";

const SEEDANCE_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
]);

export function normalizeSeedanceResolution(
  resolution: string | undefined,
): SeedanceResolutionLabel {
  if (!resolution?.trim()) return "720p";
  const key = resolution.trim().toLowerCase().replace(/×/g, "x");

  if (
    key === "480p" ||
    key === "480" ||
    key === "854x480" ||
    key === "864x480" ||
    key === "480x854" ||
    key === "480x864"
  ) {
    return "480p";
  }

  // 1080p / 4K / FHD → 720p (Seedance 2.5 catalog has no 1080p).
  // Everything else (including 720p / image tiers) → 720p.
  return "720p";
}

/** Map Studio aspect ratios onto Seedance-supported values. */
export function normalizeSeedanceAspectRatio(
  aspectRatio: string | undefined,
): `${number}:${number}` | undefined {
  if (!aspectRatio?.trim()) return undefined;
  const match = aspectRatio.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return undefined;
  const key = `${match[1]}:${match[2]}`;
  if (SEEDANCE_ASPECT_RATIOS.has(key)) {
    return key as `${number}:${number}`;
  }
  // Closest supported portrait for social 4:5.
  if (key === "4:5") return "3:4";
  return "16:9";
}

/** True when a resolution value is an image-tier label, not a video size. */
export function isImageResolutionTier(resolution: string | undefined): boolean {
  if (!resolution?.trim()) return false;
  return /^(1k|2k|3k|4k)$/i.test(resolution.trim());
}

/** True when a resolution looks like a video WxH / p-label. */
export function isVideoResolutionValue(resolution: string | undefined): boolean {
  if (!resolution?.trim()) return false;
  const key = resolution.trim().toLowerCase();
  return (
    /^(480p|720p|1080p|480|720|1080|hd|fhd)$/.test(key) ||
    /^\d+x\d+$/.test(key.replace(/×/g, "x"))
  );
}
