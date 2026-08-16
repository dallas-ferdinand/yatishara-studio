import { describe, expect, it } from "vitest";
import {
  DEFAULT_PPS,
  MAX_PPS,
  MIN_PPS,
  clampTimelinePps,
  stepTimelineZoom,
} from "./types";

describe("timeline zoom pps", () => {
  it("allows zooming out far below the old 24 pps floor", () => {
    expect(MIN_PPS).toBe(2);
    expect(clampTimelinePps(1)).toBe(2);
    expect(clampTimelinePps(24)).toBe(24);
    expect(clampTimelinePps(99999)).toBe(MAX_PPS);
  });

  it("keeps stepping out at low pps instead of stalling on Math.round", () => {
    let pps = 8;
    for (let i = 0; i < 20; i += 1) {
      const next = stepTimelineZoom(pps, 0.9);
      expect(next).toBeLessThan(pps);
      pps = next;
      if (pps <= MIN_PPS) break;
    }
    expect(pps).toBe(MIN_PPS);
    expect(stepTimelineZoom(MIN_PPS, 0.9)).toBe(MIN_PPS);
  });

  it("steps in from the floor and respects max", () => {
    expect(stepTimelineZoom(MIN_PPS, 1.12)).toBeGreaterThan(MIN_PPS);
    expect(stepTimelineZoom(MAX_PPS, 1.12)).toBe(MAX_PPS);
    expect(stepTimelineZoom(DEFAULT_PPS, 1)).toBe(DEFAULT_PPS);
  });
});
