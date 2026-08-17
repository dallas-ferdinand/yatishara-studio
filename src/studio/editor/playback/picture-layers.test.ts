import { describe, expect, it } from "vitest";

import { pictureLayersBottomToTop } from "./picture-layers";
import type { RenderSlice, VideoSample } from "./timeline-compiler";

function sample(clipId: string, trackIndex: number): VideoSample {
  return {
    role: "single",
    sourceTime: 0,
    clip: {
      clipId,
      assetId: clipId,
      trackId: `t-${clipId}`,
      trackIndex,
      kind: "image",
      timelineStart: 0,
      timelineEnd: 4,
      sourceStart: 0,
      sourceEnd: 4,
      volume: 1,
      muted: false,
      clip: {
        id: clipId,
        trackId: `t-${clipId}`,
        kind: "image",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: clipId,
        assetId: clipId,
      },
    },
  };
}

function sliceOf(...ids: string[]): RenderSlice {
  return {
    timelineTime: 1,
    video: ids.map((id, index) => sample(id, index)),
    transition: null,
    audio: [],
    preloadAudio: [],
    text: [],
    textOver: [],
    textUnder: [],
    preload: [],
  };
}

describe("pictureLayersBottomToTop", () => {
  it("keeps every overlapping lane, bottom to top — not only first and last", () => {
    const slice = sliceOf("sheet-a", "sheet-b", "blurry", "main");
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
