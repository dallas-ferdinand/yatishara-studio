import { describe, expect, it } from "vitest";
import { collectSnapTimes, resolveSecondaryDropStart, snapClipStart } from "./editorSnap";

const A = { startTime: 4, durationSec: 4 }; // 4–8

describe("resolveSecondaryDropStart", () => {
  it("keeps a free gap placement", () => {
    const result = resolveSecondaryDropStart({
      preferredStart: 10,
      durationSec: 2,
      others: [A],
    });
    expect(result.startTime).toBe(10);
    expect(result.sticky).toBeNull();
  });

  it("does not magnet when snap is off, even when close to an edge", () => {
    const result = resolveSecondaryDropStart({
      preferredStart: 8.05,
      durationSec: 2,
      others: [A],
      snapEnabled: false,
      snapTimes: [4, 8],
      thresholdSec: 0.2,
    });
    expect(result.startTime).toBeCloseTo(8.05, 5);
  });

  it("magnets to the layer start when close and snap is on", () => {
    const result = resolveSecondaryDropStart({
      preferredStart: 0.08,
      durationSec: 2,
      others: [A],
      snapEnabled: true,
      snapTimes: [0, 4, 8],
      thresholdSec: 0.2,
    });
    expect(result.startTime).toBe(0);
    expect(result.guide).toBe(0);
  });

  it("magnets to a nearby end when snap is on", () => {
    const result = resolveSecondaryDropStart({
      preferredStart: 8.05,
      durationSec: 2,
      others: [A],
      snapEnabled: true,
      snapTimes: [4, 8],
      thresholdSec: 0.2,
    });
    expect(result.startTime).toBe(8);
    expect(result.guide).toBe(8);
  });

  it("parks at a touch instead of overlapping — neighbor stays", () => {
    const result = resolveSecondaryDropStart({
      preferredStart: 5,
      durationSec: 2,
      others: [A],
    });
    expect(result.startTime).toBe(2);
    expect(result.sticky?.side).toBe("before");
  });

  it("stays pressed against the first touch while overlapping", () => {
    const first = resolveSecondaryDropStart({
      preferredStart: 4.2,
      durationSec: 2,
      others: [A],
    });
    expect(first.startTime).toBe(2);
    expect(first.sticky?.side).toBe("before");

    const stillBefore = resolveSecondaryDropStart({
      preferredStart: 7.5,
      durationSec: 2,
      others: [A],
      sticky: first.sticky,
    });
    expect(stillBefore.startTime).toBe(2);
    expect(stillBefore.sticky?.side).toBe("before");
  });

  it("places freely once the pointer is in a gap past the clip", () => {
    const first = resolveSecondaryDropStart({
      preferredStart: 4.2,
      durationSec: 2,
      others: [A],
    });
    const after = resolveSecondaryDropStart({
      preferredStart: 8.4,
      durationSec: 2,
      others: [A],
      sticky: first.sticky,
    });
    expect(after.startTime).toBeCloseTo(8.4, 5);
    expect(after.sticky).toBeNull();
  });
});

describe("collectSnapTimes", () => {
  const project = {
    name: "t",
    folderId: "f",
    duration: 30,
    tracks: [{ id: "track-v1", kind: "video", label: "V1" }],
    clips: [
      {
        id: "c1",
        assetId: "a1",
        trackId: "track-v1",
        startTime: 2,
        trimIn: 0,
        trimOut: 2,
        label: "c",
        kind: "video",
      },
    ],
  };

  it("includes timeline start on free layers", () => {
    const times = collectSnapTimes(project, "track-v2", "x", 1.5);
    expect(times[0]).toBe(0);
  });

  it("omits timeline start on the main line so drop preview does not magnet to 0", () => {
    const times = collectSnapTimes(project, "track-v1", "x", 1.5, {
      includeTimelineStart: false,
    });
    expect(times.includes(0)).toBe(false);
  });
});

describe("snapClipStart", () => {
  it("snaps the clip end to a target", () => {
    const result = snapClipStart(6.1, 2, [8], 0.2);
    expect(result.startTime).toBe(6);
    expect(result.guide).toBe(8);
  });
});
