import { describe, expect, it } from "vitest";
import {
  CREDIT_PRICE_TTD,
  TEXT_MIN_SELL_TTD,
  textCreditsFromMeasuredUsage,
  textCreditCost,
  textSellPriceFromUsageTtd,
} from "./generationPricing";

describe("measured text usage pricing", () => {
  it("charges at least TT$0.01 for empty usage", () => {
    expect(textSellPriceFromUsageTtd({})).toBe(TEXT_MIN_SELL_TTD);
    expect(textCreditsFromMeasuredUsage({})).toBe(
      TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD,
    );
  });

  it("applies 2× provider COGS and rounds up to TT$0.01", () => {
    // 10k input @ $2.00/M + 2k output @ $12.00/M = $0.044 USD
    // ×10 FX ×2 markup = TT$0.88 exactly
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.88);
    expect(
      textCreditsFromMeasuredUsage({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(1.76);
  });

  it("rounds fractional TT$ up to the next cent", () => {
    // 1 input token → tiny USD → still floors at TT$0.01
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 1,
        outputTokens: 0,
      }),
    ).toBe(TEXT_MIN_SELL_TTD);

    // Enough tokens that 2× COGS is between cents
    // 100 input @ $2/M = $0.0002; 50 output @ $12/M = $0.0006; total $0.0008
    // ×10 ×2 = TT$0.016 → ceil to TT$0.02
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toBe(0.02);

    // 5_000 input + 500 output:
    // (5000*2 + 500*12)/1e6 = 0.016 USD → ×20 = TT$0.32 exact
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 5_000,
        outputTokens: 500,
      }),
    ).toBe(0.32);
  });

  it("textCreditCost prefers measured tokens over reference estimates", () => {
    const measured = textCreditCost({
      imageReferenceCount: 99,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(measured).toBe(1.76);
    expect(
      textCreditCost({
        imageReferenceCount: 99,
      }),
    ).toBeGreaterThan(measured);
  });
});
