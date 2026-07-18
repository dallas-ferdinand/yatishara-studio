/**
 * Generation pricing.
 *
 * Image + video + text (script / element notes): 2× Vercel AI Gateway model COGS,
 * rounded up to the next TT$0.50. FX: US$1 = TT$10. Ledger: TT$0.50 per credit.
 * No platform fee on top of the 2× markup.
 *
 * Seedance (`bytedance/seedance-2.0`): $7/M tokens — same customer price with/without video refs.
 *   tokens ≈ (height × width × 24fps × seconds) / 1024. Audio included. Max 15s.
 * Omni Flash (`google/gemini-omni-flash-preview`): $0.10/s output (Veo Fast-aligned). Max 10s.
 *
 * Kling 3.0 I2V (MCP, `mode: "pro"`): $0.224/s silent · $0.336/s with audio.
 *
 * Text / Assistance (`google/gemini-3.1-pro-preview`): $2/M input (text/image/video),
 * $4/M audio input (2× text), $12/M output — customer price is 2× measured provider
 * COGS, rounded up to TT$0.01 (Assistance settles after the turn from usage).
 */

export const CREDIT_PRICE_TTD = 0.5;
export const USD_TO_TTD = 10;
export const MIN_GROSS_MARGIN = 0.35;

/** Image quality passed to GPT Image 2. */
export type ImageQuality = "low" | "medium" | "high";

/**
 * GPT Image 2 model USD (output) at our size tiers.
 * Wide ≈ 16:9 / 9:16; square = 1:1. Official 1K + published 2K/4K anchors.
 */
const IMAGE_MODEL_USD: Record<
  "1K" | "2K" | "4K",
  Record<ImageQuality, { square: number; wide: number }>
> = {
  "1K": {
    low: { square: 0.006, wide: 0.005 },
    medium: { square: 0.053, wide: 0.041 },
    high: { square: 0.211, wide: 0.165 },
  },
  "2K": {
    low: { square: 0.008, wide: 0.006 },
    medium: { square: 0.064, wide: 0.048 },
    high: { square: 0.256, wide: 0.192 },
  },
  "4K": {
    low: { square: 0.012, wide: 0.012 },
    medium: { square: 0.101, wide: 0.101 },
    high: { square: 0.401, wide: 0.401 },
  },
};

/** Legacy base credits (pre-2× model pricing) — kept for billing display fallbacks. */
export const IMAGE_CREDITS_BY_RESOLUTION: Record<string, number> = {
  "1K": 2,
  "2K": 2,
  "4K": 5,
};

/** +TT$1 (2 credits) when reference images are used on 2K/4K. */
export const IMAGE_REFERENCE_SURCHARGE = 2;

/** Vercel Seedance 2.0 — USD per million video tokens (customer quotes). */
export const SEEDANCE_USD_PER_M_TOKENS_NO_VIDEO = 7;
/** Gateway pass-through when video is in the input — not used for customer quotes. */
export const SEEDANCE_USD_PER_M_TOKENS_WITH_VIDEO = 4.3;
export const SEEDANCE_FPS = 24;

/**
 * Google Gemini Omni Flash Preview — published video output rate (aligned with Veo 3.1 Fast).
 * Max clip length is 10s.
 */
export const OMNI_FLASH_USD_PER_SECOND = 0.1;
export const OMNI_FLASH_MAX_DURATION_SECONDS = 10;

/**
 * Kling 3.0 I2V on Vercel (studio calls `mode: "pro"`).
 * Resolution does not change the gateway listed rate.
 */
export const KLING_PRO_USD_PER_SECOND_SILENT = 0.224;
export const KLING_PRO_USD_PER_SECOND_AUDIO = 0.336;

export type VideoPricingModel =
  | "seedance-2.0"
  | "google-omni-flash"
  | "kling-3.0-i2v";

const VIDEO_RESOLUTION_WH: Record<string, { width: number; height: number }> = {
  "854x480": { width: 854, height: 480 },
  "864x480": { width: 854, height: 480 },
  "480p": { width: 854, height: 480 },
  "1280x720": { width: 1280, height: 720 },
  "720p": { width: 1280, height: 720 },
  "1920x1080": { width: 1920, height: 1080 },
  "1080p": { width: 1920, height: 1080 },
};

