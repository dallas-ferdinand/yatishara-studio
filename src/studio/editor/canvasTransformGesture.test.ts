import { describe, expect, it } from "vitest";
import { CLIP_TRANSFORM_LIMITS } from "./clipTransform";
import {
  applyHandleDelta,
  cursorForHandle,
  pointerAngleDegrees,
  snapPictureTransform,
  transformMoved,
} from "./canvasTransformGesture";

const start = { scale: 1, x: 0, y: 0, rotation: 0 };
const box = { width: 0.5, height: 0.5 };

describe("applyHandleDelta", () => {
  it("pans on move", () => {
    const next = applyHandleDelta(
      "move",
      start,
      0.1,
      -0.2,
      box,
      0,
      CLIP_TRANSFORM_LIMITS,
    );
    expect(next).toEqual({ scale: 1, x: 0.1, y: -0.2, rotation: 0 });
  });

  it("rotates from the angle delta", () => {
    const next = applyHandleDelta(
      "rotate",
      start,
      0,
      0,
      box,
      45,
      CLIP_TRANSFORM_LIMITS,
    );
    expect(next.rotation).toBe(45);
  });

  it("grows from the east handle and recenters", () => {
    const next = applyHandleDelta(
      "se",
      start,
      0.25,
      0,
      box,
      0,
      CLIP_TRANSFORM_LIMITS,
    );
    expect(next.scale).toBe(1.5);
    expect(next.x).toBeCloseTo(0.125, 5);
    expect(next.y).toBeCloseTo(0.125, 5);
  });
});

describe("pointer helpers", () => {
  it("reports grab for rotate and move for the body", () => {
    expect(cursorForHandle("rotate", 0)).toBe("grab");
    expect(cursorForHandle("move", 0)).toBe("move");
    expect(cursorForHandle("nw", 0)).toBe("nwse-resize");
  });

  it("measures the pointer angle from the box center", () => {
    const rect = { left: 0.25, top: 0.25, width: 0.5, height: 0.5 };
    expect(pointerAngleDegrees(1, 0.5, rect, 100, 100)).toBe(0);
    expect(pointerAngleDegrees(0.5, 1, rect, 100, 100)).toBe(90);
  });

  it("snaps a near-center pan to the canvas midline", () => {
    const { transform, guides } = snapPictureTransform(
      { scale: 0.5, x: 0.02, y: 0, rotation: 0 },
      "move",
      100,
      100,
      100,
      100,
    );
    expect(transform.x).toBeCloseTo(0, 5);
    expect(guides.x).toBe(0.5);
  });

  it("treats a tiny pose change as unmoved so select does not commit", () => {
    expect(transformMoved(start, start)).toBe(false);
    expect(transformMoved({ ...start, x: 0.2 }, start)).toBe(true);
  });
});
