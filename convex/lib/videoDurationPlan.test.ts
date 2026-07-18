import { describe, expect, it } from "vitest";
import {
  beatCountForDuration,
  clampVideoDurationSeconds,
  defaultBeatsForDuration,
  explicitVideoDurationSeconds,
  planVideoDuration,
} from "./videoDurationPlan";

describe("videoDurationPlan", () => {
  it("clamps duration to Seedance 4–15s", () => {
    expect(clampVideoDurationSeconds(2)).toBe(4);
    expect(clampVideoDurationSeconds(8)).toBe(8);
    expect(clampVideoDurationSeconds(20)).toBe(15);
    expect(clampVideoDurationSeconds(undefined)).toBe(8);
  });

  it("extracts the user's last valid explicit duration", () => {
    expect(explicitVideoDurationSeconds("Maybe make it 8 seconds.")).toBe(8);
    expect(explicitVideoDurationSeconds("Not 4 seconds — use a 10-second ad.")).toBe(10);
    expect(explicitVideoDurationSeconds("Use three quick shots.")).toBeUndefined();
    expect(explicitVideoDurationSeconds("Make it 30 seconds.")).toBeUndefined();
  });

  it("scales hypermotion beat count with length", () => {
    expect(beatCountForDuration(4, "hypermotion_ad").beatCount).toBe(3);
    expect(beatCountForDuration(8, "hypermotion_ad").beatCount).toBe(5);
    expect(beatCountForDuration(15, "hypermotion_ad").beatCount).toBe(7);
  });

  it("keeps standard clips sparse", () => {
    expect(beatCountForDuration(5, "standard").beatCount).toBe(1);
    expect(beatCountForDuration(8, "standard").beatCount).toBe(2);
    expect(beatCountForDuration(15, "standard").beatCount).toBe(3);
  });

  it("builds default beats that cover the full duration", () => {
    const beats = defaultBeatsForDuration(10, "Bottle", "hypermotion_ad");
    expect(beats.length).toBe(5);
    expect(beats[0]!.startSec).toBe(0);
    expect(beats.at(-1)!.endSec).toBe(10);
    expect(beats.every((beat) => beat.endSec > beat.startSec)).toBe(true);
  });

  it("writes length-aware agent guidance", () => {
    const short = planVideoDuration(5, "standard");
    expect(short.agentGuidance).toMatch(/5s/);
    expect(short.agentGuidance).toMatch(/ONE continuous moment/i);

    const longHyper = planVideoDuration(15, "hypermotion_ad");
    expect(longHyper.beatCount).toBe(7);
    expect(longHyper.agentGuidance).toMatch(/15s/);
    expect(longHyper.agentGuidance).toMatch(/7 timed beats/);
    expect(longHyper.agentGuidance).toMatch(/one-flow ramp/);
    expect(longHyper.agentGuidance).toMatch(/elliptical match cut/);
    expect(longHyper.agentGuidance).toMatch(/Vary velocity/);
    expect(longHyper.agentGuidance).toMatch(/1\.5–2s/);
  });
});
