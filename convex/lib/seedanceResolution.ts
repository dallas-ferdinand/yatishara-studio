/**
 * Seedance 2.0 (dreamina-seedance-2-0) gateway parameter alignment.
 *
 * Vercel AI Gateway catalog for `bytedance/seedance-2.0`:
 *   Resolutions: `720p` / `1080p` only (not WxH, not 480p).
 *   Aspect ratios: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9.
 *   Duration: 4–15s.
 *
 * Studio may store WxH for pricing/UI; convert at the gateway boundary.
 * Draft 480p / 854x480 is upgraded to 720p because the gateway rejects 480p.
 */
export type SeedanceResolutionLabel = "720p" | "1080p";

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
    key === "1080p" ||
    key === "1080" ||
    key === "fhd" ||
    key === "1920x1080" ||
    key === "1080x1920"
  ) {
    return "1080p";
  }

  // Everything else (including 480p / 854x480 / 720p / image tiers) → 720p.
  // Gateway rejects 480p for seedance-2.0.
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
