import { describe, expect, it } from "vitest";
import {
  isImageResolutionTier,
  isVideoResolutionValue,
  normalizeSeedanceAspectRatio,
  normalizeSeedanceResolution,
} from "./seedanceResolution";

describe("normalizeSeedanceResolution", () => {
  it("maps Studio WxH values to Seedance p-labels", () => {
    expect(normalizeSeedanceResolution("1280x720")).toBe("720p");
    expect(normalizeSeedanceResolution("1920x1080")).toBe("1080p");
    expect(normalizeSeedanceResolution("720x1280")).toBe("720p");
    expect(normalizeSeedanceResolution("1080x1920")).toBe("1080p");
  });

  it("accepts p-labels and aliases", () => {
    expect(normalizeSeedanceResolution("720p")).toBe("720p");
    expect(normalizeSeedanceResolution("1080p")).toBe("1080p");
    expect(normalizeSeedanceResolution("hd")).toBe("720p");
    expect(normalizeSeedanceResolution("fhd")).toBe("1080p");
  });

  it("upgrades draft 480p to 720p (gateway rejects 480p on seedance-2.0)", () => {
    expect(normalizeSeedanceResolution("854x480")).toBe("720p");
    expect(normalizeSeedanceResolution("480p")).toBe("720p");
    expect(normalizeSeedanceResolution("480")).toBe("720p");
  });

  it("never forwards image tiers as pixel sizes", () => {
    expect(normalizeSeedanceResolution("2K")).toBe("720p");
    expect(normalizeSeedanceResolution("1k")).toBe("720p");
    expect(normalizeSeedanceResolution("4K")).toBe("720p");
  });

  it("defaults empty/unknown to 720p", () => {
    expect(normalizeSeedanceResolution(undefined)).toBe("720p");
    expect(normalizeSeedanceResolution("")).toBe("720p");
    expect(normalizeSeedanceResolution("weird")).toBe("720p");
  });
});

describe("resolution tier helpers", () => {
  it("detects image vs video resolution shapes", () => {
    expect(isImageResolutionTier("2K")).toBe(true);
    expect(isImageResolutionTier("1280x720")).toBe(false);
    expect(isVideoResolutionValue("1280x720")).toBe(true);
    expect(isVideoResolutionValue("720p")).toBe(true);
    expect(isVideoResolutionValue("2K")).toBe(false);
  });
});

describe("normalizeSeedanceAspectRatio", () => {
  it("keeps Seedance-supported ratios", () => {
    expect(normalizeSeedanceAspectRatio("9:16")).toBe("9:16");
    expect(normalizeSeedanceAspectRatio("16:9")).toBe("16:9");
    expect(normalizeSeedanceAspectRatio("21:9")).toBe("21:9");
  });

  it("maps unsupported social 4:5 to 3:4", () => {
    expect(normalizeSeedanceAspectRatio("4:5")).toBe("3:4");
  });
});
