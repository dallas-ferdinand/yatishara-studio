import { describe, expect, it } from "vitest";
import {
  CREDIT_PRICE_TTD,
  IMAGE_REFERENCE_SURCHARGE,
  SEEDREAM_USD_EXTRA_REFERENCE,
  TEXT_MIN_SELL_TTD,
  estimateImageModelUsd,
  imageCreditCost,
  roundTextSellTtd,
  textCreditsFromMeasuredUsage,
  textCreditCost,
  textSellPriceFromUsageTtd,
  videoCreditCost,
} from "./generationPricing";

describe("text sell rounding", () => {
  it("bumps sub-cent to 1 cent", () => {
    expect(roundTextSellTtd(0.008)).toBe(0.01);
    expect(roundTextSellTtd(0.001)).toBe(0.01);
  });

  it("rounds up to next nickel", () => {
    expect(roundTextSellTtd(0.04)).toBe(0.05);
    expect(roundTextSellTtd(0.08)).toBe(0.1);
    expect(roundTextSellTtd(0.11)).toBe(0.15);
    expect(roundTextSellTtd(0.46)).toBe(0.5);
  });

  it("keeps exact nickels", () => {
    expect(roundTextSellTtd(0.05)).toBe(0.05);
    expect(roundTextSellTtd(0.1)).toBe(0.1);
    expect(roundTextSellTtd(0.45)).toBe(0.45);
    expect(roundTextSellTtd(0.5)).toBe(0.5);
  });
});

describe("measured text usage pricing", () => {
  it("charges at least TT$0.01 for empty usage", () => {
    expect(textSellPriceFromUsageTtd({})).toBe(TEXT_MIN_SELL_TTD);
    expect(textCreditsFromMeasuredUsage({})).toBe(
      TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD,
    );
  });

  it("applies BytePlus COGS ×2 then nickel round-up", () => {
    // Turbo: 10k input @ $0.45/M + 2k output @ $2.25/M = $0.009 → TT$0.18 → $0.20
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.2);
    expect(
      textCreditsFromMeasuredUsage({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.4);
  });

  it("bills BytePlus cache-hit tokens at cache-read COGS (not full input)", () => {
    // Turbo: 10k cache-read @ $0.09/M + 2k out @ $2.25 = $0.0054 → TT$0.108 → $0.15
    expect(
      textSellPriceFromUsageTtd({
        cacheReadTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.15);
    // Same tokens as full input = TT$0.18 → $0.20
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.2);
    // 100k cache-hit @ $0.09/M = $0.009 → TT$0.18 → $0.20
    // vs 100k input @ $0.45/M = $0.045 → TT$0.90
    expect(textSellPriceFromUsageTtd({ cacheReadTokens: 100_000 })).toBe(0.2);
    expect(textSellPriceFromUsageTtd({ inputTokens: 100_000 })).toBe(0.9);
  });

  it("bills cache-write tokens as BytePlus storage (1h), not input rate", () => {
    // 1M write × $0.008333/M/h = $0.008333 → ×20 = TT$0.16666 → $0.20
    expect(
      textSellPriceFromUsageTtd({
        cacheWriteTokens: 1_000_000,
      }),
    ).toBe(0.2);
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 1_000_000,
      }),
    ).toBe(9);
  });

  it("derives non-cached input from promptTokens to prevent double-billing", () => {
    // prompt=500k, cache=400k → input=100k
    // Turbo: 100k@$0.45 + 400k@$0.09 = $0.081 → TT$1.62 → $1.65
    expect(
      textSellPriceFromUsageTtd({
        promptTokens: 500_000,
        inputTokens: 500_000,
        cacheReadTokens: 400_000,
      }),
    ).toBe(1.65);
  });

  it("bills optional Seed Mini list rates with nickel round-up", () => {
    // 10k @ $0.10/M + 2k @ $0.40/M = $0.0018 → TT$0.036 → $0.05
    expect(
      textSellPriceFromUsageTtd(
        { inputTokens: 10_000, outputTokens: 2_000 },
        "mini",
      ),
    ).toBe(0.05);
    expect(
      textCreditCost({
        inputTokens: 10_000,
        outputTokens: 2_000,
        textModel: "mini",
      }),
    ).toBe(0.1);
  });

  it("textCreditCost prefers measured tokens over reference estimates", () => {
    const measured = textCreditCost({
      imageReferenceCount: 99,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(measured).toBe(0.4);
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
    expect(withVideo).toBe(83);
  });
});
