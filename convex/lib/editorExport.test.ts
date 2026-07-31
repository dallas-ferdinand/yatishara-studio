import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_RESOLUTION,
  exportSizeForRatioAndResolution,
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
