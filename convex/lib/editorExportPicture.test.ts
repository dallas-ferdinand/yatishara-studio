import { describe, expect, it } from "vitest";
import {
  clipSourceInputArgs,
  isStillExportSource,
  isStillImageCodec,
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
