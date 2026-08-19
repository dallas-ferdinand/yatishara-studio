import { describe, expect, it } from "vitest";
import {
  clampHelpPreviewRange,
  creditsForCents,
  splitUnlockCredits,
  unlockPriceCentsForDuration,
  validateHelpAnswerMedia,
} from "./helpAnswer";

describe("unlockPriceCentsForDuration", () => {
  it("is $5 TTD under 60:00 and $10 at or over 60:00", () => {
    expect(unlockPriceCentsForDuration(59_999)).toBe(500);
    expect(unlockPriceCentsForDuration(60_000)).toBe(500);
    expect(unlockPriceCentsForDuration(3_599_999)).toBe(500);
    expect(unlockPriceCentsForDuration(3_600_000)).toBe(1000);
  });
});

describe("splitUnlockCredits", () => {
  it("keeps 10% as the platform fee", () => {
    expect(splitUnlockCredits(10)).toEqual({ sellerCredits: 9, feeCredits: 1 });
    expect(splitUnlockCredits(20)).toEqual({ sellerCredits: 18, feeCredits: 2 });
  });
});

describe("creditsForCents", () => {
  it("maps $5 TTD to 10 credits at $0.50", () => {
    expect(creditsForCents(500, 50)).toBe(10);
    expect(creditsForCents(1000, 50)).toBe(20);
  });
});

describe("validateHelpAnswerMedia", () => {
  it("accepts a 90s take with a 20s mid-range preview", () => {
    expect(() =>
      validateHelpAnswerMedia({
        recordingDurationMs: 90_000,
        previewStartMs: 10_000,
        previewEndMs: 30_000,
      }),
    ).not.toThrow();
  });

  it("rejects a take under 1 minute", () => {
    expect(() =>
      validateHelpAnswerMedia({
        recordingDurationMs: 50_000,
        previewStartMs: 0,
        previewEndMs: 20_000,
      }),
    ).toThrow(/1 minute/);
  });

  it("rejects a preview as long as the recording", () => {
    expect(() =>
      validateHelpAnswerMedia({
        recordingDurationMs: 60_000,
        previewStartMs: 0,
        previewEndMs: 60_000,
      }),
    ).toThrow(/longer than the preview/);
  });
});

describe("clampHelpPreviewRange", () => {
  it("keeps a valid 20s window", () => {
    expect(
      clampHelpPreviewRange({
        recordingDurationMs: 90_000,
        previewStartMs: 10_000,
        previewEndMs: 30_000,
      }),
    ).toEqual({ previewStartMs: 10_000, previewEndMs: 30_000 });
  });

  it("widens a window under 10s", () => {
    expect(
      clampHelpPreviewRange({
        recordingDurationMs: 90_000,
        previewStartMs: 0,
        previewEndMs: 4_000,
      }),
    ).toEqual({ previewStartMs: 0, previewEndMs: 10_000 });
  });

  it("caps a window over 5 minutes", () => {
    const next = clampHelpPreviewRange({
      recordingDurationMs: 20 * 60 * 1000,
      previewStartMs: 0,
      previewEndMs: 12 * 60 * 1000,
    });
    expect(next.previewEndMs - next.previewStartMs).toBe(5 * 60 * 1000);
  });
});
