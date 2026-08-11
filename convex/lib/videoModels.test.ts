import { describe, expect, it } from "vitest";
import {
  billingTierForMode,
  listVideoModelsForMcp,
  validateVideoModelCapabilities,
} from "./videoModels";

describe("validateVideoModelCapabilities", () => {
  it("enforces each model's duration limit", () => {
    expect(
      validateVideoModelCapabilities("seedance-2.5", {
        durationSeconds: 30,
        surface: "studio",
      }).slug,
    ).toBe("seedance-2.5");

    expect(() =>
      validateVideoModelCapabilities("seedance-2.5", {
        durationSeconds: 31,
        surface: "studio",
      }),
    ).toThrow("between 4 and 30 seconds");

    expect(
      validateVideoModelCapabilities("seedance-2.0", {
        durationSeconds: 15,
        surface: "api",
      }).slug,
    ).toBe("seedance-2.0");
  });

  it("rejects retired Kling / Omni models", () => {
    expect(() =>
      validateVideoModelCapabilities("kling-3.0-i2v", {
        durationSeconds: 5,
        surface: "api",
      }),
    ).toThrow("no longer available");

    expect(() =>
      validateVideoModelCapabilities("google-omni-flash", {
        durationSeconds: 5,
        surface: "studio",
      }),
    ).toThrow("no longer available");
  });

  it("allows Seedance 2.0 in Studio with 4K and rejects 4K on 2.5", () => {
    expect(
      validateVideoModelCapabilities("seedance-2.0", {
        durationSeconds: 8,
        resolution: "3840x2160",
        surface: "studio",
      }).slug,
    ).toBe("seedance-2.0");

    expect(() =>
      validateVideoModelCapabilities("seedance-2.5", {
        durationSeconds: 8,
        resolution: "3840x2160",
        surface: "studio",
      }),
    ).toThrow("does not support that resolution");
  });

  it("advertises duration and resolution capabilities to API clients", () => {
    const models = listVideoModelsForMcp();
    expect(models.map((m) => m.slug).sort()).toEqual([
      "seedance-2.0",
      "seedance-2.5",
    ]);
    const seedance20 = models.find((model) => model.slug === "seedance-2.0");
    expect(seedance20?.mcpOnly).toBe(false);
    expect(seedance20?.resolutions).toEqual(["480p", "720p", "1080p", "4k"]);
    const seedance25 = models.find((model) => model.slug === "seedance-2.5");
    expect(seedance25?.resolutions).toEqual(["480p", "720p"]);
    expect(seedance25?.maxDurationSeconds).toBe(30);
  });
});

describe("billingTierForMode", () => {
  it("derives billing authority from mode", () => {
    expect(billingTierForMode("image")).toBe("image");
    expect(billingTierForMode("video")).toBe("pro_video");
  });
});
