/**
 * Generation pricing.
 *
 * Image + video + text: 2× BytePlus ModelArk COGS, rounded up to the next
 * TT$0.50 (text rounds to TT$0.01). FX: US$1 = TT$10. Ledger: TT$0.50 per credit.
 * No platform fee on top of the 2× markup.
 *
 * Seedance 2.5: $10.70/M tokens (no video input) / $6.40/M (with video input).
 * Customer quotes use the no-video rate.
 * tokens ≈ (height × width × 24fps × seconds) / 1024. Audio included.
 * Resolutions 480p/720p; max 30s.
 *
 * Seedance 2.0: no-video rates by tier —
 * 480p/720p $7/M, 1080p $7.7/M, 4k $4/M; with-video $4.30/M (not used for quotes).
 * Resolutions 480p/720p/1080p/4k; max 15s.
 *
 * Seedream 5.0 Pro: $0.045/image ≤2.36MP (Studio 1K); $0.09 >2.36MP (Studio 2K).
 * Studio 4K clamps to 2K. First reference image free; each extra ref +$0.003 COGS
 * (customer surcharge via IMAGE_REFERENCE_SURCHARGE on 2K).
 *
 * Text / Assistance (Seed 2.0 Lite): $0.25/M input / $2.00/M output.
 * DM Improve (Seed 2.0 Mini): same formula; cheaper model billed from measured tokens.
 * Customer price is 2× measured provider COGS, rounded up to TT$0.01.
 */

export const CREDIT_PRICE_TTD = 0.5;
export const USD_TO_TTD = 10;
export const MIN_GROSS_MARGIN = 0.35;

/** Legacy GPT Image quality — ignored for Seedream billing (compat for callers). */
export type ImageQuality = "low" | "medium" | "high";

/**
 * Seedream 5.0 Pro USD per output image by Studio resolution tier.
 * 1K = ≤2.36MP ($0.045); 2K/4K = >2.36MP ($0.09). 4K is clamped to 2K at gen time.
 * Quality keys kept for API compat — all map to the same Seedream rate.
 */
const SEEDREAM_USD_BY_TIER: Record<"1K" | "2K" | "4K", number> = {
  "1K": 0.045,
  "2K": 0.09,
  "4K": 0.09,
};

/** @deprecated Prefer SEEDREAM_USD_BY_TIER — kept for any direct IMAGE_MODEL_USD reads. */
const IMAGE_MODEL_USD: Record<
  "1K" | "2K" | "4K",
  Record<ImageQuality, { square: number; wide: number }>
> = {
  "1K": {
    low: { square: 0.045, wide: 0.045 },
    medium: { square: 0.045, wide: 0.045 },
    high: { square: 0.045, wide: 0.045 },
  },
  "2K": {
    low: { square: 0.09, wide: 0.09 },
    medium: { square: 0.09, wide: 0.09 },
    high: { square: 0.09, wide: 0.09 },
  },
  "4K": {
    low: { square: 0.09, wide: 0.09 },
    medium: { square: 0.09, wide: 0.09 },
    high: { square: 0.09, wide: 0.09 },
  },
};

/** Legacy base credits (pre-2× model pricing) — kept for billing display fallbacks. */
export const IMAGE_CREDITS_BY_RESOLUTION: Record<string, number> = {
  "1K": 2,
  "2K": 2,
  "4K": 2,
};

/** +TT$1 (2 credits) when reference images are used on 2K/4K (extra Seedream refs). */
export const IMAGE_REFERENCE_SURCHARGE = 2;

/** Seedance 2.5 — USD per million video tokens (customer quotes use no-video rate). */
export const SEEDANCE_USD_PER_M_TOKENS_NO_VIDEO = 10.7;
/** Pass-through when video is in the input — not used for customer quotes. */
export const SEEDANCE_USD_PER_M_TOKENS_WITH_VIDEO = 6.4;
/** Seedance 2.0 no-video rates by resolution tier. */
export const SEEDANCE_20_USD_PER_M_TOKENS_NO_VIDEO = 7;
export const SEEDANCE_20_USD_PER_M_TOKENS_1080P = 7.7;
export const SEEDANCE_20_USD_PER_M_TOKENS_4K = 4;
export const SEEDANCE_20_USD_PER_M_TOKENS_WITH_VIDEO = 4.3;
export const SEEDANCE_FPS = 24;
export const SEEDANCE_25_MAX_DURATION_SECONDS = 30;
export const SEEDANCE_20_MAX_DURATION_SECONDS = 15;

/** @deprecated Omni Flash removed from Studio. */
export const OMNI_FLASH_USD_PER_SECOND = 0.1;
export const OMNI_FLASH_MAX_DURATION_SECONDS = 10;

/** @deprecated Kling removed from Studio. */
export const KLING_PRO_USD_PER_SECOND_SILENT = 0.224;
export const KLING_PRO_USD_PER_SECOND_AUDIO = 0.336;

export type VideoPricingModel = "seedance-2.5" | "seedance-2.0";

