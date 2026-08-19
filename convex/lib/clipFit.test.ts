import { describe, expect, it } from "vitest";
import {
  contentRectForTransform,
  defaultFitModeForKind,
  ffmpegFitAspect,
  fittedNormalizedSize,
  resolveFitMode,
} from "./clipFit";

describe("clipFit", () => {
  it("defaults stills to contain and video to cover", () => {
    expect(defaultFitModeForKind("image")).toBe("contain");
    expect(defaultFitModeForKind("video")).toBe("cover");
    expect(resolveFitMode(undefined, "image")).toBe("contain");
    expect(resolveFitMode({ fitMode: "cover" }, "image")).toBe("cover");
    expect(resolveFitMode({ fitMode: "contain" }, "video")).toBe("contain");
    expect(ffmpegFitAspect("contain")).toBe("decrease");
    expect(ffmpegFitAspect("cover")).toBe("increase");
  });

  it("letterboxes a portrait still on a landscape canvas (contain)", () => {
    const size = fittedNormalizedSize(1280, 720, 720, 1280, "contain");
    expect(size.height).toBeCloseTo(1);
    expect(size.width).toBeCloseTo(720 / 1280 / (1280 / 720));
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0 },
      1280,
      720,
      720,
      1280,
      "contain",
    );
    expect(rect.height).toBeCloseTo(1);
    expect(rect.width).toBeLessThan(1);
    expect(rect.left).toBeGreaterThan(0);
    expect(rect.top).toBeCloseTo(0);
  });

  it("fills a landscape canvas with a portrait still (cover)", () => {
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0 },
      1280,
      720,
      720,
      1280,
      "cover",
    );
    expect(rect.width).toBeCloseTo(1);
    expect(rect.height).toBeGreaterThan(1);
    expect(rect.left).toBeCloseTo(0);
  });

  it("grows the same fitted quad when zooming", () => {
    const base = contentRectForTransform(
      { scale: 1, x: 0, y: 0 },
      1280,
      720,
      1920,
      1080,
      "cover",
    );
    const zoomed = contentRectForTransform(
      { scale: 2, x: 0, y: 0 },
      1280,
      720,
      1920,
      1080,
      "cover",
    );
    expect(zoomed.width).toBeCloseTo(base.width * 2);
    expect(zoomed.height).toBeCloseTo(base.height * 2);
  });
});