/** @deprecated Fixed block tables replaced by 2× gateway COGS — use videoCreditCost. */
export const SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK: Record<string, number> = {
  "854x480": 14,
  "1280x720": 31,
  "1920x1080": 69,
};

/** @deprecated use SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK */
export const VIDEO_BASE_CREDITS_PER_BLOCK = SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK;

/** @deprecated Fixed block tables replaced by 2× gateway COGS — use videoCreditCost. */
export const KLING_VIDEO_BASE_CREDITS_PER_BLOCK: Record<string, number> = {
  "854x480": 45,
  "1280x720": 45,
  "1920x1080": 45,
};

/** @deprecated Gateway includes audio in Seedance; Kling uses rate swap instead. */
export const KLING_VIDEO_AUDIO_SURCHARGE_PER_BLOCK = 0;
/** @deprecated */
export const VIDEO_AUDIO_SURCHARGE_PER_BLOCK = 0;
/** @deprecated Image refs do not change Seedance gateway token rate. */
export const VIDEO_IMAGE_REFERENCE_SURCHARGE_PER_BLOCK = 0;
/** @deprecated */
export const VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_720 = 0;
/** @deprecated */
export const VIDEO_NON_VIDEO_REFERENCE_SURCHARGE_1080 = 0;
/**
 * @deprecated Video refs switch Seedance to the cheaper $4.3/M token rate
 * (gateway bill can still include input tokens; customer price uses output tokens at that rate).
 */
export const VIDEO_VIDEO_REFERENCE_SURCHARGE_PER_BLOCK = 0;

/**
 * @deprecated Fixed platform overhead removed — image/video/text use 2× COGS only.
 * Kept for billing UI field compatibility.
 */
export const PLATFORM_OVERHEAD_CREDITS_MEDIA = 0;
/** @deprecated Text uses 2× Gemini 3.1 Pro COGS — see textCreditCost. */
export const PLATFORM_OVERHEAD_CREDITS_TEXT = 0;

/**
 * Gemini 3.1 Pro (GATEWAY_TEXT_MODEL_ID + GATEWAY_ASSISTANT_MODEL_ID) —
 * USD per million tokens. Text / image / video input share $2.00; audio $4.00; output $12.00.
 */
export const TEXT_USD_PER_M_INPUT = 2.0;
export const TEXT_USD_PER_M_OUTPUT = 12.0;
export const TEXT_USD_PER_M_AUDIO_INPUT = 4.0;

/**
 * Typical Assistance / script / element-notes turn on Gemini 3.1 Pro
 * (calibrated from prior Flash usage shape; re-measure after cutover).
 */
export const TEXT_BASE_INPUT_TOKENS = 2_000;
export const TEXT_BASE_OUTPUT_TOKENS = 600;

/** Approximate multimodal input tokens added per reference. */
export const TEXT_IMAGE_REF_INPUT_TOKENS = 1_200;
export const TEXT_VIDEO_REF_INPUT_TOKENS = 10_000;
export const TEXT_AUDIO_REF_INPUT_TOKENS = 5_000;

/**
 * Text / Assistance floor + step: TT$0.01 (0.02 credits at TT$0.50 each).
 * Customer charge = 2× Gemini 3.1 Pro provider COGS, rounded up to this cent.
 */
export const TEXT_MIN_SELL_TTD = 0.01;

/** @deprecated Prefer textCreditCost() — legacy flat base for display fallbacks. */
export const TEXT_GENERATION_BASE_CREDITS = TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD;
/** @deprecated Reference media priced via token estimate in textCreditCost. */
export const TEXT_IMAGE_REFERENCE_CREDITS = 0;
/** @deprecated */
export const TEXT_AUDIO_REFERENCE_CREDITS = 0;
/** @deprecated */
export const TEXT_VIDEO_REFERENCE_CREDITS = 0;

export function normalizeImageResolutionLabel(
  resolution: string | undefined,
): keyof typeof IMAGE_MODEL_USD {
  const upper = (resolution ?? "2K").toUpperCase();
  if (upper === "1K" || upper === "2K" || upper === "4K") {
    return upper;
  }
  return "2K";
}

export function normalizeImageQuality(
  quality: string | undefined,
): ImageQuality {
  const lower = (quality ?? "medium").toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high") {
    return lower;
  }
  return "medium";
}

