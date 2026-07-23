import { describe, expect, it } from "vitest";
import {
  arrangeTrackForDrop,
  resolveTrackOverlaps,
  computeRippleLayout,
  collapseTrackLeft,
  isMainStoryTrack,
} from "./editorRipple";
import type { EditorClip, EditorProject } from "./types";

function projectWith(clips: EditorClip[], extraTracks: EditorProject["tracks"] = []): EditorProject {
  return {
    name: "Test",
    folderId: "f1",
    duration: 60,
    frameRatio: "16:9",
    tracks: [
      { id: "track-v1", kind: "video", label: "V1" },
      ...extraTracks,
      { id: "track-audio", kind: "audio", label: "Audio" },
    ],
    clips,
  };
}

describe("isMainStoryTrack", () => {
  it("keeps track-v1 as main even when another video lane is inserted first", () => {
    const project = projectWith([], [{ id: "track-v2", kind: "video", label: "V2" }]);
    // Put V2 before V1 in the array (insert-above case).
    project.tracks = [
      { id: "track-v2", kind: "video", label: "V2" },
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ];
    expect(isMainStoryTrack(project, "track-v1")).toBe(true);
    expect(isMainStoryTrack(project, "track-v2")).toBe(false);
    expect(isMainStoryTrack(project, "track-audio")).toBe(false);
  });
});

describe("collapse after leaving main", () => {
  it("packs the main line when a clip moves to an overlay", () => {
    const project = projectWith(
      [
        {
          id: "a",
          assetId: "1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "A",
          kind: "video",
        },
        {
          id: "b",
          assetId: "2",
          trackId: "track-v1",
          startTime: 2,
          trimIn: 0,
          trimOut: 2,
          label: "B",
          kind: "video",
        },
        {
          id: "c",
          assetId: "3",
          trackId: "track-v1",
          startTime: 4,
          trimIn: 0,
          trimOut: 2,
          label: "C",
          kind: "video",
        },
      ],
      [{ id: "track-v2", kind: "video", label: "V2" }],
    );
    const focus = project.clips.find((c) => c.id === "b")!;
    const moved = arrangeTrackForDrop({
      project,
      trackId: "track-v2",
      focusClip: focus,
      preferredStart: 3,
    });
    const next = collapseTrackLeft(moved, "track-v1");
    expect(next.find((c) => c.id === "a")!.startTime).toBe(0);
    expect(next.find((c) => c.id === "c")!.startTime).toBe(2);
    expect(next.find((c) => c.id === "b")!.trackId).toBe("track-v2");
    expect(next.find((c) => c.id === "b")!.startTime).toBe(3);
  });
});


describe("resolveTrackOverlaps", () => {
  it("pushes later clips right when they collide with an earlier clip", () => {
    const clips: EditorClip[] = [
      {
        id: "a",
        assetId: "1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: "A",
        kind: "video",
      },
      {
        id: "b",
        assetId: "2",
        trackId: "track-v1",
        startTime: 2,
        trimIn: 0,
        trimOut: 3,
        label: "B",
        kind: "video",
      },
    ];
    const next = resolveTrackOverlaps(clips, "track-v1");
    expect(next.find((c) => c.id === "a")!.startTime).toBe(0);
    expect(next.find((c) => c.id === "b")!.startTime).toBe(4);
  });

  it("keeps intentional gaps when nothing overlaps", () => {
    const clips: EditorClip[] = [
      {
        id: "a",
        assetId: "1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "A",
        kind: "video",
      },
      {
        id: "b",
        assetId: "2",
        trackId: "track-v1",
        startTime: 5,
        trimIn: 0,
        trimOut: 2,
        label: "B",
        kind: "video",
      },
    ];
    const next = resolveTrackOverlaps(clips, "track-v1");
    expect(next.find((c) => c.id === "a")!.startTime).toBe(0);
    expect(next.find((c) => c.id === "b")!.startTime).toBe(5);
  });
});

describe("collapseTrackLeft", () => {
  it("packs remaining clips from 0 with no gaps after a removal", () => {
    const clips: EditorClip[] = [
      {
        id: "a",
        assetId: "1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "A",
        kind: "video",
      },
      {
        id: "c",
        assetId: "3",
        trackId: "track-v1",
        startTime: 6,
        trimIn: 0,
        trimOut: 2,
        label: "C",
        kind: "video",
      },
    ];
    const next = collapseTrackLeft(clips, "track-v1");
    expect(next.find((c) => c.id === "a")!.startTime).toBe(0);
    expect(next.find((c) => c.id === "c")!.startTime).toBe(2);
  });
});

