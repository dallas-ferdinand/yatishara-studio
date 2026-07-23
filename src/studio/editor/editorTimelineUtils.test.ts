import { describe, expect, it } from "vitest";
import { visibleTracks, defaultInsertIndex } from "./editorTimelineUtils";
import type { EditorProject } from "./types";
import {
  createEmptyProject,
  createInitialState,
  reducer,
} from "./editorState";

describe("visibleTracks order", () => {
  it("keeps project.tracks order so text can sit above video", () => {
    const project: EditorProject = {
      name: "Test",
      folderId: "folder1",
      duration: 30,
      frameRatio: "16:9",
      tracks: [
        { id: "track-t1", kind: "text", label: "Title" },
        { id: "track-v1", kind: "video", label: "V1" },
        { id: "track-audio", kind: "audio", label: "Audio" },
      ],
      clips: [
        {
          id: "c-text",
          trackId: "track-t1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Text",
          kind: "text",
          text: { text: "Hi" },
        },
        {
          id: "c-vid",
          assetId: "a1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Vid",
          kind: "video",
        },
        {
          id: "c-aud",
          assetId: "a2",
          trackId: "track-audio",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Aud",
          kind: "audio",
        },
      ],
    };
    expect(visibleTracks(project).map((t) => t.id)).toEqual([
      "track-t1",
      "track-v1",
      "track-audio",
    ]);
  });

  it("keeps text below video when project order says so", () => {
    const project: EditorProject = {
      name: "Test",
      folderId: "folder1",
      duration: 30,
      frameRatio: "16:9",
      tracks: [
        { id: "track-v1", kind: "video", label: "V1" },
        { id: "track-t1", kind: "text", label: "Title" },
        { id: "track-audio", kind: "audio", label: "Audio" },
      ],
      clips: [
        {
          id: "c-vid",
          assetId: "a1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Vid",
          kind: "video",
        },
        {
          id: "c-text",
          trackId: "track-t1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Text",
          kind: "text",
          text: { text: "Hi" },
        },
      ],
    };
    expect(visibleTracks(project).map((t) => t.id)).toEqual([
      "track-v1",
      "track-t1",
      "track-audio",
    ]);
  });
});

describe("defaultInsertIndex text", () => {
  it("inserts text above the first video lane", () => {
    const tracks = [
      { id: "track-v1", kind: "video" as const, label: "V1" },
      { id: "track-audio", kind: "audio" as const, label: "Audio" },
    ];
    expect(defaultInsertIndex(tracks, "text")).toBe(0);
  });
});

describe("pinAudioTracksBelow", () => {
  it("keeps audio under text and video even if project order was wrong", () => {
    const project: EditorProject = {
      name: "Test",
      folderId: "folder1",
      duration: 30,
      frameRatio: "16:9",
      tracks: [
        { id: "track-audio", kind: "audio", label: "Audio" },
        { id: "track-t1", kind: "text", label: "Title" },
        { id: "track-v1", kind: "video", label: "V1" },
      ],
      clips: [
        {
          id: "c-aud",
          assetId: "a2",
          trackId: "track-audio",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Aud",
          kind: "audio",
        },
        {
          id: "c-text",
          trackId: "track-t1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Text",
          kind: "text",
          text: { text: "Hi" },
        },
        {
          id: "c-vid",
          assetId: "a1",
          trackId: "track-v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 2,
          label: "Vid",
          kind: "video",
        },
      ],
    };
    expect(visibleTracks(project).map((t) => t.kind)).toEqual(["text", "video", "audio"]);
  });
});

describe("add_text_clip main lane", () => {
  it("reuses one text lane above video instead of spawning new lines", () => {
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
        sourceDuration: 2,
        label: "Vid",
        kind: "video",
      },
    });
    state = reducer(state, { type: "add_text_clip", startTime: 0 });
    state = reducer(state, { type: "add_text_clip", startTime: 1 });
    state = reducer(state, { type: "add_text_clip", startTime: 2 });

    const textTracks = state.project.tracks.filter((t) => t.kind === "text");
    expect(textTracks.length).toBe(1);
    const videoIdx = state.project.tracks.findIndex((t) => t.id === "track-v1");
    const textIdx = state.project.tracks.findIndex((t) => t.kind === "text");
    expect(textIdx).toBeLessThan(videoIdx);
    expect(state.project.clips.filter((c) => c.kind === "text")).toHaveLength(3);
  });

  it("only creates an extra text lane when newLane is set", () => {
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
        sourceDuration: 2,
        label: "Vid",
        kind: "video",
      },
    });
    state = reducer(state, { type: "add_text_clip" });
    state = reducer(state, {
      type: "add_text_clip",
      newLane: true,
      insertTrackAt: 0,
    });
    expect(state.project.tracks.filter((t) => t.kind === "text").length).toBe(2);
  });
});

describe("reorder_tracks cross-kind", () => {
  it("lets text move below then above video and stays there in visibleTracks", () => {
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
        sourceDuration: 2,
        label: "Vid",
        kind: "video",
      },
    });
    state = reducer(state, { type: "add_text_clip" });
    const textTrack = state.project.tracks.find((t) => t.kind === "text")!;
    // Default add places text above video — push it under video (before audio).
    const audioIdx = state.project.tracks.findIndex((t) => t.id === "track-audio");
    state = reducer(state, {
      type: "reorder_tracks",
      trackId: textTrack.id,
      toIndex: audioIdx,
    });
    expect(visibleTracks(state.project).map((t) => t.kind)).toEqual([
      "video",
      "text",
      "audio",
    ]);

    state = reducer(state, { type: "reorder_tracks", trackId: textTrack.id, toIndex: 0 });
    expect(visibleTracks(state.project).map((t) => t.kind)[0]).toBe("text");
    expect(state.project.tracks[0]?.kind).toBe("text");
  });
});
