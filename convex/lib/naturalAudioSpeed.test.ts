import { describe, expect, it } from "vitest";
import {
  buildAtempoChain,
  buildNaturalSpeedAudioFilters,
  buildSpeedSetptsFilter,
  clampClipSpeed,
  isIdentitySpeed,
} from "./naturalAudioSpeed";

describe("clampClipSpeed", () => {
  it("defaults and clamps", () => {
    expect(clampClipSpeed(undefined)).toBe(1);
    expect(clampClipSpeed(1.1)).toBeCloseTo(1.1);
    expect(clampClipSpeed(0.1)).toBe(0.5);
    expect(clampClipSpeed(5)).toBe(2);
  });
});

describe("buildAtempoChain", () => {
  it("uses one stage for 1.10", () => {
    expect(buildAtempoChain(1.1)).toEqual(["atempo=1.100000"]);
  });

  it("clamps above 2 in v1 (single stage at max)", () => {
    expect(buildAtempoChain(2.5)).toEqual(["atempo=2.000000"]);
  });
});

describe("buildNaturalSpeedAudioFilters", () => {
  it("skips at identity", () => {
    expect(buildNaturalSpeedAudioFilters(1)).toBe("");
    expect(isIdentitySpeed(1)).toBe(true);
  });

  it("matches the Audio Speedup 1.10 recipe", () => {
    expect(buildNaturalSpeedAudioFilters(1.1)).toBe(
      "atempo=1.100000,equalizer=f=3200:t=q:w=1.5:g=-1.5,equalizer=f=6000:t=q:w=2:g=-1,highpass=f=80",
    );
  });

  it("builds setpts for video", () => {
    expect(buildSpeedSetptsFilter(1)).toBe("");
    expect(buildSpeedSetptsFilter(1.1)).toBe("setpts=PTS/1.100000");
  });
});
