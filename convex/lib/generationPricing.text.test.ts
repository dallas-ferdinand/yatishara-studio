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
    // 10k input @ $0.50/M + 2k output @ $3.00/M = $0.011 USD
    // ×10 FX ×2 markup = TT$0.22 exactly
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.22);
    expect(
      textCreditsFromMeasuredUsage({
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(0.44);
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
    // 100 input @ $0.50/M = $0.00005; 50 output @ $3/M = $0.00015; total $0.0002
    // ×10 ×2 = TT$0.004 → ceil to TT$0.01
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toBe(0.01);

    // 5_000 input + 500 output:
    // (5000*0.5 + 500*3)/1e6 = 0.004 USD → ×20 = TT$0.08 exact
    expect(
      textSellPriceFromUsageTtd({
        inputTokens: 5_000,
        outputTokens: 500,
      }),
    ).toBe(0.08);
  });

  it("textCreditCost prefers measured tokens over reference estimates", () => {
    const measured = textCreditCost({
      imageReferenceCount: 99,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(measured).toBe(0.44);
    expect(
      textCreditCost({
        imageReferenceCount: 99,
      }),
    ).toBeGreaterThan(measured);
  });
});
