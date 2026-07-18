import { describe, expect, it } from "vitest";
import {
  contentRectForTransform,
  ffmpegTransformFilter,
  normalizeClipTransform,
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

  it("preserves portrait media aspect inside a landscape canvas", () => {
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      720,
      1280,
    );
    expect(rect.height).toBeCloseTo(1);
    expect(rect.width).toBeCloseTo(0.31640625);
    expect(rect.left).toBeCloseTo((1 - rect.width) / 2);
  });

  it("emits ffmpeg contain+crop+pad filter with pan", () => {
    const filter = ffmpegTransformFilter(1280, 720, { scale: 2, x: 0.1, y: 0 });
    expect(filter).toContain("force_original_aspect_ratio=decrease");
    expect(filter).toContain("crop=");
    expect(filter).toContain("pad=1280:720:");
  });

  it("includes rotate in ffmpeg filter when rotation is set", () => {
    const filter = ffmpegTransformFilter(1280, 720, { rotation: 45 });
    expect(filter).toContain("rotate=");
  });
});
