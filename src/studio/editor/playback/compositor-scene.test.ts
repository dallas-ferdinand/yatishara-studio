import { describe, expect, it } from "vitest";

import { compositorVisual, mapTextItems } from "./compositor-scene";
import { pictureLayersBottomToTop } from "./picture-layers";
import type { CompiledClip, RenderSlice, VideoSample } from "./timeline-compiler";

function compiled(
  clipId: string,
  trackIndex: number,
  kind: CompiledClip["kind"],
  extra?: Partial<CompiledClip["clip"]>,
): CompiledClip {
  return {
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
      ...extra,
    },
  };
}

function videoSample(clip: CompiledClip, role: VideoSample["role"] = "single"): VideoSample {
  return { role, sourceTime: 0, clip };
}

describe("mapTextItems", () => {
  it("paints Motion In opacity at the playhead, not a static first frame", () => {
    const clip = compiled("title", 0, "text", {
      text: {
        text: "HELLO",
        animation: "fadeIn",
        animationDuration: 1,
        fontSize: 48,
      },
    });
    const start = mapTextItems([clip], 0)[0];
    const mid = mapTextItems([clip], 0.5)[0];
    const rest = mapTextItems([clip], 2)[0];
    expect(start?.opacity ?? 1).toBeLessThan(mid?.opacity ?? 0);
    expect(mid?.opacity ?? 0).toBeLessThan(rest?.opacity ?? 0);
    expect(rest?.text).toBe("HELLO");
  });
});

describe("compositorVisual", () => {
  it("keeps picture then text in slice.visual order", () => {
    const picture = compiled("sheet", 1, "image");
    const title = compiled("title", 0, "text", { text: { text: "ON TOP" } });
    const slice: RenderSlice = {
      timelineTime: 1,
      video: [videoSample(picture)],
      transition: null,
      audio: [],
      preloadAudio: [],
      text: [title],
      visual: [
        {
          kind: "picture",
          clipId: "sheet",
          trackIndex: 1,
          role: "single",
          clip: picture,
        },
        { kind: "text", clipId: "title", trackIndex: 0, clip: title },
      ],
      preload: [],
    };
    const pictures = pictureLayersBottomToTop(
      [{ clipId: "sheet", textureKey: "image:sheet" }],
      slice,
    );
    const visual = compositorVisual(slice, pictures, mapTextItems(slice.text, slice.timelineTime));
    expect(visual.map((item) => item.type)).toEqual(["picture", "text"]);
  });
});