function isSquareAspectRatio(aspectRatio: string | undefined): boolean {
  if (!aspectRatio) return false;
  const match = aspectRatio.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return false;
  return match[1] === match[2];
}

/** Round up to the next TT$0.50 (1.20→1.50, 1.80→2.00). */
export function roundUpToHalfTtd(ttd: number): number {
  return Math.ceil(ttd / CREDIT_PRICE_TTD) * CREDIT_PRICE_TTD;
}

export function estimateImageModelUsd(args: {
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
}): number {
  const tier = normalizeImageResolutionLabel(args.resolution);
  const quality = normalizeImageQuality(args.quality);
  const shape = isSquareAspectRatio(args.aspectRatio) ? "square" : "wide";
  return IMAGE_MODEL_USD[tier][quality][shape];
}

/** Customer TT$ for an image = 2× model COGS, rounded up to TT$0.50. */
export function imageSellPriceTtd(args: {
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
}): number {
  const modelTtd = estimateImageModelUsd(args) * USD_TO_TTD;
  return roundUpToHalfTtd(modelTtd * 2);
}

export function imageCreditCost(args: {
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
  hasReferenceInput?: boolean;
}): number {
  const label = normalizeImageResolutionLabel(args.resolution);
  const sellTtd = imageSellPriceTtd(args);
  const baseCredits = Math.round(sellTtd / CREDIT_PRICE_TTD);
  const referenceSurcharge =
    args.hasReferenceInput && label !== "1K" ? IMAGE_REFERENCE_SURCHARGE : 0;
  return Math.max(1, baseCredits + referenceSurcharge);
}

export function videoDurationSeconds(
  durationSeconds?: number,
  videoModel?: VideoPricingModel,
): number {
  const max =
    videoModel === "google-omni-flash" ? OMNI_FLASH_MAX_DURATION_SECONDS : 15;
  return Math.max(4, Math.min(max, Math.ceil(Number(durationSeconds) || 4)));
}

/** @deprecated Prefer videoDurationSeconds — blocks remain for callers that still ceil by 5s. */
export function videoDurationBlocks(durationSeconds?: number): number {
  return Math.ceil(videoDurationSeconds(durationSeconds) / 5);
}

export function normalizeVideoResolutionKey(
  resolution: string | undefined,
): "854x480" | "1280x720" | "1920x1080" {
  const raw = (resolution ?? "1280x720").toLowerCase();
  if (
    raw === "854x480" ||
    raw === "864x480" ||
    raw === "480p" ||
    raw.includes("480")
  ) {
    return "854x480";
  }
  if (raw === "1920x1080" || raw === "1080p" || raw.includes("1080")) {
    return "1920x1080";
  }
  return "1280x720";
}

export function seedanceOutputTokens(args: {
  resolution?: string;
  durationSeconds?: number;
  videoModel?: VideoPricingModel;
}): number {
  const key = normalizeVideoResolutionKey(args.resolution);
  const { width, height } = VIDEO_RESOLUTION_WH[key];
  const seconds = videoDurationSeconds(args.durationSeconds, args.videoModel);
  return (height * width * SEEDANCE_FPS * seconds) / 1024;
}

export function estimateVideoModelUsd(args: {
  resolution?: string;
  durationSeconds?: number;
  hasVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: VideoPricingModel;
}): number {
  const videoModel = args.videoModel ?? "seedance-2.0";
  const seconds = videoDurationSeconds(args.durationSeconds, videoModel);

  if (videoModel === "kling-3.0-i2v") {
    const rate = args.audioEnabled
      ? KLING_PRO_USD_PER_SECOND_AUDIO
      : KLING_PRO_USD_PER_SECOND_SILENT;
    return rate * seconds;
  }

  if (videoModel === "google-omni-flash") {
    // Same customer quote with or without refs; input tokens are small vs output.
    void args.hasVideoReferenceInput;
    void args.audioEnabled;
    return OMNI_FLASH_USD_PER_SECOND * seconds;
  }

  // Seedance — same customer price with or without video refs.
  void args.hasVideoReferenceInput;
  const tokens = seedanceOutputTokens({
    resolution: args.resolution,
    durationSeconds: args.durationSeconds,
    videoModel,
  });
  return (tokens * SEEDANCE_USD_PER_M_TOKENS_NO_VIDEO) / 1_000_000;
}