const VIDEO_RESOLUTION_WH: Record<string, { width: number; height: number }> = {
  "854x480": { width: 854, height: 480 },
  "864x480": { width: 854, height: 480 },
  "480p": { width: 854, height: 480 },
  "1280x720": { width: 1280, height: 720 },
  "720p": { width: 1280, height: 720 },
  "1920x1080": { width: 1920, height: 1080 },
  "1080p": { width: 1920, height: 1080 },
  "3840x2160": { width: 3840, height: 2160 },
  "4k": { width: 3840, height: 2160 },
  "2160p": { width: 3840, height: 2160 },
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
/** @deprecated Text uses 2× Seed Lite COGS — see textCreditCost. */
export const PLATFORM_OVERHEAD_CREDITS_TEXT = 0;

/**
 * Seed 2.0 Lite (GATEWAY_TEXT_MODEL_ID + GATEWAY_ASSISTANT_MODEL_ID) —
 * USD per million tokens. Audio input billed at 2× text input when measured separately.
 */
export const TEXT_USD_PER_M_INPUT = 0.25;
export const TEXT_USD_PER_M_OUTPUT = 2.0;
export const TEXT_USD_PER_M_AUDIO_INPUT = 0.5;

/**
 * Typical Assistance / script / element-notes turn on Seed 2.0 Lite
 * (calibrated shape; re-measure after cutover).
 */
export const TEXT_BASE_INPUT_TOKENS = 2_000;
export const TEXT_BASE_OUTPUT_TOKENS = 600;

/** Approximate multimodal input tokens added per reference. */
export const TEXT_IMAGE_REF_INPUT_TOKENS = 1_200;
export const TEXT_VIDEO_REF_INPUT_TOKENS = 10_000;
export const TEXT_AUDIO_REF_INPUT_TOKENS = 5_000;

/**
 * Text / Assistance floor + step: TT$0.01 (0.02 credits at TT$0.50 each).
 * Customer charge = 2× Seed Lite provider COGS, rounded up to this cent.
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

function isSquareAspectRatio(_aspectRatio: string | undefined): boolean {
  void _aspectRatio;
  return false;
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
  void args.quality;
  void args.aspectRatio;
  return SEEDREAM_USD_BY_TIER[tier];
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
    videoModel === "seedance-2.0"
      ? SEEDANCE_20_MAX_DURATION_SECONDS
      : SEEDANCE_25_MAX_DURATION_SECONDS;
  return Math.max(4, Math.min(max, Math.ceil(Number(durationSeconds) || 4)));
}

/** @deprecated Prefer videoDurationSeconds — blocks remain for callers that still ceil by 5s. */
export function videoDurationBlocks(durationSeconds?: number): number {
  return Math.ceil(videoDurationSeconds(durationSeconds) / 5);
}

export function normalizeVideoResolutionKey(
  resolution: string | undefined,
): "854x480" | "1280x720" | "1920x1080" | "3840x2160" {
  const raw = (resolution ?? "1280x720").toLowerCase().replace(/×/g, "x");
  if (
    raw === "3840x2160" ||
    raw === "2160x3840" ||
    raw === "4k" ||
    raw === "2160p" ||
    raw.includes("3840") ||
    raw.includes("2160")
  ) {
    return "3840x2160";
  }
  if (
    raw === "854x480" ||
    raw === "864x480" ||
    raw === "480p" ||
    raw === "480" ||
    (raw.includes("480") && !raw.includes("1480"))
  ) {
    return "854x480";
  }
  if (raw === "1920x1080" || raw === "1080p" || raw.includes("1080")) {
    return "1920x1080";
  }
  return "1280x720";
}

function seedance20UsdPerMTokens(
  resolutionKey: ReturnType<typeof normalizeVideoResolutionKey>,
): number {
  if (resolutionKey === "1920x1080") return SEEDANCE_20_USD_PER_M_TOKENS_1080P;
  if (resolutionKey === "3840x2160") return SEEDANCE_20_USD_PER_M_TOKENS_4K;
  return SEEDANCE_20_USD_PER_M_TOKENS_NO_VIDEO;
}

export function seedanceOutputTokens(args: {
  resolution?: string;
  durationSeconds?: number;
  videoModel?: VideoPricingModel;
}): number {
  let key = normalizeVideoResolutionKey(args.resolution);
  // Seedance 2.5 has no 1080p/4K tier — price/clamp as 720p.
  if (
    (args.videoModel === "seedance-2.5" || args.videoModel == null) &&
    (key === "1920x1080" || key === "3840x2160")
  ) {
    key = "1280x720";
  }
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
  const videoModel = args.videoModel ?? "seedance-2.5";
  // Seedance — same customer price with or without video refs (no-video rate).
  void args.hasVideoReferenceInput;
  void args.audioEnabled;
  const tokens = seedanceOutputTokens({
    resolution: args.resolution,
    durationSeconds: args.durationSeconds,
    videoModel,
  });
  let pricedKey = normalizeVideoResolutionKey(args.resolution);
  if (
    videoModel === "seedance-2.5" &&
    (pricedKey === "1920x1080" || pricedKey === "3840x2160")
  ) {
    pricedKey = "1280x720";
  }
  const usdPerM =
    videoModel === "seedance-2.0"
      ? seedance20UsdPerMTokens(pricedKey)
      : SEEDANCE_USD_PER_M_TOKENS_NO_VIDEO;
  return (tokens * usdPerM) / 1_000_000;
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
  videoModel: VideoPricingModel = "seedance-2.5",
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
  // Video refs keep the same customer price as no-ref (2.5 $10.70/M or 2.0 $7/M).
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

/** Provider USD for Gemini 3.5 Flash text tokens. */
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

/** Customer TT$ for script / Assistance / element text = 2× Gemini 3.5 Flash COGS, min / step TT$0.01. */
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
/** Eleven Music — USD per minute of output (COGS; sell is 2× via audioSellPriceTtd). */
export const ELEVEN_MUSIC_USD_PER_MINUTE = 0.15;
/** Default music length when duration is omitted (ads). */
export const ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS = 30;
/** Self-serve Music API billable range (3s–5min). */
export const ELEVEN_MUSIC_MIN_DURATION_SECONDS = 3;
export const ELEVEN_MUSIC_MAX_DURATION_SECONDS = 300;

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
      ? ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS
      : Math.max(
          ELEVEN_MUSIC_MIN_DURATION_SECONDS,
          Math.min(ELEVEN_MUSIC_MAX_DURATION_SECONDS, Number(durationSeconds)),
        );
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
