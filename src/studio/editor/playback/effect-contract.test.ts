import { describe, expect, it } from "vitest";
import {
  EDITOR_TRANSITION_SPECS,
  ffmpegTransitionFor,
  transitionShaderIdFor,
} from "../../../../convex/lib/editorEffectContract";
import type { TransitionType } from "../types";

/** Must match the inlined map in compositor.worker.ts (Turbopack single-chunk). */
const WORKER_TRANSITION_SHADER_IDS = {
  none: 0,
  crossfade: 1,
  dipToBlack: 2,
  dipToWhite: 3,
  wipeLeft: 4,
  wipeRight: 5,
  wipeUp: 6,
  slideLeft: 7,
  zoomIn: 8,
  blur: 9,
} as const;

describe("preview/export transition contract", () => {
  it("defines every editor transition for both GPU preview and FFmpeg export", () => {
    const types: TransitionType[] = [
      "none",
      "crossfade",
      "dipToBlack",
      "dipToWhite",
      "wipeLeft",
      "wipeRight",
      "wipeUp",
      "slideLeft",
      "zoomIn",
      "blur",
    ];
    for (const type of types) {
      expect(EDITOR_TRANSITION_SPECS[type]).toBeDefined();
      expect(transitionShaderIdFor(type)).toBeTypeOf("number");
      expect(ffmpegTransitionFor(type)).toBeTypeOf("string");
      expect(transitionShaderIdFor(type)).toBe(WORKER_TRANSITION_SHADER_IDS[type]);
    }
  });

  it("normalizes unknown effects to crossfade", () => {
    expect(transitionShaderIdFor("unknown")).toBe(
      EDITOR_TRANSITION_SPECS.crossfade.shaderId,
    );
    expect(ffmpegTransitionFor("unknown")).toBe("fade");
  });
});
