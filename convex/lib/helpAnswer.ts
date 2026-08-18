/** Help Request / Help Answer product rules (pure; no Convex ctx). */

export const HELP_ANSWER_MIN_RECORDING_MS = 60_000;
export const HELP_ANSWER_MAX_RECORDING_MS = 2 * 60 * 60 * 1000;
export const HELP_ANSWER_MIN_PREVIEW_MS = 10_000;
export const HELP_ANSWER_MAX_PREVIEW_MS = 5 * 60 * 1000;
export const HELP_UNLOCK_HOUR_MS = 60 * 60 * 1000;
export const HELP_UNLOCK_UNDER_HOUR_CENTS = 500;
export const HELP_UNLOCK_OVER_HOUR_CENTS = 1000;
export const HELP_UNLOCK_FEE_RATE = 0.1;
export const POST_UNLOCK_UNDO_MS = 60_000;
export const PLATFORM_FEE_SINK_KEY = "studio_help_unlock";

export type PostKind = "post" | "help_request" | "help_answer";

export function normalizePostKind(value: string | undefined | null): PostKind {
  if (value === "help_request" || value === "help_answer") return value;
  return "post";
}

export function unlockPriceCentsForDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("Recording length is invalid");
  }
  return durationMs < HELP_UNLOCK_HOUR_MS
    ? HELP_UNLOCK_UNDER_HOUR_CENTS
    : HELP_UNLOCK_OVER_HOUR_CENTS;
}

export function creditsForCents(
  amountCents: number,
  creditPriceCents: number,
): number {
  const price = Number(creditPriceCents);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid credit price");
  }
  return amountCents / price;
}

export function splitUnlockCredits(amountCredits: number): {
  sellerCredits: number;
  feeCredits: number;
} {
  const feeCredits = amountCredits * HELP_UNLOCK_FEE_RATE;
  return {
    sellerCredits: amountCredits - feeCredits,
    feeCredits,
  };
}

export function clampHelpPreviewRange(args: {
  recordingDurationMs: number;
  previewStartMs: number;
  previewEndMs: number;
}): { previewStartMs: number; previewEndMs: number } {
  const duration = Math.max(0, args.recordingDurationMs);
  const minLen = HELP_ANSWER_MIN_PREVIEW_MS;
  const maxLen = Math.min(
    HELP_ANSWER_MAX_PREVIEW_MS,
    Math.max(minLen, duration - 1000),
  );
  let start = Number.isFinite(args.previewStartMs) ? args.previewStartMs : 0;
  let end = Number.isFinite(args.previewEndMs) ? args.previewEndMs : start + minLen;
  start = Math.max(0, start);
  end = Math.max(start, end);
  let len = end - start;
  if (len < minLen) len = minLen;
  if (len > maxLen) len = maxLen;
  if (start + len > duration) start = Math.max(0, duration - len);
  end = start + len;
  if (end > duration) {
    end = duration;
    start = Math.max(0, end - len);
  }
  return {
    previewStartMs: Math.round(start),
    previewEndMs: Math.round(end),
  };
}

export function validateHelpAnswerMedia(args: {
  recordingDurationMs: number;
  previewStartMs: number;
  previewEndMs: number;
}): void {
  const duration = args.recordingDurationMs;
  const start = args.previewStartMs;
  const end = args.previewEndMs;
  if (!Number.isFinite(duration) || duration < HELP_ANSWER_MIN_RECORDING_MS) {
    throw new Error("Screen recording must be at least 1 minute");
  }
  if (duration > HELP_ANSWER_MAX_RECORDING_MS) {
    throw new Error("Screen recording cannot be longer than 2 hours");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) {
    throw new Error("Pick a preview range");
  }
  if (end <= start) {
    throw new Error("Preview end must be after the start");
  }
  const previewMs = end - start;
  if (previewMs < HELP_ANSWER_MIN_PREVIEW_MS) {
    throw new Error("Preview must be at least 10 seconds");
  }
  if (previewMs > HELP_ANSWER_MAX_PREVIEW_MS) {
    throw new Error("Preview cannot be longer than 5 minutes");
  }
  if (end > duration + 250) {
    throw new Error("Preview must sit inside the recording");
  }
  if (duration <= previewMs) {
    throw new Error("Recording must be longer than the preview");
  }
}

export function unlockNeedMessage(amountCents: number): string {
  const needTtd = (amountCents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Not enough balance. Top up at least $${needTtd} TTD to unlock.`;
}
