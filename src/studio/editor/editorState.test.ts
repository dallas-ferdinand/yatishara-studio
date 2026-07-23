import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  createInitialState,
  normalizeProject,
  reducer,
  clipDuration,
} from "./editorState";
import { timelineSegmentsForTrack } from "./projectContract";
import type { EditorProject } from "./types";

describe("editorState live undo", () => {
  it("restores the pre-drag project after a live trim commit", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        sourceDuration: 10,
        label: "Clip",
        kind: "video",
      },
    });
    const clipId = state.project.clips[0]!.id;
    const before = state.project;

    state = reducer(state, {
      type: "trim_clip",
      clipId,
      trimIn: 0,
      trimOut: 2,
      live: true,
    });
    expect(state.liveBaseline).toEqual(before);
    expect(clipDuration(state.project.clips[0]!)).toBe(2);

    state = reducer(state, {
      type: "trim_clip",
      clipId,
      trimIn: 0,
      trimOut: 2,
      live: false,
    });
    expect(state.liveBaseline).toBeNull();
    expect(state.past[state.past.length - 1]).toEqual(before);

    state = reducer(state, { type: "undo" });
    expect(clipDuration(state.project.clips[0]!)).toBe(4);
  });

  it("clamps trimOut to sourceDuration", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        sourceDuration: 3,
        label: "Clip",
        kind: "video",
      },
    });
    const clipId = state.project.clips[0]!.id;
    state = reducer(state, {
      type: "trim_clip",
      clipId,
      trimIn: 0,
      trimOut: 99,
      live: false,
    });
    expect(state.project.clips[0]!.trimOut).toBe(3);
  });
});

describe("normalizeProject track ids", () => {
  it("remaps legacy track-video ids so clips stay visible on reopen", () => {
    const legacy = {
      name: "Edit",
      folderId: "folder1",
      duration: 30,
      frameRatio: "16:9",
      tracks: [
        { id: "track-video", kind: "video", label: "Video" },
        { id: "track-audio", kind: "audio", label: "Audio" },
      ],
      clips: [
        {
          id: "c1",
          assetId: "a1",
          trackId: "track-video",
          startTime: 0,
          trimIn: 0,
          trimOut: 4,
          label: "Clip",
          kind: "video",
        },
      ],
    } as EditorProject;

    const normalized = normalizeProject(legacy);
    expect(normalized.tracks.some((track) => track.id === "track-v1")).toBe(true);
    expect(normalized.tracks.some((track) => track.id === "track-video")).toBe(false);
    expect(normalized.clips[0]!.trackId).toBe("track-v1");
    expect(
      normalized.tracks.some((track) => track.id === normalized.clips[0]!.trackId),
    ).toBe(true);
  });

  it("repairs already-broken saves (clips on track-v1, tracks still legacy)", () => {
    const broken = {
      name: "Edit",
      folderId: "folder1",
      duration: 30,
      frameRatio: "16:9",
      tracks: [
        { id: "track-video", kind: "video", label: "Video" },
        { id: "track-audio", kind: "audio", label: "Audio" },
      ],
      clips: [
        {
          id: "c1",
          assetId: "a1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 4,
          label: "Clip",
          kind: "video",
        },
      ],
    } as EditorProject;

    const normalized = normalizeProject(broken);
    expect(normalized.clips[0]!.trackId).toBe("track-v1");
    expect(normalized.tracks.find((track) => track.id === "track-v1")?.kind).toBe(
      "video",
    );
  });
});

describe("timelineSegmentsForTrack", () => {
  it("inserts gap pads for startTime holes", () => {
    const segments = timelineSegmentsForTrack([
      { startTime: 0, trimIn: 0, trimOut: 2 },
      { startTime: 5, trimIn: 0, trimOut: 1 },
    ]);
    expect(segments).toEqual([
      { type: "clip", clip: { startTime: 0, trimIn: 0, trimOut: 2 }, duration: 2 },
      { type: "gap", duration: 3 },
      { type: "clip", clip: { startTime: 5, trimIn: 0, trimOut: 1 }, duration: 1 },
    ]);
  });
});

describe("reorder_tracks", () => {
  it("moves a lane to a new index and supports undo", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = {
      ...state,
      project: {
        ...state.project,
        tracks: [
          { id: "track-v1", kind: "video", label: "V1" },
          { id: "track-v2", kind: "video", label: "V2" },
          { id: "track-audio", kind: "audio", label: "Audio" },
        ],
        clips: [
          {
            id: "clip-a",
            assetId: "a1",
            trackId: "track-v1",
            startTime: 0,
            trimIn: 0,
            trimOut: 2,
            sourceDuration: 2,
            label: "A",
            kind: "video",
          },
          {
            id: "clip-b",
            assetId: "a2",
            trackId: "track-v2",
            startTime: 0,
            trimIn: 0,
            trimOut: 1,
            sourceDuration: 1,
            label: "B",
            kind: "video",
          },
        ],
      },
    };
    const before = state.project.tracks.map((t) => t.id);
    state = reducer(state, {
      type: "reorder_tracks",
      trackId: "track-v1",
      toIndex: 2,
    });
    expect(state.project.tracks.map((t) => t.id)).toEqual([
      "track-v2",
      "track-v1",
      "track-audio",
    ]);
    state = reducer(state, { type: "undo" });
    expect(state.project.tracks.map((t) => t.id)).toEqual(before);
  });
});

