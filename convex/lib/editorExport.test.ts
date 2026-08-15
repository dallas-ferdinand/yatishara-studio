import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_RESOLUTION,
  exportH264Args,
  exportSizeForRatioAndResolution,
  isHeavyExportFrame,
  normalizeExportResolution,
} from "./editorExport";

describe("exportSizeForRatioAndResolution", () => {
  it("defaults to 1080p", () => {
    expect(normalizeExportResolution(undefined)).toBe(DEFAULT_EXPORT_RESOLUTION);
    expect(exportSizeForRatioAndResolution("16:9")).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("scales each frame ratio", () => {
    expect(exportSizeForRatioAndResolution("16:9", "720p")).toEqual({
      width: 1280,
      height: 720,
    });
    expect(exportSizeForRatioAndResolution("9:16", "4K")).toEqual({
      width: 2160,
      height: 3840,
    });
    expect(exportSizeForRatioAndResolution("1:1", "1080p")).toEqual({
      width: 1080,
      height: 1080,
    });
  });
});

describe("exportH264Args", () => {
  it("uses level 5.2 and a lighter preset at 4K", () => {
    expect(isHeavyExportFrame(3840, 2160)).toBe(true);
    expect(isHeavyExportFrame(2160, 3840)).toBe(true);
    expect(isHeavyExportFrame(2160, 2160)).toBe(true);
    expect(isHeavyExportFrame(1920, 1080)).toBe(false);
    const args = exportH264Args(3840, 2160);
    expect(args).toContain("veryfast");
    expect(args).toEqual(expect.arrayContaining(["-level", "5.2"]));
    expect(args).toEqual(expect.arrayContaining(["-threads", "2"]));
    expect(exportH264Args(1920, 1080)).toEqual(
      expect.arrayContaining(["-preset", "fast", "-level", "4.1"]),
    );
  });
});
