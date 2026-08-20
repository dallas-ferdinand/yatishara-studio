import { describe, expect, it } from "vitest";
import {
  addScene,
  addSourceToMixer,
  applyHandle,
  compositorZoom,
  DEFAULT_FRAME_RATIO,
  DEFAULT_SCENE_ICON,
  defaultRectForKind,
  emptyMixerState,
  hitMixerSource,
  isAudioOnlyKind,
  LIVE_DIGITAL_ZOOM_MAX,
  liveCanvasSize,
  liveRectRatioKind,
  mediaAspectFromSize,
  nearLiveEdgeSides,
  nudgeLiveRect,
  liveRectCanvasGaps,
  patchScene,
  patchSource,
  removeScene,
  removeSourceFromMixer,
  reorderDisplayedSources,
  applyShapeToSource,
  scaleLiveRect,
  snapLiveRect,
} from "./liveMixerModel";

describe("liveMixerModel", () => {
  it("puts the first camera full-frame and later phones in the corner", () => {
    expect(defaultRectForKind("camera", 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(defaultRectForKind("phone", 0).w).toBeLessThan(0.5);
  });

  it("adds a source onto the active scene and can remove it", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    expect(state.sources).toHaveLength(1);
    expect(state.scenes[0]?.sourceIds).toHaveLength(1);
    const id = state.sources[0]!.id;
    state = removeSourceFromMixer(state, id);
    expect(state.sources).toHaveLength(0);
    expect(state.scenes[0]?.sourceIds).toHaveLength(0);
  });

  it("keeps sources on the scene they were added to", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "screen", name: "Desk" });
    state = addScene(state);
    state = addSourceToMixer(state, { kind: "camera", name: "Face" });
    expect(state.scenes[0]?.sourceIds).toHaveLength(1);
    expect(state.scenes[1]?.sourceIds).toHaveLength(1);
  });

  it("resizes from the south-east handle", () => {
    const next = applyHandle({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, "se", 0.1, 0.05);
    expect(next.w).toBeCloseTo(0.5);
    expect(next.h).toBeCloseTo(0.45);
    expect(next.x).toBeCloseTo(0.1);
  });

  it("puts a new screen behind the camera and shrinks a full camera to a corner", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const camId = state.sources[0]!.id;
    state = addSourceToMixer(state, { kind: "screen", name: "Desk" }, "back");
    expect(state.scenes[0]?.sourceIds[0]).not.toBe(camId);
    expect(state.scenes[0]?.sourceIds[1]).toBe(camId);
    const cam = state.sources.find((row) => row.id === camId);
    expect(cam?.rect.w).toBeLessThan(0.5);
  });

  it("puts a camera in the corner when a full screen is already there", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "screen", name: "Desk" }, "back");
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const cam = state.sources.find((row) => row.kind === "camera");
    expect(cam?.rect.w).toBeLessThan(0.5);
    expect(state.scenes[0]?.sourceIds.at(-1)).toBe(cam?.id);
  });

  it("reorders layers from the displayed top of the list", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "screen", name: "Desk" }, "back");
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const displayBefore = [...(state.scenes[0]?.sourceIds ?? [])].reverse();
    state = reorderDisplayedSources(state, 0, 1);
    const displayAfter = [...(state.scenes[0]?.sourceIds ?? [])].reverse();
    expect(displayAfter[0]).toBe(displayBefore[1]);
    expect(displayAfter[1]).toBe(displayBefore[0]);
  });

  it("hits the topmost source", () => {
    const cam = {
      id: "a",
      kind: "camera" as const,
      name: "Cam",
      visible: true,
      rect: { x: 0, y: 0, w: 1, h: 1 },
    };
    const phone = {
      id: "b",
      kind: "phone" as const,
      name: "Phone",
      visible: true,
      rect: { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
    };
    const hit = hitMixerSource([cam, phone], 0.8 * 1920, 0.8 * 1080, 1920, 1080);
    expect(hit?.sourceId).toBe("b");
  });

  it("starts camera sources unmuted at full volume", () => {
    const state = addSourceToMixer(emptyMixerState(), { kind: "camera", name: "Cam" });
    expect(state.sources[0]?.volume).toBe(1);
    expect(state.sources[0]?.muted).toBe(false);
  });

  it("applies a circle mask without changing the video frame", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 },
    });
    const id = state.sources[0]!.id;
    const before = state.sources[0]!.rect;
    state = applyShapeToSource(state, id, "circle");
    const cam = state.sources.find((row) => row.id === id);
    expect(cam?.shape).toBe("circle");
    expect(cam?.radius).toBe(0.5);
    expect(cam?.rect).toEqual(before);
    expect(cam?.maskRect).toBeTruthy();
    expect(cam!.maskRect!.w / cam!.maskRect!.h).toBeCloseTo(9 / 16, 2);
    expect(liveRectRatioKind(cam!.maskRect!, 16 / 9)).toBe("square");
  });

  it("hits only the mask window when the rest of the source is hidden", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    const id = state.sources[0]!.id;
    state = applyShapeToSource(state, id, "square");
    const mask = state.sources[0]!.maskRect!;
    const insideMaskX = (mask.x + mask.w / 2) * 1920;
    const insideMaskY = (mask.y + mask.h / 2) * 1080;
    const outsideMaskX = mask.x > 0.05 ? 0.02 * 1920 : 0.98 * 1920;
    const outsideMaskY = 0.02 * 1080;
    expect(
      hitMixerSource(state.sources, insideMaskX, insideMaskY, 1920, 1080, {
        canvasAspect: 16 / 9,
        hitMode: "visible",
      })?.sourceId,
    ).toBe(id);
    expect(
      hitMixerSource(state.sources, outsideMaskX, outsideMaskY, 1920, 1080, {
        canvasAspect: 16 / 9,
        hitMode: "visible",
      }),
    ).toBeNull();
  });

  it("lets a square mask resize freely after the preset", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0.05, y: 0.05, w: 0.8, h: 0.8 },
    });
    const id = state.sources[0]!.id;
    state = applyShapeToSource(state, id, "square");
    const video = state.sources[0]!.rect;
    state = patchSource(state, id, {
      maskRect: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
    });
    const cam = state.sources.find((row) => row.id === id);
    expect(cam?.shape).toBe("square");
    expect(cam?.rect).toEqual(video);
    expect(cam?.maskRect?.w).toBeCloseTo(0.4);
    expect(cam?.maskRect?.h).toBeCloseTo(0.2);
  });

  it("starts a rectangle mask as an inset window, not a square", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    const id = state.sources[0]!.id;
    const before = state.sources[0]!.rect;
    state = applyShapeToSource(state, id, "rectangle");
    const cam = state.sources.find((row) => row.id === id);
    expect(cam?.shape).toBe("rectangle");
    expect(cam?.rect).toEqual(before);
    expect(cam?.maskRect).toBeTruthy();
    expect(liveRectRatioKind(cam!.maskRect!, 16 / 9)).toBe("rectangle");
    expect(cam!.maskRect!.w).toBeLessThan(before.w);
    expect(cam!.maskRect!.h).toBeLessThan(before.h);
    state = patchSource(state, id, {
      maskRect: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 },
    });
    expect(state.sources[0]?.maskRect?.w).toBeCloseTo(0.5);
    expect(state.sources[0]?.maskRect?.h).toBeCloseTo(0.25);
  });

  it("fits a source to the video ratio once media aspect is known", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "phone",
      name: "Phone",
      rect: { x: 0.6, y: 0.6, w: 0.28, h: 0.28 },
    });
    const id = state.sources[0]!.id;
    state = patchSource(state, id, { mediaAspect: 9 / 16 });
    const phone = state.sources.find((row) => row.id === id);
    expect(phone!.rect.w / phone!.rect.h).toBeCloseTo((9 / 16) / (16 / 9), 2);
  });

  it("makes a full-frame portrait source a vertical strip on a 16:9 canvas", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const id = state.sources[0]!.id;
    expect(state.sources[0]!.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    state = patchSource(state, id, { mediaAspect: 9 / 16 });
    const cam = state.sources[0]!;
    expect(cam.rect.h).toBeCloseTo(1, 2);
    expect(cam.rect.w).toBeCloseTo((9 / 16) / (16 / 9), 2);
    expect(cam.rect.x + cam.rect.w / 2).toBeCloseTo(0.5, 2);
  });

  it("refits a 1×1 box even when the portrait ratio is already stored", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const id = state.sources[0]!.id;
    state = {
      ...state,
      sources: state.sources.map((row) =>
        row.id === id
          ? {
              ...row,
              mediaAspect: 9 / 16,
              rect: { x: 0, y: 0, w: 1, h: 1 },
            }
          : row,
      ),
    };
    state = patchSource(state, id, { mediaAspect: 9 / 16 });
    const cam = state.sources[0]!;
    expect(cam.rect.h).toBeCloseTo(1, 2);
    expect(cam.rect.w).toBeCloseTo((9 / 16) / (16 / 9), 2);
  });

  it("fits to native ratio when the mask is cleared to none", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const id = state.sources[0]!.id;
    state = {
      ...state,
      sources: state.sources.map((row) =>
        row.id === id
          ? {
              ...row,
              mediaAspect: 9 / 16,
              rect: { x: 0, y: 0, w: 1, h: 1 },
            }
          : row,
      ),
    };
    state = applyShapeToSource(state, id, "rectangle");
    expect(state.sources[0]!.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    state = applyShapeToSource(state, id, "none");
    const cam = state.sources[0]!;
    expect(cam.shape).toBe("none");
    expect(cam.rect.w).toBeCloseTo((9 / 16) / (16 / 9), 2);
    expect(cam.rect.h).toBeCloseTo(1, 2);
  });

  it("uses the real pixel ratio for phone and camera tracks", () => {
    expect(mediaAspectFromSize("phone", 1920, 1080)).toBeCloseTo(1920 / 1080);
    expect(mediaAspectFromSize("phone", 1080, 1920)).toBeCloseTo(1080 / 1920);
    expect(mediaAspectFromSize("camera", 1920, 1080)).toBeCloseTo(1920 / 1080);
  });

  it("refits the box when a stored camera ratio was wrong", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "phone",
      name: "Phone",
      rect: { x: 0.6, y: 0.4, w: 0.2, h: 0.4 },
    });
    const id = state.sources[0]!.id;
    state = patchSource(state, id, { mediaAspect: 9 / 16 });
    state = patchSource(state, id, { mediaAspect: 16 / 9 });
    const phone = state.sources.find((row) => row.id === id)!;
    expect(phone.mediaAspect).toBeCloseTo(16 / 9);
    expect(phone.rect.w / phone.rect.h).toBeCloseTo((16 / 9) / (16 / 9), 2);
  });

  it("keeps the mask inside the video when the video moves", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
    const id = state.sources[0]!.id;
    state = applyShapeToSource(state, id, "square");
    const mask = state.sources[0]!.maskRect!;
    state = patchSource(state, id, {
      rect: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    });
    const cam = state.sources[0]!;
    expect(cam.maskRect!.x).toBeCloseTo(mask.x + 0.1);
    expect(cam.maskRect!.y).toBeCloseTo(mask.y + 0.1);
  });

  it("adds a background behind the camera with a gradient fill", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const camId = state.sources[0]!.id;
    state = addSourceToMixer(state, { kind: "background", name: "BG" }, "back");
    expect(state.scenes[0]?.sourceIds[0]).not.toBe(camId);
    const bg = state.sources.find((row) => row.kind === "background");
    expect(bg?.fill?.mode).toBe("gradient");
  });

  it("gives new scenes a default icon and can change it", () => {
    let state = emptyMixerState();
    expect(state.scenes[0]?.icon).toBe(DEFAULT_SCENE_ICON);
    state = addScene(state);
    expect(state.scenes[1]?.icon).toBe(DEFAULT_SCENE_ICON);
    const id = state.scenes[1]!.id;
    state = patchScene(state, id, { icon: "camera" });
    expect(state.scenes[1]?.icon).toBe("camera");
  });

  it("removes a scene and sources that only lived on it", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, { kind: "camera", name: "Cam" });
    const firstScene = state.activeSceneId;
    const camId = state.sources[0]!.id;
    state = addScene(state);
    state = addSourceToMixer(state, { kind: "screen", name: "Desk" });
    const screenId = state.sources.find((row) => row.kind === "screen")!.id;
    state = removeScene(state, firstScene);
    expect(state.scenes).toHaveLength(1);
    expect(state.sources.map((row) => row.id)).toEqual([screenId]);
    expect(state.sources.some((row) => row.id === camId)).toBe(false);
  });

  it("keeps the last scene", () => {
    const start = emptyMixerState();
    const state = removeScene(start, start.activeSceneId);
    expect(state.scenes).toHaveLength(1);
  });

  it("stores a canvas ratio per scene", () => {
    let state = emptyMixerState();
    expect(state.scenes[0]?.frameRatio).toBe(DEFAULT_FRAME_RATIO);
    expect(liveCanvasSize("16:9")).toEqual(
      expect.objectContaining({ w: 1920, h: 1080 }),
    );
    expect(liveCanvasSize("9:16").h).toBeGreaterThan(liveCanvasSize("9:16").w);
    state = patchScene(state, state.activeSceneId, { frameRatio: "9:16" });
    expect(state.scenes[0]?.frameRatio).toBe("9:16");
  });

  it("keeps the camera's real ratio when the canvas turns vertical", () => {
    let state = emptyMixerState();
    state = addSourceToMixer(state, {
      kind: "camera",
      name: "Cam",
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    const id = state.sources[0]!.id;
    state = patchSource(state, id, { mediaAspect: 16 / 9 });
    state = patchScene(state, state.activeSceneId, { frameRatio: "9:16" });
    const cam = state.sources.find((row) => row.id === id)!;
    const ar = liveCanvasSize("9:16").ar;
    expect(cam.rect.w / cam.rect.h).toBeCloseTo((16 / 9) / ar, 2);
    expect(cam.rect.h).toBeLessThan(0.7);
    state = patchScene(state, state.activeSceneId, { frameRatio: "16:9" });
    const restored = state.sources.find((row) => row.id === id)!;
    expect(restored.rect.w).toBeCloseTo(1, 2);
    expect(restored.rect.h).toBeCloseTo(1, 2);
    state = patchScene(state, state.activeSceneId, { frameRatio: "9:16" });
    const again = state.sources.find((row) => row.id === id)!;
    expect(again.rect.w).toBeCloseTo(cam.rect.w, 2);
    expect(again.rect.h).toBeCloseTo(cam.rect.h, 2);
  });

  it("nudges a rect and reports canvas edge gaps", () => {
    const moved = nudgeLiveRect({ x: 0.2, y: 0.1, w: 0.3, h: 0.4 }, -0.05, 0.02);
    expect(moved.x).toBeCloseTo(0.15);
    expect(moved.y).toBeCloseTo(0.12);
    const gaps = liveRectCanvasGaps({ x: 0.04, y: 0.5, w: 0.2, h: 0.2 });
    expect(gaps.left).toBeCloseTo(0.04);
    expect(gaps.top).toBeCloseTo(0.5);
    expect(nearLiveEdgeSides(gaps)).toContain("left");
    expect(nearLiveEdgeSides(gaps)).not.toContain("top");
  });

  it("snaps a near-center move to the canvas midline", () => {
    const { rect, guides } = snapLiveRect(
      { x: 0.26, y: 0.1, w: 0.5, h: 0.3 },
      "move",
    );
    expect(rect.x + rect.w / 2).toBeCloseTo(0.5, 5);
    expect(guides.x).toBe(0.5);
  });

  it("snaps a corner to the canvas origin", () => {
    const { rect, guides } = snapLiveRect(
      { x: 0.02, y: 0.015, w: 0.3, h: 0.3 },
      "move",
    );
    expect(rect.x).toBeCloseTo(0, 5);
    expect(rect.y).toBeCloseTo(0, 5);
    expect(guides.x).toBe(0);
    expect(guides.y).toBe(0);
  });

  it("snaps the right edge to another source", () => {
    const { rect, guides } = snapLiveRect(
      { x: 0.4, y: 0.1, w: 0.31, h: 0.2 },
      "move",
      [{ x: 0, y: 0, w: 0.7, h: 1 }],
    );
    expect(rect.x + rect.w).toBeCloseTo(0.7, 5);
    expect(guides.x).toBeCloseTo(0.7);
  });

  it("does not snap a left edge to another source's center", () => {
    const { rect, guides } = snapLiveRect(
      { x: 0.48, y: 0.1, w: 0.2, h: 0.2 },
      "move",
      [{ x: 0, y: 0, w: 0.5, h: 1 }],
    );
    expect(rect.x).toBeCloseTo(0.48, 5);
    expect(guides.x).not.toBe(0.5);
  });

  it("scales a video from the center without stretching", () => {
    const start = { x: 0.2, y: 0.2, w: 0.6, h: 0.3 };
    const next = scaleLiveRect(start, 0.4);
    expect(Math.max(next.w, next.h)).toBeCloseTo(0.4, 5);
    expect(next.w / next.h).toBeCloseTo(start.w / start.h, 5);
    expect(next.x + next.w / 2).toBeCloseTo(0.5, 5);
    expect(next.y + next.h / 2).toBeCloseTo(0.35, 5);
  });

  it("punches in digitally only when the camera has no hardware zoom", () => {
    expect(compositorZoom({ zoom: 2.5 })).toBe(2.5);
    expect(compositorZoom({ zoom: 2.5, zoomHardware: true })).toBe(1);
    expect(compositorZoom({ zoom: 9 })).toBe(LIVE_DIGITAL_ZOOM_MAX);
  });

  it("remembers phone and camera sources by default", () => {
    let state = addSourceToMixer(emptyMixerState(), { kind: "phone", name: "iPhone" });
    expect(state.sources[0]?.remembered).toBe(true);
    state = addSourceToMixer(emptyMixerState(), { kind: "camera", name: "Webcam" });
    expect(state.sources[0]?.remembered).toBe(true);
    state = addSourceToMixer(emptyMixerState(), { kind: "screen", name: "Desk" });
    expect(state.sources[0]?.remembered).toBe(false);
  });

  it("adds mic and system audio without a canvas hit target", () => {
    let state = addSourceToMixer(emptyMixerState(), { kind: "mic", name: "Mic" });
    state = addSourceToMixer(state, { kind: "system", name: "System audio" });
    const mic = state.sources.find((row) => row.kind === "mic");
    const system = state.sources.find((row) => row.kind === "system");
    expect(mic).toBeTruthy();
    expect(system).toBeTruthy();
    expect(isAudioOnlyKind("mic")).toBe(true);
    expect(isAudioOnlyKind("system")).toBe(true);
    expect(hitMixerSource(state.sources, 50, 50, 100, 100)).toBeNull();
  });
});