describe("insertTrackAt ids", () => {
  it("does not reuse pruned audio track ids", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 2,
        sourceDuration: 2,
        label: "Bed",
        kind: "audio",
      },
    });
    const clipId = state.project.clips[0]!.id;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId,
      startTime: 0,
      insertTrackAt: state.project.tracks.length,
    });
    const firstIds = state.project.tracks.map((t) => t.id);
    expect(firstIds.filter((id) => id.startsWith("track-audio")).length).toBe(1);

    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a2",
        trackId: state.project.tracks.find((t) => t.kind === "audio")!.id,
        startTime: 3,
        trimIn: 0,
        trimOut: 1,
        sourceDuration: 1,
        label: "Bed 2",
        kind: "audio",
      },
    });
    const secondClipId = state.project.clips.find((c) => c.label === "Bed 2")!.id;
    state = reducer(state, {
      type: "move_clip_to_track",
      clipId: secondClipId,
      startTime: 3,
      insertTrackAt: state.project.tracks.length,
    });

    const audioIds = state.project.tracks.filter((t) => t.kind === "audio").map((t) => t.id);
    expect(new Set(audioIds).size).toBe(audioIds.length);
    expect(audioIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe("split_at_playhead naming", () => {
  it("names halves clip a / clip b, then clip b 1 / clip b 2", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-v1",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        sourceDuration: 10,
        label: "clip",
        kind: "video",
      },
    });
    const clipId = state.project.clips[0]!.id;
    state = reducer(state, { type: "select_clip", clipId });
    state = reducer(state, { type: "set_playhead", time: 2 });
    state = reducer(state, { type: "split_at_playhead" });

    const labels = state.project.clips.map((c) => c.label).sort();
    expect(labels).toEqual(["clip a", "clip b"]);

    const right = state.project.clips.find((c) => c.label === "clip b")!;
    state = reducer(state, { type: "select_clip", clipId: right.id });
    state = reducer(state, { type: "set_playhead", time: 3 });
    state = reducer(state, { type: "split_at_playhead" });

    const after = state.project.clips.map((c) => c.label).sort();
    expect(after).toEqual(["clip a", "clip b 1", "clip b 2"]);
  });
});

describe("detach_audio", () => {
  it("mutes the video clip and places a linked audio clip on the main audio lane", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-v1",
        startTime: 1,
        trimIn: 0.5,
        trimOut: 3.5,
        sourceDuration: 10,
        label: "Take",
        kind: "video",
        effects: { volume: 0.8, fadeIn: 0.2 },
      },
    });
    const videoId = state.project.clips[0]!.id;
    const videoStart = state.project.clips[0]!.startTime;
    state = reducer(state, { type: "detach_audio", clipId: videoId });

    const video = state.project.clips.find((c) => c.id === videoId)!;
    const audio = state.project.clips.find((c) => c.kind === "audio")!;
    expect(video.effects?.volume).toBe(0);
    expect(audio).toBeTruthy();
    expect(audio.assetId).toBe("a1");
    expect(audio.trackId).toBe("track-audio");
    expect(audio.startTime).toBe(videoStart);
    expect(audio.trimIn).toBe(0.5);
    expect(audio.trimOut).toBe(3.5);
    expect(audio.effects?.volume).toBe(0.8);
    expect(audio.effects?.fadeIn).toBe(0.2);
    expect(state.ui.selectedClipId).toBe(audio.id);
  });

  it("keeps in-place timing and stacks a new audio lane under main when busy", () => {
    let state = createInitialState(
      createEmptyProject({ name: "Test", folderId: "folder1" }),
    );
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "bed",
        trackId: "track-audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        sourceDuration: 4,
        label: "Bed",
        kind: "audio",
      },
    });
    state = reducer(state, {
      type: "add_clip",
      clip: {
        assetId: "a1",
        trackId: "track-v1",
        startTime: 1,
        trimIn: 0,
        trimOut: 2,
        sourceDuration: 10,
        label: "Take",
        kind: "video",
      },
    });
    const video = state.project.clips.find((c) => c.label === "Take")!;
    state = reducer(state, { type: "detach_audio", clipId: video.id });

    const detached = state.project.clips.find((c) => c.label === "Take audio")!;
    const bed = state.project.clips.find((c) => c.label === "Bed")!;
    expect(detached.startTime).toBe(video.startTime);
    expect(detached.trackId).not.toBe(bed.trackId);
    expect(detached.trackId).toMatch(/^track-audio/);
    expect(bed.startTime).toBe(0);
    expect(bed.trackId).toBe("track-audio");

    const audioTrackIds = state.project.tracks
      .filter((t) => t.kind === "audio")
      .map((t) => t.id);
    expect(audioTrackIds.length).toBeGreaterThanOrEqual(2);
    expect(audioTrackIds[0]).toBe("track-audio");
    expect(audioTrackIds.indexOf(detached.trackId)).toBeGreaterThan(
      audioTrackIds.indexOf("track-audio"),
    );
  });
});
