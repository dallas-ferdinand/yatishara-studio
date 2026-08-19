import { describe, expect, it } from "vitest";
import {
  contentRectForTransform,
  ffmpegTransformFilter,
  normalizeClipTransform,
  overlaySourceSize,
} from "./clipTransform";

describe("clipTransform", () => {
  it("defaults and clamps transform fields", () => {
    expect(normalizeClipTransform(undefined)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    });
    expect(normalizeClipTransform({ scale: 99, x: -9, y: 9, rotation: 370 })).toEqual({
      scale: 4,
      x: -1.5,
      y: 1.5,
      rotation: 10,
    });
    expect(normalizeClipTransform({ scale: 0 }).scale).toBe(0);
  });

  it("grows the content rect when zooming in", () => {
    const base = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      1920,
      1080,
    );
    const zoomed = contentRectForTransform(
      { scale: 2, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      1920,
      1080,
    );
    expect(zoomed.width).toBeCloseTo(base.width * 2);
    expect(zoomed.height).toBeCloseTo(base.height * 2);
  });

  it("uses decoded then media size and never falls back to the canvas", () => {
    expect(
      overlaySourceSize({ width: 720, height: 1280 }, { width: 1920, height: 1080 }),
    ).toEqual({ width: 720, height: 1280 });
    expect(overlaySourceSize(null, { width: 1080, height: 1920 })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(overlaySourceSize(undefined, { width: 0, height: 0 })).toBeNull();
    expect(overlaySourceSize({ width: 1, height: 1 }, undefined)).toBeNull();
  });

  it("fills a landscape canvas with a portrait still (cover)", () => {
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      720,
      1280,
      "cover",
    );
    expect(rect.width).toBeCloseTo(1);
    expect(rect.height).toBeCloseTo(1280 / 720 / (720 / 1280));
    expect(rect.left).toBeCloseTo(0);
  });

  it("letterboxes a portrait still on a landscape canvas (contain)", () => {
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      720,
      1280,
      "contain",
    );
    expect(rect.height).toBeCloseTo(1);
    expect(rect.width).toBeLessThan(1);
    expect(rect.left).toBeGreaterThan(0);
  });

  it("emits ffmpeg cover+crop filter with pan", () => {
    const filter = ffmpegTransformFilter(1280, 720, { scale: 2, x: 0.1, y: 0 });
    expect(filter).toContain("force_original_aspect_ratio=increase");
    expect(filter).toContain("crop=");
    expect(filter).toContain("pad=1280:720:");
  });

  it("emits ffmpeg contain+pad for stills", () => {
    const filter = ffmpegTransformFilter(1280, 720, { scale: 1 }, "image");
    expect(filter).toContain("force_original_aspect_ratio=decrease");
  });

  it("includes rotate in ffmpeg filter when rotation is set", () => {
    const filter = ffmpegTransformFilter(1280, 720, { rotation: 45 });
    expect(filter).toContain("rotate=");
  });
});
