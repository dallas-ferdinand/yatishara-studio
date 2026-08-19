import { describe, expect, it } from "vitest";
import { picturePaintedRect } from "./compositor-2d";

describe("picturePaintedRect", () => {
  it("letterboxes a portrait still the same way paint does", () => {
    const rect = picturePaintedRect(
      1280,
      720,
      720,
      1280,
      { scale: 1, x: 0, y: 0, rotation: 0 },
      "contain",
    );
    expect(rect.height).toBe(1);
    expect(rect.width).toBeCloseTo((720 / 1280) / (1280 / 720), 5);
    expect(rect.left + rect.width / 2).toBeCloseTo(0.5, 5);
    expect(rect.top).toBeCloseTo(0, 5);
  });

  it("cover-fills landscape video on a matching frame", () => {
    const rect = picturePaintedRect(
      1280,
      720,
      1920,
      1080,
      { scale: 1, x: 0, y: 0, rotation: 0 },
      "cover",
    );
    expect(rect.width).toBeCloseTo(1, 5);
    expect(rect.height).toBeCloseTo(1, 5);
  });
});