export function videoSellPriceTtd(args: {
  resolution?: string;
  durationSeconds?: number;
  hasVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: VideoPricingModel;
}): number {
  return roundUpToHalfTtd(estimateVideoModelUsd(args) * USD_TO_TTD * 2);
}

/**
 * @deprecated Prefer videoCreditCost — returns 5s silent Seedance/Kling base
 * credits for a resolution key.
 */
export function videoBaseCreditsPerBlock(
  resolution: string | undefined,
  videoModel: VideoPricingModel = "seedance-2.0",
): number {
  return videoCreditCost({
    resolution,
    durationSeconds: 5,
    videoModel,
    audioEnabled: false,
    hasVideoReferenceInput: false,
  });
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
  // Image / non-video refs do not change Vercel Seedance token rates.
  // Video refs keep the same customer price as no-ref (always $7/M or Fast $5.6/M).
  // Kling rates swap only on audio; start-frame/image is already in the I2V base.
  void args.hasReferenceInput;
  void args.hasNonVideoReferenceInput;
  void args.hasVideoReferenceInput;

  const sellTtd = videoSellPriceTtd({
    resolution: args.resolution,
    durationSeconds: args.durationSeconds,
    hasVideoReferenceInput: args.hasVideoReferenceInput,
    audioEnabled: args.audioEnabled,
    videoModel: args.videoModel,
  });
  return Math.max(1, Math.round(sellTtd / CREDIT_PRICE_TTD));
}

export function estimateTextModelUsd(args: {
  imageReferenceCount?: number;
  videoReferenceCount?: number;
  audioReferenceCount?: number;
}): number {
  const imageRefs = Math.max(0, Math.ceil(args.imageReferenceCount ?? 0));
  const videoRefs = Math.max(0, Math.ceil(args.videoReferenceCount ?? 0));
  const audioRefs = Math.max(0, Math.ceil(args.audioReferenceCount ?? 0));

  const textImageVideoInputTokens =
    TEXT_BASE_INPUT_TOKENS +
    imageRefs * TEXT_IMAGE_REF_INPUT_TOKENS +
    videoRefs * TEXT_VIDEO_REF_INPUT_TOKENS;
  const audioInputTokens = audioRefs * TEXT_AUDIO_REF_INPUT_TOKENS;

  return (
    (textImageVideoInputTokens * TEXT_USD_PER_M_INPUT) / 1_000_000 +
    (audioInputTokens * TEXT_USD_PER_M_AUDIO_INPUT) / 1_000_000 +
    (TEXT_BASE_OUTPUT_TOKENS * TEXT_USD_PER_M_OUTPUT) / 1_000_000
  );
}

function roundUpToCentTtd(ttd: number): number {
  return Math.ceil(ttd * 100) / 100;
}

export type MeasuredTextUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

/** Provider USD for Gemini 3.1 Pro text tokens. */
export function textProviderCostUsd(usage: MeasuredTextUsage): number {
  const inputTokens = Math.max(0, Math.floor(usage.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(usage.outputTokens ?? 0));
  return (
    (inputTokens * TEXT_USD_PER_M_INPUT) / 1_000_000 +
    (outputTokens * TEXT_USD_PER_M_OUTPUT) / 1_000_000
  );
}

/** Customer TT$ = 2× measured provider USD, rounded up to TT$0.01. */
export function textSellPriceFromUsageTtd(usage: MeasuredTextUsage): number {
  const raw = textProviderCostUsd(usage) * USD_TO_TTD * 2;
  return Math.max(TEXT_MIN_SELL_TTD, roundUpToCentTtd(raw));
}

export function textCreditsFromMeasuredUsage(usage: MeasuredTextUsage): number {
  const sellTtd = textSellPriceFromUsageTtd(usage);
  return Math.round((sellTtd / CREDIT_PRICE_TTD) * 100) / 100;
}

export function addMeasuredTextUsage(
  left: MeasuredTextUsage,
  right: MeasuredTextUsage,
): MeasuredTextUsage {
  return {
    inputTokens: (left.inputTokens ?? 0) + (right.inputTokens ?? 0),
    outputTokens: (left.outputTokens ?? 0) + (right.outputTokens ?? 0),
  };
}

export function measuredTextUsageFromGateway(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}): MeasuredTextUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/** Customer TT$ for script / Assistance / element text = 2× Gemini 3.1 Pro COGS, min / step TT$0.01. */
export function textSellPriceTtd(args: {
  imageReferenceCount?: number;
  videoReferenceCount?: number;
  audioReferenceCount?: number;
}): number {
  const raw = estimateTextModelUsd(args) * USD_TO_TTD * 2;
  return Math.max(TEXT_MIN_SELL_TTD, roundUpToCentTtd(raw));
}

