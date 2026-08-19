import { describe, expect, it } from "vitest";
import { contentRectForTransform, overlaySourceSize } from "./clipTransform";
import { picturePaintedRect } from "./playback/compositor-2d";
import {
  hitSceneItemAtPoint,
  pictureSourceSize,
  sceneItemsBottomToTop,
  sceneItemsTopToBottom,
} from "./previewScene";
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

describe("sceneItemsBottomToTop", () => {
  it("interleaves text between pictures in timeline order", () => {
    const project: EditorProject = {
      name: "stack",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "title", kind: "text", label: "Title" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [
        clip("sheet", "top"),
        clip("title", "title", "text"),
        clip("movie", "track-v1", "video"),
      ],
    };
    expect(
      sceneItemsBottomToTop(project, 1).map((item) => item.clip.id),
    ).toEqual(["movie", "title", "sheet"]);
    expect(
      sceneItemsTopToBottom(project, 1).map((item) => item.clip.id),
    ).toEqual(["sheet", "title", "movie"]);
  });

  it("skips hidden tracks", () => {
    const project: EditorProject = {
      name: "hidden",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top", hidden: true },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(
      sceneItemsBottomToTop(project, 1).map((item) => item.clip.id),
    ).toEqual(["movie"]);
  });

  it("picks stills on leftover image-kind overlay lanes", () => {
    const project: EditorProject = {
      name: "legacy-lane",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "overlay", kind: "image" as never, label: "Image" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "overlay"), clip("movie", "track-v1", "video")],
    };
    expect(
      sceneItemsTopToBottom(project, 1).map((item) => item.clip.id),
    ).toEqual(["sheet", "movie"]);
  });
});

describe("hitSceneItemAtPoint", () => {
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

  it("selects a top still over a main-line video on overlapping pixels", () => {
    const project: EditorProject = {
      name: "stack",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        mediaById,
        sourceSizes,
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("hits a still stacked on the same track as a video", () => {
    const project: EditorProject = {
      name: "same-track",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("movie", "track-v1", "video"), clip("sheet", "track-v1")],
    };
    expect(
      sceneItemsTopToBottom(project, 1).map((item) => item.clip.id),
    ).toEqual(["sheet", "movie"]);
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        mediaById,
        sourceSizes,
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("selects a still whose cover-rect overflows the visible canvas", () => {
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
    expect(
      hitSceneItemAtPoint(
        0.5,
        -0.2,
        project,
        1,
        mediaById,
        sourceSizes,
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("lets letterbox around a contain still hit the video underneath", () => {
    const project: EditorProject = {
      name: "stack",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(
      hitSceneItemAtPoint(
        0.08,
        0.5,
        project,
        1,
        mediaById,
        sourceSizes,
        1280,
        720,
      )?.clip.id,
    ).toBe("movie");
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        mediaById,
        sourceSizes,
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("cover still captures edge pixels that contain would have treated as letterbox", () => {
    const project: EditorProject = {
      name: "stack",
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
    const onCoveredStill = hitSceneItemAtPoint(
      0.08,
      0.5,
      project,
      1,
      mediaById,
      sourceSizes,
      1280,
      720,
    );
    expect(onCoveredStill?.clip.id).toBe("sheet");
  });

  it("selects main-line video when it is the only picture", () => {
    const project: EditorProject = {
      name: "solo",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("movie", "track-v1", "video")],
    };
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        mediaById,
        { movie: { width: 1920, height: 1080 } },
        1280,
        720,
      )?.clip.id,
    ).toBe("movie");
  });

  it("selects a still on the main line", () => {
    const project: EditorProject = {
      name: "solo",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("sheet", "track-v1")],
    };
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        mediaById,
        { sheet: { width: 720, height: 1280 } },
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("does not invent a canvas-sized box for stills until decoded", () => {
    const still: EditorClip = clip("sheet", "track-v1");
    const catalog = new Map<string, EditorMediaItem>([
      [
        "sheet",
        {
          assetId: "sheet",
          name: "sheet",
          kind: "image",
          width: 1920,
          height: 1080,
        },
      ],
    ]);
    expect(pictureSourceSize(still, catalog, {}, 1280, 720)).toBeNull();
    expect(
      pictureSourceSize(
        still,
        catalog,
        { sheet: { width: 720, height: 1280 } },
        1280,
        720,
      ),
    ).toEqual({ width: 720, height: 1280 });
  });

  it("hits a portrait still from the painted quad, not catalog size", () => {
    const project: EditorProject = {
      name: "mismatch",
      folderId: "f",
      duration: 8,
      tracks: [{ id: "track-v1", kind: "video", label: "Main" }],
      clips: [clip("sheet", "track-v1")],
    };
    const catalog = new Map<string, EditorMediaItem>([
      [
        "sheet",
        {
          assetId: "sheet",
          name: "sheet",
          kind: "image",
          width: 1920,
          height: 1080,
        },
      ],
    ]);
    const painted = [
      {
        ...picturePaintedRect(1280, 720, 720, 1280, {
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
        }, "contain"),
        clipId: "sheet",
      },
    ];
    expect(
      hitSceneItemAtPoint(0.5, 0.08, project, 1, catalog, {}, 1280, 720, painted)
        ?.clip.id,
    ).toBe("sheet");
    expect(
      hitSceneItemAtPoint(0.5, 0.08, project, 1, catalog, {}, 1280, 720)?.clip.id,
    ).toBe("sheet");
  });

  it("does not punch through a still to the video underneath before decode", () => {
    const project: EditorProject = {
      name: "overlay",
      folderId: "f",
      duration: 8,
      tracks: [
        { id: "top", kind: "video", label: "Top" },
        { id: "track-v1", kind: "video", label: "Main" },
      ],
      clips: [clip("sheet", "top"), clip("movie", "track-v1", "video")],
    };
    expect(
      hitSceneItemAtPoint(
        0.5,
        0.5,
        project,
        1,
        new Map(),
        {},
        1280,
        720,
      )?.clip.id,
    ).toBe("sheet");
  });

  it("selects text that sits between two videos, not the video underneath", () => {
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
    const hit = hitSceneItemAtPoint(
      0.5,
      0.82,
      project,
      1,
      mediaById,
      sourceSizes,
      1280,
      720,
    );
    expect(hit?.clip.id).toBe("title");
    expect(hit?.kind).toBe("text");
  });
});

describe("picture overlay fitted rect", () => {
  it("letterboxes a portrait still on a landscape canvas by default", () => {
    const source = overlaySourceSize({ width: 720, height: 1280 }, null);
    expect(source).toEqual({ width: 720, height: 1280 });
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      source!.width,
      source!.height,
      "contain",
    );
    expect(rect.height).toBeCloseTo(1);
    expect(rect.width).toBeLessThan(1);
  });

  it("fills a landscape canvas with a portrait still when cover is set", () => {
    const source = overlaySourceSize({ width: 720, height: 1280 }, null);
    const rect = contentRectForTransform(
      { scale: 1, x: 0, y: 0, rotation: 0 },
      1280,
      720,
      source!.width,
      source!.height,
      "cover",
    );
    expect(rect.width).toBeCloseTo(1);
    expect(rect.height).toBeGreaterThan(1);
  });
});
