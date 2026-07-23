import { describe, expect, it } from "vitest";
import { videoClipAudioFilter } from "./editorExportAudio";

describe("export audio mute / volume / fade", () => {
  it("silences muted video tracks", () => {
    expect(videoClipAudioFilter({}, true)).toBeNull();
  });

  it("silences near-zero volume", () => {
    expect(videoClipAudioFilter({ effects: { volume: 0 } }, false)).toBeNull();
  });

  it("applies video clip volume when audible", () => {
    expect(videoClipAudioFilter({ effects: { volume: 0.5 } }, false)).toContain(
      "volume=0.5",
    );
  });

  it("keeps default volume without a volume filter", () => {
    expect(videoClipAudioFilter({}, false)).toBe(
      "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo",
    );
  });

  it("applies afade in/out from clip effects", () => {
    const af = videoClipAudioFilter(
      {
        effects: { fadeIn: 0.5, fadeOut: 1 },
        trimIn: 0,
        trimOut: 4,
      },
      false,
      4,
    );
    expect(af).toContain("afade=t=in:st=0:d=0.5:curve=qsin");
    expect(af).toContain("afade=t=out:st=3:d=1:curve=qsin");
  });
});