export function textCreditCost(args: {
  imageReferenceCount?: number;
  videoReferenceCount?: number;
  audioReferenceCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}): number {
  if (args.inputTokens != null || args.outputTokens != null) {
    return textCreditsFromMeasuredUsage({
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    });
  }
  const sellTtd = textSellPriceTtd(args);
  // Fractional credits so TT$0.01 → 0.02 credits (ledger is TT$0.50 / credit).
  const credits = Math.round((sellTtd / CREDIT_PRICE_TTD) * 100) / 100;
  return Math.max(TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD, credits);
}

export type GenerationCreditTier =
  | "image"
  | "pro_video"
  | "audio"
  | "low"
  | "medium"
  | "high";

export type AudioGenType = "voiceover" | "sfx" | "music";

/** ElevenLabs Multilingual v2/v3 TTS — USD per 1K characters. */
export const ELEVEN_V3_USD_PER_1K_CHARS = 0.1;
/** ElevenLabs Sound Effects — USD per minute of output. */
export const ELEVEN_SFX_USD_PER_MINUTE = 0.12;
/** Default estimate length when SFX duration is Auto. */
export const ELEVEN_SFX_AUTO_DURATION_SECONDS = 5;
/** Stub for later Music API — not billed in v1. */
export const ELEVEN_MUSIC_USD_PER_MINUTE = 0.3;

export function estimateVoiceoverUsd(characterCount: number): number {
  const chars = Math.max(0, Math.ceil(Number(characterCount) || 0));
  return (chars / 1000) * ELEVEN_V3_USD_PER_1K_CHARS;
}

export function estimateSfxUsd(durationSeconds?: number | null): number {
  const seconds =
    durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0
      ? ELEVEN_SFX_AUTO_DURATION_SECONDS
      : Math.max(0.5, Math.min(30, Number(durationSeconds)));
  return (seconds / 60) * ELEVEN_SFX_USD_PER_MINUTE;
}

export function estimateMusicUsd(durationSeconds?: number | null): number {
  const seconds =
    durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0
      ? 60
      : Math.max(1, Math.min(180, Number(durationSeconds)));
  return (seconds / 60) * ELEVEN_MUSIC_USD_PER_MINUTE;
}

export function audioSellPriceTtd(args: {
  audioType: AudioGenType;
  characterCount?: number;
  durationSeconds?: number | null;
}): number {
  const usd =
    args.audioType === "voiceover"
      ? estimateVoiceoverUsd(args.characterCount ?? 0)
      : args.audioType === "sfx"
        ? estimateSfxUsd(args.durationSeconds)
        : estimateMusicUsd(args.durationSeconds);
  return roundUpToHalfTtd(usd * USD_TO_TTD * 2);
}

export function audioCreditCost(args: {
  audioType: AudioGenType;
  characterCount?: number;
  durationSeconds?: number | null;
}): number {
  const sellTtd = audioSellPriceTtd(args);
  return Math.max(1, Math.round(sellTtd / CREDIT_PRICE_TTD));
}

export function creditCostForGeneration(args: {
  tier: GenerationCreditTier;
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  hasReferenceInput?: boolean;
  hasVideoReferenceInput?: boolean;
  hasNonVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: VideoPricingModel;
  audioType?: AudioGenType;
  characterCount?: number;
}): number {
  if (args.tier === "pro_video") {
    return videoCreditCost(args);
  }
  if (args.tier === "audio") {
    return audioCreditCost({
      audioType: args.audioType ?? "voiceover",
      characterCount: args.characterCount,
      durationSeconds: args.durationSeconds,
    });
  }
  return imageCreditCost({
    resolution: args.resolution,
    quality: args.quality,
    aspectRatio: args.aspectRatio,
    hasReferenceInput: args.hasReferenceInput,
  });
}
