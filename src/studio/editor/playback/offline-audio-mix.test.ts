import { describe, expect, it } from "vitest";

import { voicesAtSlice } from "./offline-audio-mix";
import type { CompiledClip, RenderSlice, VideoSample } from "./timeline-compiler";

function videoClip(id: string, role: VideoSample["role"]): VideoSample {
  const clip: CompiledClip = {
    clipId: id,
    assetId: id,
    trackId: `t-${id}`,
    trackIndex: 0,
    kind: "video",
    timelineStart: 0,
    timelineEnd: 4,
    sourceStart: 0,
    sourceEnd: 4,
    volume: 1,
    muted: false,
    clip: {
      id,
      trackId: `t-${id}`,
      kind: "video",
      startTime: 0,
      trimIn: 0,
      trimOut: 4,
      label: id,
      assetId: id,
    },
  };
  return { role, sourceTime: 1, clip };
}

describe("voicesAtSlice", () => {
  it("applies the same A/B dip as preview (outgoing 1-2p, incoming 2p-1)", () => {
    const slice: RenderSlice = {
      timelineTime: 1,
      video: [videoClip("a", "outgoing"), videoClip("b", "incoming")],
      transition: {
        key: "a::b",
        type: "crossfade",
        timelineStart: 0.75,
        timelineEnd: 1.25,
        cutTime: 1,
        duration: 0.5,
        outgoingClipId: "a",
        incomingClipId: "b",
        progress: 0.5,
      },
      audio: [],
      preloadAudio: [],
      text: [],
      visual: [],
      preload: [],
    };
    const voices = voicesAtSlice(slice);
    const a = voices.find((item) => item.clipId === "video:a");
    const b = voices.find((item) => item.clipId === "video:b");
    expect(a?.gain).toBe(0);
    expect(b?.gain).toBe(0);
  });

  it("skips muted beds and image lanes", () => {
    const bed: CompiledClip = {
      clipId: "bed",
      assetId: "bed",
      trackId: "t-a",
      trackIndex: 2,
      kind: "audio",
      timelineStart: 0,
      timelineEnd: 4,
      sourceStart: 0,
      sourceEnd: 4,
      volume: 1,
      muted: true,
      clip: {
        id: "bed",
        trackId: "t-a",
        kind: "audio",
        startTime: 0,
        trimIn: 0,
        trimOut: 4,
        label: "bed",
        assetId: "bed",
      },
    };
    const still = videoClip("sheet", "single");
    still.clip.kind = "image";
    still.clip.clip.kind = "image";
    const slice: RenderSlice = {
      timelineTime: 1,
      video: [still],
      transition: null,
      audio: [{ clip: bed, sourceTime: 1, gain: 1 }],
      preloadAudio: [],
      text: [],
      visual: [],
      preload: [],
    };
    expect(voicesAtSlice(slice)).toEqual([]);
  });
});
