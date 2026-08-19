import { describe, expect, it } from "vitest";
import {
  clampPlayheadToPreview,
  clampMsToPreview,
  filmEndCovered,
  movePreviewWindow,
  msAtClientX,
  playheadPercent,
  rangePercents,
  timeLabel,
} from "./valuePreviewTrim";

describe("valuePreviewTrim", () => {
  it("maps a click on the filmstrip to a time", () => {
    expect(msAtClientX(50, { left: 0, width: 100 }, 10_000)).toBe(5_000);
    expect(msAtClientX(-10, { left: 0, width: 100 }, 10_000)).toBe(0);
    expect(msAtClientX(200, { left: 0, width: 100 }, 10_000)).toBe(10_000);
  });

  it("keeps the preview window length when sliding it", () => {
    const slid = movePreviewWindow({
      durationMs: 120_000,
      startMs: 10_000,
      endMs: 40_000,
      deltaMs: 20_000,
    });
    expect(slid.previewEndMs - slid.previewStartMs).toBe(30_000);
    expect(slid.previewStartMs).toBe(30_000);
    const againstEdge = movePreviewWindow({
      durationMs: 120_000,
      startMs: 10_000,
      endMs: 40_000,
      deltaMs: -50_000,
    });
    expect(againstEdge.previewStartMs).toBe(0);
    expect(againstEdge.previewEndMs - againstEdge.previewStartMs).toBe(30_000);
  });

  it("labels times and playhead percent", () => {
    expect(timeLabel(17_000)).toBe("0:17");
    expect(timeLabel(47_000)).toBe("0:47");
    expect(playheadPercent(25_000, 100_000)).toBe(25);
    expect(rangePercents(17_000, 47_000, 100_000)).toEqual({
      startPct: 17,
      widthPct: 30,
    });
  });

  it("squares a filmstrip end once the handle covers the corner", () => {
    expect(filmEndCovered(0)).toBe(true);
    expect(filmEndCovered(6)).toBe(true);
    expect(filmEndCovered(16)).toBe(false);
  });

  it("keeps the playhead between the in and out handles", () => {
    expect(clampMsToPreview(0, 17_000, 47_000)).toBe(17_000);
    expect(clampMsToPreview(20_000, 17_000, 47_000)).toBe(20_000);
    expect(clampMsToPreview(90_000, 17_000, 47_000)).toBe(47_000);
  });

  it("stops playback at the free-preview end", () => {
    expect(clampPlayheadToPreview(46_980, 17_000, 47_000)).toBe("ended");
    expect(clampPlayheadToPreview(20_000, 17_000, 47_000)).toBe("ok");
  });
});
