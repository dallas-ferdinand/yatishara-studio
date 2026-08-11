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
  it("charges at least TT$0.01 for empty usage", () => {
    expect(textSellPriceFromUsageTtd({})).toBe(TEXT_MIN_SELL_TTD);
    expect(textCreditsFromMeasuredUsage({})).toBe(
      TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD,
    );
  });

  it("applies 2× Seed Lite COGS and rounds up to TT$0.01", () => {
    // 10k input @ $0.25/M + 2k output @ $2.00/M = $0.0065 USD
    // ×10 FX ×2 markup = TT$0.13 exactly
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.13);
    expect(
      textCreditsFromMeasuredUsage({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.26);
  });

  it("bills DM Improve at Seed Mini list rates", () => {
    // 10k @ $0.10/M + 2k @ $0.40/M = $0.0018 → ×20 = TT$0.036 → ceil 0.04
    expect(
      textSellPriceFromUsageTtd(
        { inputTokens: 10_000, outputTokens: 2_000 },
        "mini",
      ),
    ).toBe(0.04);
    expect(
      textCreditCost({
        inputTokens: 10_000,
        outputTokens: 2_000,
        textModel: "mini",
      }),
    ).toBe(0.08);
  });

  it("rounds fractional TT$ up to the next cent", () => {
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
    ).toBe(0.01);

    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 5_000,
        outputTokens: 500,
      }),
    ).toBe(0.05);
  });

  it("textCreditCost prefers measured tokens over reference estimates", () => {
    const measured = textCreditCost({
      imageReferenceCount: 99,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(measured).toBe(0.26);
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
