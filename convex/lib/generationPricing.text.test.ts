import { describe, expect, it } from "vitest";
import {
  CREDIT_PRICE_TTD,
  IMAGE_REFERENCE_SURCHARGE,
  SEEDREAM_USD_EXTRA_REFERENCE,
  TEXT_MIN_SELL_TTD,
  estimateImageModelUsd,
  imageCreditCost,
  textCreditsFromMeasuredUsage,
  textCreditCost,
  textSellPriceFromUsageTtd,
  videoCreditCost,
} from "./generationPricing";

describe("measured text usage pricing", () => {
  it("charges at least TT$0.50 (1 credit) for empty usage", () => {
    expect(textSellPriceFromUsageTtd({})).toBe(TEXT_MIN_SELL_TTD);
    expect(textCreditsFromMeasuredUsage({})).toBe(1);
  });

  it("applies BytePlus COGS ×2 then rounds up to TT$0.50", () => {
    // 10k input @ $0.50/M + 2k output @ $3.00/M = $0.011 USD
    // ×10 FX ×2 markup = TT$0.22 → round up to TT$0.50
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.5);
    expect(
      textCreditsFromMeasuredUsage({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(1);
  });

  it("bills BytePlus cache-hit tokens at cache-read COGS (not full input)", () => {
    // 10k cache-read @ $0.10/M + 2k output @ $3.00/M = $0.007 → TT$0.14 → $0.50
    expect(
      textSellPriceFromUsageTtd({
        cacheReadTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.5);
    // Same tokens as full input = TT$0.22 → also $0.50 at this size
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.5);
    // Larger: 100k cache-hit @ $0.10/M = $0.01 → TT$0.20 → $0.50
    // vs 100k input @ $0.50/M = $0.05 → TT$1.00
    expect(
      textSellPriceFromUsageTtd({ cacheReadTokens: 100_000 }),
    ).toBe(0.5);
    expect(textSellPriceFromUsageTtd({ inputTokens: 100_000 })).toBe(1);
  });

  it("bills cache-write tokens as BytePlus storage (1h), not input rate", () => {
    // 1M write × $0.008333/M/h × 1h = $0.008333 → ×20 = TT$0.166 → round up $0.50
    expect(
      textSellPriceFromUsageTtd({
        cacheWriteTokens: 1_000_000,
      }),
    ).toBe(0.5);
    // Must NOT charge as input ($0.50/M → TT$10)
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 1_000_000,
      }),
    ).toBe(10);
  });

  it("derives non-cached input from promptTokens to prevent double-billing", () => {
    // prompt=12k, cacheHit=10k → $0.002 → TT$0.04 → round up $0.50
    // If wrongly billed as 12k input: $0.006 → TT$0.12 → also $0.50 at this size
    // Use bigger numbers: prompt=500k, cache=400k → input=100k
    // Correct: 100k@$0.50 + 400k@$0.10 = $0.05+$0.04=$0.09 → TT$1.80 → $2.00
    // Wrong double-count input=500k: $0.25 → TT$5.00
    expect(
      textSellPriceFromUsageTtd({
        promptTokens: 500_000,
        inputTokens: 500_000,
        cacheReadTokens: 400_000,
      }),
    ).toBe(2);
  });

  it("bills DM Improve at Seed Mini list rates with half-TTD round-up", () => {
    // 10k @ $0.10/M + 2k @ $0.40/M = $0.0018 → ×20 = TT$0.036 → $0.50
    expect(
      textSellPriceFromUsageTtd(
        { inputTokens: 10_000, outputTokens: 2_000 },
        "mini",
      ),
    ).toBe(0.5);
    expect(
      textCreditCost({
        inputTokens: 10_000,
        outputTokens: 2_000,
        textModel: "mini",
      }),
    ).toBe(1);
  });

  it("rounds fractional TT$ up to the next half dollar", () => {
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 1,
        outputTokens: 0,
      }),
    ).toBe(TEXT_MIN_SELL_TTD);

    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toBe(0.5);

    // 50k in @0.5 + 5k out @3 = $0.025+$0.015=$0.04 → TT$0.80 → $1.00
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 50_000,
        outputTokens: 5_000,
      }),
    ).toBe(1);
  });

  it("textCreditCost prefers measured tokens over reference estimates", () => {
    const measured = textCreditCost({
      imageReferenceCount: 99,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(measured).toBe(1);
    expect(
      textCreditCost({
        imageReferenceCount: 99,
      }),
    ).toBeGreaterThan(measured);
  });
});

describe("Seedream exact BytePlus image pricing", () => {
  it("uses $0.045 / $0.09 with first ref free and $0.003 extras", () => {
    expect(estimateImageModelUsd({ resolution: "1K" })).toBe(0.045);
    expect(estimateImageModelUsd({ resolution: "2K" })).toBe(0.09);
    expect(estimateImageModelUsd({ resolution: "4K" })).toBe(0.09);
    expect(
      estimateImageModelUsd({ resolution: "2K", referenceImageCount: 1 }),
    ).toBe(0.09);
    expect(
      estimateImageModelUsd({ resolution: "2K", referenceImageCount: 3 }),
    ).toBe(0.09 + 2 * SEEDREAM_USD_EXTRA_REFERENCE);
    expect(IMAGE_REFERENCE_SURCHARGE).toBe(1);
  });

  it("charges 2 / 4 credits for 1K / 2K with no refs", () => {
    expect(imageCreditCost({ resolution: "1K" })).toBe(2);
    expect(imageCreditCost({ resolution: "2K" })).toBe(4);
    // First ref free — still 4 credits at 2K
    expect(
      imageCreditCost({ resolution: "2K", referenceImageCount: 1 }),
    ).toBe(4);
  });
});

describe("Seedance with-video list rate", () => {
  it("uses cheaper $/M when a video reference is present", () => {
    const noVideo = videoCreditCost({
      resolution: "720p",
      durationSeconds: 15,
      videoModel: "seedance-2.5",
      hasVideoReferenceInput: false,
    });
    const withVideo = videoCreditCost({
      resolution: "720p",
      durationSeconds: 15,
      videoModel: "seedance-2.5",
      hasVideoReferenceInput: true,
    });
    expect(noVideo).toBe(139);
    expect(withVideo).toBeLessThan(noVideo);
    // $6.40/$10.70 of 139 ≈ 83.1 → round 83
    expect(withVideo).toBe(83);
  });
});