describe("arrangeTrackForDrop", () => {
  it("packs the main storyline end-to-end (no free gaps)", () => {
    const project = projectWith([
      {
        id: "a",
        assetId: "1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: "A",
        kind: "video",
      },
      {
        id: "b",
        assetId: "2",
        trackId: "track-v1",
        startTime: 10,
        trimIn: 0,
        trimOut: 2,
        label: "B",
        kind: "video",
      },
    ]);
    const focus = project.clips.find((c) => c.id === "b")!;
    const next = arrangeTrackForDrop({
      project,
      trackId: "track-v1",
      focusClip: focus,
      preferredStart: 0,
    });
    expect(next.find((c) => c.id === "b")!.startTime).toBe(0);
    expect(next.find((c) => c.id === "a")!.startTime).toBe(2);
  });

  it("keeps gaps on overlay lanes above the main line", () => {
    const project = projectWith(
      [
        {
          id: "main",
          assetId: "1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 4,
          label: "Main",
          kind: "video",
        },
        {
          id: "overlay",
          assetId: "2",
          trackId: "track-v2",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Overlay",
          kind: "video",
        },
      ],
      [{ id: "track-v2", kind: "video", label: "V2" }],
    );
    const focus = project.clips.find((c) => c.id === "overlay")!;
    const next = arrangeTrackForDrop({
      project,
      trackId: "track-v2",
      focusClip: focus,
      preferredStart: 6,
    });
    expect(next.find((c) => c.id === "overlay")!.startTime).toBe(6);
    expect(next.find((c) => c.id === "main")!.startTime).toBe(0);
  });

  it("keeps the free-drop position on overlay even when it overlaps a neighbor", () => {
    const project = projectWith(
      [
        {
          id: "a",
          assetId: "1",
          trackId: "track-v2",
          startTime: 0,
          trimIn: 0,
          trimOut: 4,
          label: "A",
          kind: "video",
        },
        {
          id: "b",
          assetId: "2",
          trackId: "track-v2",
          startTime: 10,
          trimIn: 0,
          trimOut: 2,
          label: "B",
          kind: "video",
        },
      ],
      [{ id: "track-v2", kind: "video", label: "V2" }],
    );
    const focus = project.clips.find((c) => c.id === "b")!;
    const next = arrangeTrackForDrop({
      project,
      trackId: "track-v2",
      focusClip: focus,
      preferredStart: 2,
    });
    // Drop stays at 2; A is pushed past it (not: B shoved to 4).
    expect(next.find((c) => c.id === "b")!.startTime).toBe(2);
    expect(next.find((c) => c.id === "a")!.startTime).toBe(4);
  });
});

describe("computeRippleLayout", () => {
  it("packs main-line neighbors end-to-end", () => {
    const project = projectWith([
      {
        id: "a",
        assetId: "1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "A",
        kind: "video",
      },
      {
        id: "c",
        assetId: "3",
        trackId: "track-v1",
        startTime: 2,
        trimIn: 0,
        trimOut: 2,
        label: "C",
        kind: "video",
      },
      {
        id: "b",
        assetId: "2",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        label: "B",
        kind: "video",
      },
    ]);
    const placements = computeRippleLayout({
      project,
      trackId: "track-v1",
      draggedClip: project.clips.find((c) => c.id === "b")!,
      centerTime: 2,
    });
    expect(placements.map((p) => p.clipId)).toEqual(["a", "b", "c"]);
    expect(placements.map((p) => p.startTime)).toEqual([0, 2, 4]);
  });

  it("places freely on an overlay lane", () => {
    const project = projectWith(
      [
        {
          id: "a",
          assetId: "1",
          trackId: "track-v2",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "A",
          kind: "video",
        },
        {
          id: "b",
          assetId: "2",
          trackId: "track-v2",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "B",
          kind: "video",
        },
      ],
      [{ id: "track-v2", kind: "video", label: "V2" }],
    );
    const placements = computeRippleLayout({
      project,
      trackId: "track-v2",
      draggedClip: project.clips.find((c) => c.id === "b")!,
      centerTime: 5,
    });
    expect(placements.find((p) => p.clipId === "a")!.startTime).toBe(0);
    expect(placements.find((p) => p.clipId === "b")!.startTime).toBe(5);
  });
});
