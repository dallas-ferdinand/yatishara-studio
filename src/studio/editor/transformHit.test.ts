import { describe, expect, it } from "vitest";
import { hitTransformHandle } from "./transformHit";

const box = { left: 0.25, top: 0.4, width: 0.5, height: 0.08 };

describe("hitTransformHandle", () => {
  it("hits the rotate knob below a short text box", () => {
    const canvasW = 400;
    const canvasH = 400;
    const boxPxH = box.height * canvasH;
    const nx = box.left + box.width / 2;
    const ny = box.top + box.height + 26 / canvasH;
    expect(boxPxH).toBeLessThan(40);
    expect(hitTransformHandle(nx, ny, box, 0, canvasW, canvasH)).toBe("rotate");
  });

  it("does not treat a miss below the knob as empty-canvas when still near it", () => {
    const canvasW = 400;
    const canvasH = 400;
    const nx = box.left + box.width / 2;
    const ny = box.top + box.height + 52 / canvasH;
    expect(hitTransformHandle(nx, ny, box, 0, canvasW, canvasH)).toBeNull();
  });
});
