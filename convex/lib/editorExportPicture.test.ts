import { describe, expect, it } from "vitest";
import {
  clipSourceInputArgs,
  collectExportPictureClips,
  exportVisualStackBottomToTop,
  isStillExportSource,
  isStillImageCodec,
  pictureFadeFilterParts,
  pictureTimelineSegments,
  safeContainVf,
  segmentTransitionClip,
  type PictureTimelineSegment,
} from "./editorExportPicture";

describe("isStillImageCodec", () => {
  it("treats png/webp/mjpeg as stills", () => {
    expect(isStillImageCodec("png")).toBe(true);
    expect(isStillImageCodec("webp")).toBe(true);
    expect(isStillImageCodec("mjpeg")).toBe(true);
    expect(isStillImageCodec("h264")).toBe(false);
  });
});

describe("isStillExportSource", () => {
  it("honors clip.kind image even when the file looks like a movie", () => {
    expect(isStillExportSource({ kind: "image", codec: "h264", nbFrames: 48 })).toBe(
      true,
    );
  });

  it("treats a single-frame probe as a still", () => {
    expect(isStillExportSource({ codec: "h264", nbFrames: 1 })).toBe(true);
  });

  it("treats a sub-frame mp4 (N/A frame count) as a still", () => {
    expect(isStillExportSource({ codec: "h264", sourceDurationSec: 0.04 })).toBe(
      true,
    );
    expect(isStillExportSource({ codec: "h264", sourceDurationSec: 8 })).toBe(
      false,
    );
  });
});

describe("clipSourceInputArgs", () => {
  it("loops stills at export fps", () => {
    expect(
      clipSourceInputArgs({
        sourcePath: "/tmp/still.bin",
        trimIn: 0,
        sourceLen: 4,
        identitySpeed: true,
        isStill: true,
        fps: 30,
      }),
    ).toEqual(["-loop", "1", "-framerate", "30", "-i", "/tmp/still.bin"]);
  });

  it("seeks movies from trimIn", () => {
    expect(
      clipSourceInputArgs({
        sourcePath: "/tmp/clip.bin",
        trimIn: 1.25,
        sourceLen: 3,
        identitySpeed: true,
        isStill: false,
      }),
    ).toEqual(["-ss", "1.25", "-i", "/tmp/clip.bin"]);
  });
});

