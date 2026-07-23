import { describe, expect, it } from "vitest";
import {
  audioFadeGainAtLocalTime,
  clampAudioFadePair,
  clampAudioFadeSec,
} from "./editorEffects";

describe("audioFadeGainAtLocalTime", () => {
  it("returns 1 when no fades are set", () => {
    expect(audioFadeGainAtLocalTime(undefined, 4, 1)).toBe(1);
    expect(audioFadeGainAtLocalTime({}, 4, 1)).toBe(1);
  });

  it("ramps fade-in from 0 to 1", () => {
    const effects = { fadeIn: 1 };
    expect(audioFadeGainAtLocalTime(effects, 4, 0)).toBeCloseTo(0);
    expect(audioFadeGainAtLocalTime(effects, 4, 0.5)).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(audioFadeGainAtLocalTime(effects, 4, 1)).toBeCloseTo(1);
    expect(audioFadeGainAtLocalTime(effects, 4, 2)).toBeCloseTo(1);
  });

  it("ramps fade-out from 1 to 0", () => {
    const effects = { fadeOut: 1 };
    expect(audioFadeGainAtLocalTime(effects, 4, 2)).toBeCloseTo(1);
    expect(audioFadeGainAtLocalTime(effects, 4, 3)).toBeCloseTo(1);
    expect(audioFadeGainAtLocalTime(effects, 4, 3.5)).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(audioFadeGainAtLocalTime(effects, 4, 4)).toBeCloseTo(0);
  });

  it("does not multiply overlapping fades — pair is clamped first", () => {
    const effects = { fadeIn: 3, fadeOut: 3 };
    // Clamped to 2s + 2s on a 4s clip; midpoint is the junction at full level.
    expect(audioFadeGainAtLocalTime(effects, 4, 2)).toBeCloseTo(1);
  });

  it("rises faster than linear in the early part of a fade", () => {
    const effects = { fadeIn: 1 };
    const early = audioFadeGainAtLocalTime(effects, 4, 0.25);
    expect(early).toBeGreaterThan(0.25);
    expect(early).toBeLessThan(1);
  });
});

describe("clampAudioFadeSec", () => {
  it("clamps to clip duration and floors negatives", () => {
    expect(clampAudioFadeSec(-1, 4)).toBe(0);
    expect(clampAudioFadeSec(0, 4)).toBe(0);
    expect(clampAudioFadeSec(2, 4)).toBe(2);
    expect(clampAudioFadeSec(10, 4)).toBe(4);
  });

  it("reserves space so fades cannot pass each other", () => {
    expect(clampAudioFadeSec(3, 4, 2)).toBeCloseTo(2);
    expect(clampAudioFadeSec(10, 4, 1.5)).toBeCloseTo(2.5);
    expect(clampAudioFadeSec(1, 4, 3.5)).toBeCloseTo(0.5);
  });
});

describe("clampAudioFadePair", () => {
  it("leaves non-overlapping pairs alone", () => {
    expect(clampAudioFadePair(1, 1, 4)).toEqual({ fadeIn: 1, fadeOut: 1 });
  });

  it("scales overlapping pairs to fit the clip", () => {
    expect(clampAudioFadePair(3, 3, 4)).toEqual({ fadeIn: 2, fadeOut: 2 });
  });
});
