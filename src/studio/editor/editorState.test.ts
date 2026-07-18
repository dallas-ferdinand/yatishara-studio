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
