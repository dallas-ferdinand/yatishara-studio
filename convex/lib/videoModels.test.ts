import { describe, expect, it } from "vitest";
import {
  billingTierForMode,
  listVideoModelsForMcp,
  validateVideoModelCapabilities,
} from "./videoModels";

describe("validateVideoModelCapabilities", () => {
  it("enforces each model's duration limit", () => {
    expect(() =>
      validateVideoModelCapabilities("google-omni-flash", {
        durationSeconds: 11,
        surface: "api",
      }),
    ).toThrow("between 4 and 10 seconds");

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

  it("requires Kling's start frame", () => {
    expect(() =>
      validateVideoModelCapabilities("kling-3.0-i2v", {
        durationSeconds: 5,
        surface: "api",
      }),
    ).toThrow("requires a start frame");
  });

  it("rejects Kling multimodal refs but permits its start frame", () => {
    expect(
      validateVideoModelCapabilities("kling-3.0-i2v", {
        durationSeconds: 5,
        hasStartFrame: true,
        surface: "api",
      }).slug,
    ).toBe("kling-3.0-i2v");

    expect(() =>
      validateVideoModelCapabilities("kling-3.0-i2v", {
        durationSeconds: 5,
        hasStartFrame: true,
        referenceKinds: ["image", "audio"],
        surface: "api",
      }),
    ).toThrow("does not support multimodal references (image, audio)");
  });

  it("keeps API-only models out of the Studio surface", () => {
    expect(() =>
      validateVideoModelCapabilities("google-omni-flash", {
        durationSeconds: 5,
        surface: "studio",
      }),
    ).toThrow("not available in Studio");
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
    const omni = models.find((model) => model.slug === "google-omni-flash");
    expect(omni?.maxDurationSeconds).toBe(10);
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
