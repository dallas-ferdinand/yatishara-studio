import { describe, expect, it } from "vitest";
import {
  applyTextCase,
  buildTextOverlayFilter,
  collectExportTextClips,
  ffmpegFailMessage,
  hexToFfmpegColor,
  normalizeTextPose,
} from "./editorExportText";

describe("collectExportTextClips", () => {
  it("keeps every text clip, not only the first track", () => {
    const clips = collectExportTextClips([
      { id: "v1", kind: "video", startTime: 0, trimIn: 0, trimOut: 4 },
      {
        id: "t1",
        kind: "text",
        startTime: 0,
        trimIn: 0,
        trimOut: 3,
        text: { text: "Hello" },
      },
      {
        id: "t2",
        kind: "text",
        startTime: 2,
        trimIn: 0,
        trimOut: 2,
        text: { text: "World" },
      },
    ]);
    expect(clips.map((c) => c.id)).toEqual(["t1", "t2"]);
  });

  it("skips empty text", () => {
    expect(
      collectExportTextClips([
        { id: "t1", kind: "text", startTime: 0, trimIn: 0, trimOut: 2, text: { text: "  " } },
      ]),
    ).toEqual([]);
  });
});

describe("buildTextOverlayFilter", () => {
  it("uses textfile so quotes and percents cannot break the graph", () => {
    const built = buildTextOverlayFilter({
      clip: {
        id: "t1",
        startTime: 0,
        duration: 3,
        text: { text: `Sale 50% — "today"` },
      },
      segmentStart: 0,
      segmentDuration: 4,
      fontfile: "/tmp/Inter.ttf",
      textFileName: "/tmp/t1.txt",
    });
    expect(built?.textFileBody).toBe(`Sale 50% — "today"`);
    expect(built?.filter).toContain("textfile='/tmp/t1.txt'");
    expect(built?.filter).toContain("expansion=none");
    expect(built?.filter).not.toContain("text='Sale");
  });

  it("returns null when the overlay does not overlap the segment", () => {
    expect(
      buildTextOverlayFilter({
        clip: { id: "t1", startTime: 8, duration: 2, text: { text: "Hi" } },
        segmentStart: 0,
        segmentDuration: 4,
        fontfile: null,
        textFileName: "/tmp/t1.txt",
      }),
    ).toBeNull();
  });

  it("applies rotation as a clockwise editor angle", () => {
    const built = buildTextOverlayFilter({
      clip: {
        id: "t1",
        startTime: 0,
        duration: 2,
        effects: { rotation: 90 },
        text: { text: "Hi" },
      },
      segmentStart: 0,
      segmentDuration: 2,
      fontfile: null,
      textFileName: "/tmp/t1.txt",
    });
    expect(built?.filter).toMatch(/angle=-1\.5708/);
    expect(built?.filter).toContain("fontcolor=0xffffff");
  });
});

describe("helpers", () => {
  it("normalizes missing pose to the lower-third default", () => {
    expect(normalizeTextPose(undefined)).toEqual({
      scale: 1,
      x: 0,
      y: 0.32,
      rotation: 0,
    });
  });

  it("applies text case", () => {
    expect(applyTextCase("hello world", "title")).toBe("Hello World");
  });

  it("encodes hex with alpha", () => {
    expect(hexToFfmpegColor("#ff0000", 1)).toBe("0xff0000");
    expect(hexToFfmpegColor("#ff0000", 0.5)).toBe("0xff000080");
  });

  it("surfaces drawtext failures from ffmpeg stderr", () => {
    expect(
      ffmpegFailMessage(
        { stderr: "Error initializing filter 'drawtext'\nNo such file or directory\n" },
        "Export failed",
      ),
    ).toMatch(/Text overlay export failed/);
  });
});
