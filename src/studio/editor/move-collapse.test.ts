import { describe, expect, it } from "vitest";
import { createEmptyProject, createInitialState, reducer } from "./editorState";

function seedThreeOnMain() {
  let state = createInitialState(createEmptyProject({ name: "T", folderId: "f" }));
  for (const [label, start, dur] of [
    ["A", 0, 2],
    ["B", 2, 2],
    ["C", 4, 2],
  ] as const) {
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a",
        trackId: "track-v1",
        startTime: start,
        trimIn: 0,
        trimOut: dur,
        label,
        kind: "video",
      },
    });
  }
  return state;
}

describe("move off main", () => {
  it("collapses main after insertTrackAt (new line above)", () => {
    let state = seedThreeOnMain();
    const b = state.project.clips.find((c) => c.label === "B")!;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId: b.id,
      startTime: 1.5,
      insertTrackAt: 0,
    });
    expect(state.project.clips.find((c) => c.label === "A")!.startTime).toBe(0);
    expect(state.project.clips.find((c) => c.label === "C")!.startTime).toBe(2);
    expect(state.project.clips.find((c) => c.label === "B")!.trackId).not.toBe("track-v1");
  });

  it("collapses main after move_clip to existing overlay", () => {
    let state = seedThreeOnMain();
    // Create overlay by moving C up first
    const c0 = state.project.clips.find((c) => c.label === "C")!;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId: c0.id,
      startTime: 0,
      insertTrackAt: 0,
    });
    const overlayId = state.project.clips.find((c) => c.label === "C")!.trackId;
    // Reset A,B packing on main — move B to overlay
    // After C left, main should be A@0 B@2
    expect(state.project.clips.find((c) => c.label === "A")!.startTime).toBe(0);
    expect(state.project.clips.find((c) => c.label === "B")!.startTime).toBe(2);

    const b = state.project.clips.find((c) => c.label === "B")!;
    state = reducer(state, {
      type: "move_clip",
      clipId: b.id,
      startTime: 5,
      trackId: overlayId,
    });
    expect(state.project.clips.find((c) => c.label === "A")!.startTime).toBe(0);
    // Only A left on main — still 0
    expect(state.project.clips.find((c) => c.label === "B")!.trackId).toBe(overlayId);
  });

  it("collapses main when moving middle clip to existing overlay", () => {
    let state = seedThreeOnMain();
    const c0 = state.project.clips.find((c) => c.label === "C")!;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId: c0.id,
      startTime: 8,
      insertTrackAt: 0,
    });
    // Put C back conceptually — re-seed cleaner: A B on main, D on overlay, move B
    state = seedThreeOnMain();
    const c = state.project.clips.find((x) => x.label === "C")!;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId: c.id,
      startTime: 0,
      insertTrackAt: 0,
    });
    const overlayId = state.project.clips.find((x) => x.label === "C")!.trackId;
    // Main has A@0 B@2. Move A to overlay — B should go to 0
    const a = state.project.clips.find((x) => x.label === "A")!;
    state = reducer(state, {
      type: "move_clip",
      clipId: a.id,
      startTime: 1,
      trackId: overlayId,
    });
    expect(state.project.clips.find((x) => x.label === "B")!.startTime).toBe(0);
    expect(state.project.clips.find((x) => x.label === "B")!.trackId).toBe("track-v1");
  });
});
