import { describe, expect, it } from "vitest";
import { pickPreviewPointer } from "./PreviewPointerRouter";
import { picturePaintedRect } from "./playback/compositor-2d";
import { ROTATE_KNOB_CENTER_PX } from "./transformHit";
import type { EditorClip, EditorMediaItem, EditorProject } from "./types";

function clip(
  id: string,
  trackId: string,
  kind: "video" | "image" | "text" = "image",
  extra: Partial<EditorClip> = {},
): EditorClip {
  return {
    id,
    trackId,
    kind,
    startTime: 0,
    trimIn: 0,
    trimOut: 4,
    label: id,
    assetId: kind === "text" ? undefined : id,
    ...(kind === "text" ? { text: { text: id } } : {}),
    ...extra,
  };
}

const mediaById = new Map<string, EditorMediaItem>([
  [
    "sheet",
    {
      assetId: "sheet",
      name: "sheet",
      kind: "image",
      width: 720,
      height: 1280,
    },
  ],
  [
    "movie",
    {
      assetId: "movie",
      name: "movie",
      kind: "video",
      width: 1920,
      height: 1080,
    },
  ],
]);
const sourceSizes = {
  sheet: { width: 720, height: 1280 },
  movie: { width: 1920, height: 1080 },
};

function paintedFor(clipId: string, width: number, height: number, fitMode: "contain" | "cover" = clipId === "sheet" ? "contain" : "cover") {
  return [
    {
      ...picturePaintedRect(
        1280,
        720,
        width,
        height,
        { scale: 1, x: 0, y: 0, rotation: 0 },
        fitMode,
      ),
      clipId,
    },
  ];
}

function pick(
  nx: number,
  ny: number,
  project: EditorProject,
  playhead: number,
  selectedClipId: string | null,
  sizes = sourceSizes,
  painted: ReturnType<typeof paintedFor> = [],
) {
  return pickPreviewPointer(
    nx,
    ny,
    project,
    playhead,
    selectedClipId,
    mediaById,
    sizes,
    painted,
    1280,
    720,
  );
}

describe("pickPreviewPointer", () => {
  it("picks a still as a move, not a full-canvas button", () => {
    const project: EditorProject = {
      name: "solo",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("sheet", "track-v1")],
    };
    expect(pick(0.5, 0.5, project, 1, null)).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });

  it("uses selected-clip corner chrome before the body under it", () => {
    const project: EditorProject = {
      name: "solo",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("movie", "track-v1", "video")],
    };
    expect(pick(1, 1, project, 1, "movie")).toEqual({
      action: "chrome",
      clipId: "movie",
      kind: "picture",
      handle: "se",
    });
  });

  it("hits the rotate knob of the selection", () => {
    const project: EditorProject = {
      name: "solo",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("movie", "track-v1", "video")],
    };
    const ny = 1 + ROTATE_KNOB_CENTER_PX / 720;
    expect(pick(0.5, ny, project, 1, "movie")).toEqual({
      action: "chrome",
      clipId: "movie",
      kind: "picture",
      handle: "rotate",
    });
  });

  it("selects an unselected still over a selected video without clicking through", () => {
    const project: EditorProject = {
      name: "still-over-video",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(pick(0.5, 0.5, project, 1, "movie")).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
    expect(pick(0.5, 0.5, project, 1, "movie", {}, [])).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });

  it("selects a still on the same track as the video underneath", () => {
    const project: EditorProject = {
      name: "same-track",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("movie", "track-v1", "video"), clip("sheet", "track-v1")],
    };
    expect(pick(0.5, 0.5, project, 1, null)).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });

  it("hits still cover overflow outside the visible canvas", () => {
    const project: EditorProject = {
      name: "overflow",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [
        clip("sheet", "top", "image", { effects: { fitMode: "cover" } }),
        clip("movie", "track-v1", "video"),
      ],
    };
    expect(pick(0.5, -0.2, project, 1, "sheet")).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });

  it("lets letterbox around a contain still select the video underneath", () => {
    const project: EditorProject = {
      name: "still-over-video",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(pick(0.08, 0.5, project, 1, null)).toEqual({
      action: "item",
      clipId: "movie",
      kind: "picture",
      handle: "move",
    });
  });

  it("moves the selected still from its body even when scene pick grabs video below", () => {
    const project: EditorProject = {
      name: "still-over-video",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(pick(0.5, 0.5, project, 1, "sheet")).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });

  it("lets a title on top of a selected video win the body click", () => {
    const project: EditorProject = {
      name: "mid-title",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "title", kind: "text", label: "Title" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [
        clip("sheet", "top", "image", {
          effects: { scale: 0.2, x: -0.4, y: -0.4 },
        }),
        clip("title", "title", "text"),
        clip("movie", "track-v1", "video"),
      ],
    };
    expect(pick(0.5, 0.82, project, 1, "movie")).toEqual({
      action: "item",
      clipId: "title",
      kind: "text",
      handle: "move",
    });
  });

  it("deselects when the point misses every cover-rect", () => {
    const project: EditorProject = {
      name: "tiny",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [
        clip("sheet", "track-v1", "image", {
          effects: { scale: 0.05, x: -0.45, y: -0.45 },
        }),
      ],
    };
    expect(pick(0.95, 0.95, project, 1, "sheet")).toEqual({ action: "empty" });
  });

  it("picks the painted portrait quad when decoded sizes are wrong", () => {
    const project: EditorProject = {
      name: "mismatch",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("sheet", "track-v1")],
    };
    const wrongDecoded = { sheet: { width: 1920, height: 1080 } };
    const painted = paintedFor("sheet", 720, 1280, "contain");
    expect(pick(0.5, 0.08, project, 1, null, wrongDecoded, painted)).toEqual({
      action: "item",
      clipId: "sheet",
      kind: "picture",
      handle: "move",
    });
  });
});
