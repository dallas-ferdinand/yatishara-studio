import { describe, expect, it } from "vitest";
import { transitionAudioGain } from "./audio-mixer";

describe("transition audio envelopes", () => {
  it("de-clicks abutting clips around the cut without hidden handles", () => {
    expect(transitionAudioGain("outgoing", 0)).toBe(1);
    expect(transitionAudioGain("outgoing", 0.25)).toBe(0.5);
    expect(transitionAudioGain("outgoing", 0.5)).toBe(0);
    expect(transitionAudioGain("incoming", 0.5)).toBe(0);
    expect(transitionAudioGain("incoming", 0.75)).toBe(0.5);
    expect(transitionAudioGain("incoming", 1)).toBe(1);
  });

  it("keeps non-transition audio at unity", () => {
    expect(transitionAudioGain("single", 0)).toBe(1);
    expect(transitionAudioGain("single", 1)).toBe(1);
  });
});
