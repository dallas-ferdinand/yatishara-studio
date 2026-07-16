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
      validateVideoModelCapabilities("seedance-2.0", {
        durationSeconds: 15,
        surface: "studio",
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

  it("advertises duration capabilities to API clients", () => {
    const omni = listVideoModelsForMcp().find(
      (model) => model.slug === "google-omni-flash",
    );
    expect(omni?.maxDurationSeconds).toBe(10);
  });
});

describe("billingTierForMode", () => {
  it("derives billing authority from mode", () => {
    expect(billingTierForMode("image")).toBe("image");
    expect(billingTierForMode("video")).toBe("pro_video");
  });
});
