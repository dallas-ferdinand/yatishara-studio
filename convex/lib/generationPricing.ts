/**
 * Credit costs aligned with Higgsfield-style resolution/duration tiers.
 * Integer credits only at TT$0.50/credit.
 *
 * Model tiers target ~50%+ gross margin vs worst-case Vercel AI Gateway COGS
 * (US$1 = TT$10), plus platform overhead per generation.
 * Anchor: 720p / 15s / image refs ≈ TT$100 (200 credits).
 */

export const CREDIT_PRICE_TTD = 0.5;
export const MIN_GROSS_MARGIN = 0.35;

/** GPT Image 2 — per generation */
export const IMAGE_CREDITS_BY_RESOLUTION: Record<string, number> = {
  "1K": 3,
  "2K": 17,
  "4K": 34,
};

/** +8 credits when reference images are used on 2K/4K (edit input tokens). */
export const IMAGE_REFERENCE_SURCHARGE = 8;

/** Seedance 2.0 — credits per 5-second block by output resolution */
export const SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK: Record<string, number> = {
  "854x480": 36,
  "1280x720": 61,
  "1920x1080": 133,
};

/** @deprecated use SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK */
export const VIDEO_BASE_CREDITS_PER_BLOCK = SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK;

/**
 * Kling 3.0 I2V — credits per 5-second block (Vercel gateway COGS ~$0.084/s 720p,
 * ~$0.112/s with audio vs Seedance ~$0.25/s 720p). Lower base; no multimodal ref surcharges.
 */
export const KLING_VIDEO_BASE_CREDITS_PER_BLOCK: Record<string, number> = {
  "854x480": 10,
  "1280x720": 17,
  "1920x1080": 37,
};

export type VideoPricingModel = "seedance-2.0" | "kling-3.0-i2v";

export const KLING_VIDEO_AUDIO_SURCHARGE_PER_BLOCK = 5;

/** Per 5-second block surcharges */
export const VIDEO_AUDIO_SURCHARGE_PER_BLOCK = 7;
export const VIDEO_IMAGE_REFERENCE_SURCHARGE_PER_BLOCK = 6;
export const VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_720 = 5;
export const VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_1080 = 13;
export const VIDEO_VIDEO_REFERENCE_SURCHARGE_PER_BLOCK = 10;

/** VPS, Convex, Bunny, CDN, email — per generation (TT$1.00). */
export const PLATFORM_OVERHEAD_CREDITS_MEDIA = 2;
/** Platform overhead for text/script (TT$0.50). */
export const PLATFORM_OVERHEAD_CREDITS_TEXT = 1;

export const TEXT_GENERATION_BASE_CREDITS = 2;
export const TEXT_IMAGE_REFERENCE_CREDITS = 2;
export const TEXT_AUDIO_REFERENCE_CREDITS = 3;
export const TEXT_VIDEO_REFERENCE_CREDITS = 6;

export function normalizeImageResolutionLabel(
  resolution: string | undefined,
): keyof typeof IMAGE_CREDITS_BY_RESOLUTION {
  const upper = (resolution ?? "2K").toUpperCase();
  if (upper === "1K" || upper === "2K" || upper === "4K") {
    return upper;
  }
  return "2K";
}

export function imageCreditCost(args: {
  resolution?: string;
  hasReferenceInput?: boolean;
}): number {
  const label = normalizeImageResolutionLabel(args.resolution);
  const base = IMAGE_CREDITS_BY_RESOLUTION[label];
  const referenceSurcharge =
    args.hasReferenceInput && label !== "1K" ? IMAGE_REFERENCE_SURCHARGE : 0;
  return base + referenceSurcharge + PLATFORM_OVERHEAD_CREDITS_MEDIA;
}

export function videoDurationBlocks(durationSeconds?: number): number {
  const duration = Math.max(4, Math.min(15, Math.ceil(Number(durationSeconds) || 4)));
  return Math.ceil(duration / 5);
}

export function videoBaseCreditsPerBlock(
  resolution: string | undefined,
  videoModel: VideoPricingModel = "seedance-2.0",
): number {
  const table =
    videoModel === "kling-3.0-i2v"
      ? KLING_VIDEO_BASE_CREDITS_PER_BLOCK
      : SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK;
  if (resolution === "854x480") {
    return table["854x480"];
  }
  if (resolution === "1920x1080") {
    return table["1920x1080"];
  }
  return table["1280x720"];
}

export function videoCreditCost(args: {
  resolution?: string;
  durationSeconds?: number;
  hasReferenceInput?: boolean;
  hasVideoReferenceInput?: boolean;
  hasNonVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: VideoPricingModel;
}): number {
  const videoModel = args.videoModel ?? "seedance-2.0";
  const blocks = videoDurationBlocks(args.durationSeconds);
  let perBlock = videoBaseCreditsPerBlock(args.resolution, videoModel);

  if (args.audioEnabled) {
    perBlock +=
      videoModel === "kling-3.0-i2v"
        ? KLING_VIDEO_AUDIO_SURCHARGE_PER_BLOCK
        : VIDEO_AUDIO_SURCHARGE_PER_BLOCK;
  }

  if (videoModel === "kling-3.0-i2v") {
    // Kling I2V: start frame only — prop/location refs are prompt-only, no multimodal billing.
    return perBlock * blocks + PLATFORM_OVERHEAD_CREDITS_MEDIA;
  }

  if (args.hasVideoReferenceInput) {
    perBlock += VIDEO_VIDEO_REFERENCE_SURCHARGE_PER_BLOCK;
  }
  if (args.hasNonVideoReferenceInput) {
    perBlock +=
      args.resolution === "1920x1080"
        ? VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_1080
        : VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_720;
  } else if (args.hasReferenceInput) {
    perBlock += VIDEO_IMAGE_REFERENCE_SURCHARGE_PER_BLOCK;
  }

  return perBlock * blocks + PLATFORM_OVERHEAD_CREDITS_MEDIA;
}

export function textCreditCost(args: {
  imageReferenceCount?: number;
  videoReferenceCount?: number;
  audioReferenceCount?: number;
}): number {
  return (
    TEXT_GENERATION_BASE_CREDITS +
    PLATFORM_OVERHEAD_CREDITS_TEXT +
    Math.max(0, Math.ceil(args.imageReferenceCount ?? 0)) *
      TEXT_IMAGE_REFERENCE_CREDITS +
    Math.max(0, Math.ceil(args.audioReferenceCount ?? 0)) *
      TEXT_AUDIO_REFERENCE_CREDITS +
    Math.max(0, Math.ceil(args.videoReferenceCount ?? 0)) *
      TEXT_VIDEO_REFERENCE_CREDITS
  );
}

export type GenerationCreditTier =
  | "image"
  | "pro_video"
  | "low"
  | "medium"
  | "high";

export function creditCostForGeneration(args: {
  tier: GenerationCreditTier;
  resolution?: string;
  durationSeconds?: number;
  hasReferenceInput?: boolean;
  hasVideoReferenceInput?: boolean;
  hasNonVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: VideoPricingModel;
}): number {
  if (args.tier === "pro_video") {
    return videoCreditCost(args);
  }
  return imageCreditCost({
    resolution: args.resolution,
    hasReferenceInput: args.hasReferenceInput,
  });
}
