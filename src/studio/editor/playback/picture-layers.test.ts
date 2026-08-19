import { describe, expect, it } from "vitest";

import { pictureLayersBottomToTop } from "./picture-layers";
import type { RenderSlice, VideoSample } from "./timeline-compiler";

function sample(
  clipId: string,
  trackIndex: number,
  kind: "image" | "video" = "image",
): VideoSample {
  return {
    role: "single",
    sourceTime: 0,
    clip: {
      clipId,
      assetId: clipId,
      trackId: `t-${clipId}`,
      trackIndex,
      kind,
      timelineStart: 0,
      timelineEnd: 4,
      sourceStart: 0,
      sourceEnd: 4,
      volume: 1,
      muted: false,
      clip: {
        id: clipId,
        trackId: `t-${clipId}`,
        kind,
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: clipId,
        assetId: clipId,
      },
    },
  };
}

function sliceOf(
  ...ids: Array<string | { id: string; kind: "image" | "video" }>
): RenderSlice {
  return {
    timelineTime: 1,
    video: ids.map((entry, index) =>
      typeof entry === "string"
        ? sample(entry, index)
        : sample(entry.id, index, entry.kind),
    ),
    transition: null,
    audio: [],
    preloadAudio: [],
    text: [],
    visual: [],
    preload: [],
  };
}

describe("pictureLayersBottomToTop", () => {
  it("keeps every overlapping lane, bottom to top — not only first and last", () => {
    const slice = sliceOf("sheet-a", "sheet-b", "blurry", {
      id: "main",
      kind: "video",
    });
    const layers = pictureLayersBottomToTop(
      [
        { clipId: "sheet-a", textureKey: "image:sheet-a" },
        { clipId: "sheet-b", textureKey: "image:sheet-b" },
        { clipId: "blurry", textureKey: "image:blurry" },
        { clipId: "main", textureKey: "video:main" },
      ],
      slice,
    );

    expect(layers.map((layer) => layer.clipId)).toEqual([
      "main",
      "blurry",
      "sheet-b",
      "sheet-a",
    ]);
    expect(layers.map((layer) => layer.fitMode)).toEqual([
      "cover",
      "contain",
      "contain",
      "contain",
    ]);
  });

  it("omits a lane that has neither pixels nor a texture key, without dropping neighbors", () => {
    const slice = sliceOf("top", "middle", "bottom");
    const layers = pictureLayersBottomToTop(
      [
        { clipId: "top", textureKey: "image:top" },
        { clipId: "middle" },
        { clipId: "bottom", textureKey: "video:bottom" },
      ],
      slice,
    );

    expect(layers.map((layer) => layer.clipId)).toEqual(["bottom", "top"]);
  });
});