describe("safeContainVf", () => {
  it("forces even dimensions for yuv420p", () => {
    expect(safeContainVf(1920, 1080)).toContain("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    expect(safeContainVf(1920, 1080)).toContain("pad=1920:1080");
  });
});

describe("collectExportPictureClips / pictureTimelineSegments", () => {
  it("stacks overlapping lanes bottom-to-top across cut points", () => {
    const project = {
      tracks: [
        { id: "v1", kind: "video" },
        { id: "v2", kind: "video" },
        { id: "v3", kind: "video" },
        { id: "a1", kind: "audio" },
      ],
      clips: [
        {
          id: "top",
          assetId: "a-top",
          trackId: "v1",
          startTime: 0,
          trimIn: 0,
          trimOut: 4,
          label: "top",
          kind: "image",
        },
        {
          id: "mid",
          assetId: "a-mid",
          trackId: "v2",
          startTime: 1,
          trimIn: 0,
          trimOut: 2,
          label: "mid",
          kind: "video",
        },
        {
          id: "bot",
          assetId: "a-bot",
          trackId: "v3",
          startTime: 0,
          trimIn: 0,
          trimOut: 5,
          label: "bot",
          kind: "video",
        },
      ],
    };
    const clips = collectExportPictureClips(project);
    expect(clips.map((c) => c.id)).toEqual(["top", "bot", "mid"]);
    const segments = pictureTimelineSegments(clips, 0);
    // 0-1: bot+top; 1-3: bot+mid+top; 3-4: bot+top; 4-5: bot
    expect(segments).toHaveLength(4);
    expect(segments[0]).toMatchObject({ type: "layers", startTime: 0, duration: 1 });
    expect((segments[0] as { layers: Array<{ id: string }> }).layers.map((l) => l.id)).toEqual([
      "bot",
      "top",
    ]);
    expect((segments[1] as { layers: Array<{ id: string }> }).layers.map((l) => l.id)).toEqual([
      "bot",
      "mid",
      "top",
    ]);
    expect((segments[2] as { layers: Array<{ id: string }> }).layers.map((l) => l.id)).toEqual([
      "bot",
      "top",
    ]);
    expect((segments[3] as { layers: Array<{ id: string }> }).layers.map((l) => l.id)).toEqual([
      "bot",
    ]);
  });
});

describe("pictureFadeFilterParts", () => {
  it("fades an unsplit clip from its own start", () => {
    expect(
      pictureFadeFilterParts({
        effects: { fadeIn: 1, fadeOut: 0.5 },
        clipDurationSec: 4,
        localStartSec: 0,
        segmentDurationSec: 4,
      }),
    ).toEqual(["fade=t=in:st=0:d=1.000", "fade=t=out:st=3.500:d=0.500"]);
  });

  it("keeps fade timing clip-relative when a lane splits the clip", () => {
    // Tail piece of a 4s clip: only the fade-out belongs here, at 3.5s into the clip.
    expect(
      pictureFadeFilterParts({
        effects: { fadeIn: 1, fadeOut: 0.5 },
        clipDurationSec: 4,
        localStartSec: 2,
        segmentDurationSec: 2,
      }),
    ).toEqual([
      "setpts=PTS+2.0000/TB",
      "fade=t=out:st=3.500:d=0.500",
      "setpts=PTS-2.0000/TB",
    ]);
  });

  it("does not restart the fade-in on a piece that starts mid-fade", () => {
    const parts = pictureFadeFilterParts({
      effects: { fadeIn: 2 },
      clipDurationSec: 6,
      localStartSec: 0.5,
      segmentDurationSec: 1,
    });
    expect(parts[0]).toBe("setpts=PTS+0.5000/TB");
    expect(parts).toContain("fade=t=in:st=0:d=2.000");
  });

  it("emits nothing for a middle piece with no fade in range", () => {
    expect(
      pictureFadeFilterParts({
        effects: { fadeIn: 0.5, fadeOut: 0.5 },
        clipDurationSec: 10,
        localStartSec: 3,
        segmentDurationSec: 2,
      }),
    ).toEqual([]);
  });

  it("fades overlay alpha so the lane underneath shows through", () => {
    expect(
      pictureFadeFilterParts({
        effects: { fadeIn: 1 },
        clipDurationSec: 3,
        localStartSec: 0,
        segmentDurationSec: 3,
        overlay: true,
      }),
    ).toEqual(["fade=t=in:st=0:d=1.000:alpha=1"]);
  });

  it("scales a fade pair that is longer than the clip", () => {
    const parts = pictureFadeFilterParts({
      effects: { fadeIn: 3, fadeOut: 3 },
      clipDurationSec: 2,
      localStartSec: 0,
      segmentDurationSec: 2,
    });
    expect(parts).toEqual(["fade=t=in:st=0:d=1.000", "fade=t=out:st=1.000:d=1.000"]);
  });
});

describe("segmentTransitionClip", () => {
  const layer = {
    id: "c1",
    assetId: "a1",
    trackId: "v1",
    trackIndex: 0,
    startTime: 2,
    trimIn: 0,
    trimOut: 3,
    label: "c1",
    kind: "video",
    transitionOut: { type: "fade", duration: 0.5 },
  };

  it("carries the transition on the piece that ends where the clip ends", () => {
    const segment: PictureTimelineSegment = {
      type: "layers",
      startTime: 3,
      duration: 2,
      layers: [layer],
    };
    expect(segmentTransitionClip(segment)?.id).toBe("c1");
  });

  it("skips a piece that ends mid-clip", () => {
    expect(
      segmentTransitionClip({
        type: "layers",
        startTime: 2,
        duration: 1,
        layers: [layer],
      }),
    ).toBeNull();
  });

  it("hard-cuts a stack instead of dragging overlays through the wipe", () => {
    expect(
      segmentTransitionClip({
        type: "layers",
        startTime: 3,
        duration: 2,
        layers: [layer, { ...layer, id: "c2", trackId: "v2", trackIndex: 1 }],
      }),
    ).toBeNull();
  });

  it("ignores none/absent transitions and gaps", () => {
    expect(
      segmentTransitionClip({
        type: "layers",
        startTime: 3,
        duration: 2,
        layers: [{ ...layer, transitionOut: { type: "none" } }],
      }),
    ).toBeNull();
    expect(segmentTransitionClip({ type: "gap", startTime: 0, duration: 1 })).toBeNull();
  });
});

describe("exportVisualStackBottomToTop", () => {
  it("places text between two pictures when its track sits between them", () => {
    const top = {
      id: "sheet",
      assetId: "a-sheet",
      trackId: "v-top",
      trackIndex: 0,
      startTime: 0,
      trimIn: 0,
      trimOut: 4,
      label: "sheet",
      kind: "image",
    };
    const bot = {
      id: "movie",
      assetId: "a-movie",
      trackId: "v-bot",
      trackIndex: 2,
      startTime: 0,
      trimIn: 0,
      trimOut: 4,
      label: "movie",
      kind: "video",
    };
    const title = {
      id: "title",
      startTime: 0,
      duration: 4,
      trackId: "t-mid",
      trackIndex: 1,
      text: { text: "BETWEEN" },
    };
    expect(
      exportVisualStackBottomToTop([bot, top], [title], 0, 4).map((item) => item.clip.id),
    ).toEqual(["movie", "title", "sheet"]);
  });
});
