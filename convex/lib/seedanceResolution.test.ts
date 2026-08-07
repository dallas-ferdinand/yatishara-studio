import { describe, expect, it } from "vitest";
import {
  normalizeSeedanceAspectRatio,
  normalizeSeedanceResolution,
} from "./seedanceResolution";

describe("normalizeSeedanceResolution", () => {
  it("maps WxH and labels for Seedance 2.5 (default clamp)", () => {
    expect(normalizeSeedanceResolution("1280x720")).toBe("720p");
    expect(normalizeSeedanceResolution("1920x1080")).toBe("720p");
    expect(normalizeSeedanceResolution("720x1280")).toBe("720p");
    expect(normalizeSeedanceResolution("1080x1920")).toBe("720p");
  });

  it("keeps p-labels and clamps HD for 2.5", () => {
    expect(normalizeSeedanceResolution("720p")).toBe("720p");
    expect(normalizeSeedanceResolution("1080p")).toBe("720p");
    expect(normalizeSeedanceResolution("hd")).toBe("720p");
    expect(normalizeSeedanceResolution("fhd")).toBe("720p");
  });

  it("keeps 480p", () => {
    expect(normalizeSeedanceResolution("854x480")).toBe("480p");
    expect(normalizeSeedanceResolution("480p")).toBe("480p");
    expect(normalizeSeedanceResolution("480")).toBe("480p");
  });

  it("clamps image tiers and 4K to 720p on 2.5", () => {
    expect(normalizeSeedanceResolution("2K")).toBe("720p");
    expect(normalizeSeedanceResolution("1k")).toBe("720p");
    expect(normalizeSeedanceResolution("4K")).toBe("720p");
    expect(normalizeSeedanceResolution("3840x2160")).toBe("720p");
  });

  it("defaults unknown / empty to 720p", () => {
    expect(normalizeSeedanceResolution(undefined)).toBe("720p");
    expect(normalizeSeedanceResolution("")).toBe("720p");
    expect(normalizeSeedanceResolution("weird")).toBe("720p");
  });

  it("passes 1080p and 4k through for Seedance 2.0", () => {
    expect(normalizeSeedanceResolution("1920x1080", "seedance-2.0")).toBe("1080p");
    expect(normalizeSeedanceResolution("1080p", "bytedance/seedance-2.0")).toBe(
      "1080p",
    );
    expect(normalizeSeedanceResolution("3840x2160", "seedance-2.0")).toBe("4k");
    expect(normalizeSeedanceResolution("4k", "seedance-2.0")).toBe("4k");
    expect(normalizeSeedanceResolution("854x480", "seedance-2.0")).toBe("480p");
  });
});

describe("normalizeSeedanceAspectRatio", () => {
  it("keeps supported ratios and maps 4:5 to 3:4", () => {
    expect(normalizeSeedanceAspectRatio("16:9")).toBe("16:9");
    expect(normalizeSeedanceAspectRatio("4:5")).toBe("3:4");
  });
});
