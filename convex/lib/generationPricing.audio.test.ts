import { describe, expect, it } from "vitest";
import {
  audioCreditCost,
  audioSellPriceTtd,
  creditCostForGeneration,
  estimateSfxUsd,
  estimateVoiceoverUsd,
} from "./generationPricing";

describe("audio generation pricing (2× ElevenLabs COGS)", () => {
  it("estimates voiceover USD at $0.10 / 1K characters", () => {
    expect(estimateVoiceoverUsd(0)).toBe(0);
    expect(estimateVoiceoverUsd(1000)).toBeCloseTo(0.1, 8);
    expect(estimateVoiceoverUsd(500)).toBeCloseTo(0.05, 8);
  });

  it("estimates SFX USD at $0.12 / minute with 5s Auto default", () => {
    expect(estimateSfxUsd(undefined)).toBeCloseTo((5 / 60) * 0.12, 8);
    expect(estimateSfxUsd(null)).toBeCloseTo((5 / 60) * 0.12, 8);
    // API max is 30s — longer values clamp
    expect(estimateSfxUsd(60)).toBeCloseTo((30 / 60) * 0.12, 8);
    expect(estimateSfxUsd(30)).toBeCloseTo(0.06, 8);
  });

  it("bills voiceover at 2× COGS with half-TTD rounding into credits", () => {
    // 1K chars → $0.10 → ×10 FX ×2 = TT$2.00 → 4 credits
    expect(audioSellPriceTtd({ audioType: "voiceover", characterCount: 1000 })).toBe(2);
    expect(audioCreditCost({ audioType: "voiceover", characterCount: 1000 })).toBe(4);

    // Tiny prompt still charges at least 1 credit after half-TTD ceil
    expect(audioCreditCost({ audioType: "voiceover", characterCount: 1 })).toBeGreaterThanOrEqual(1);
  });

  it("bills SFX Auto duration and explicit seconds", () => {
    // 5s Auto → $0.01 → ×20 = TT$0.20 → ceil to TT$0.50 → 1 credit
    expect(audioCreditCost({ audioType: "sfx" })).toBe(1);
    // 30s max → $0.06 → ×20 = TT$1.20 → ceil to TT$1.50 → 3 credits
    expect(audioCreditCost({ audioType: "sfx", durationSeconds: 30 })).toBe(3);
  });

  it("routes audio tier through creditCostForGeneration", () => {
    expect(
      creditCostForGeneration({
        tier: "audio",
        audioType: "voiceover",
        characterCount: 1000,
      }),
    ).toBe(4);
    expect(
      creditCostForGeneration({
        tier: "audio",
        audioType: "sfx",
        durationSeconds: 5,
      }),
    ).toBe(1);
  });
});
