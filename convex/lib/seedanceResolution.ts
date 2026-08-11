/**
 * Seedance BytePlus Ark parameter alignment.
 *
 * - Seedance 2.5 (`dreamina-seedance-2-5-*`): Resolutions `480p` / `720p`; duration 4–30s.
 * - Seedance 2.0 (`dreamina-seedance-2-0-*`): Resolutions `480p` / `720p` / `1080p` / `4k`; duration 4–15s.
 *
 * Studio may store WxH for pricing/UI; convert at the Ark boundary.
 * For 2.5, unsupported tiers (1080p / 4K) clamp to 720p.
 * For 2.0, all four labels are passed through.
 */
export type SeedanceResolutionLabel = "480p" | "720p" | "1080p" | "4k";

const SEEDANCE_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
]);

function isSeedance20Model(videoModel?: string | null): boolean {
  if (!videoModel?.trim()) return false;
  const key = videoModel.trim().toLowerCase();
  if (key.includes("seedance-2.5") || key.includes("seedance-2-5")) {
    return false;
  }
  return (
    key === "seedance-2.0" ||
    key.includes("seedance-2.0") ||
    key.includes("seedance-2-0")
  );
}

export function normalizeSeedanceResolution(
  resolution: string | undefined,
  videoModel?: string | null,
): SeedanceResolutionLabel {
  if (!resolution?.trim()) return "720p";
  const key = resolution.trim().toLowerCase().replace(/×/g, "x");
  const allowHd = isSeedance20Model(videoModel);

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

  if (
    key === "3840x2160" ||
    key === "2160x3840" ||
    key === "4k" ||
    key === "2160p"
  ) {
    return allowHd ? "4k" : "720p";
  }

  if (
    key === "1920x1080" ||
    key === "1080x1920" ||
    key === "1080p" ||
    key === "1080" ||
    key === "fhd"
  ) {
    return allowHd ? "1080p" : "720p";
  }

  if (
    key === "720p" ||
    key === "720" ||
    key === "1280x720" ||
    key === "720x1280" ||
    key === "hd"
  ) {
    return "720p";
  }

  // Image tiers / unknown → 720p.
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
  const key = resolution.trim().toLowerCase().replace(/×/g, "x");
  return (
    /^(480p|720p|1080p|2160p|4k|480|720|1080|hd|fhd)$/.test(key) ||
    /^\d+x\d+$/.test(key)
  );
}
