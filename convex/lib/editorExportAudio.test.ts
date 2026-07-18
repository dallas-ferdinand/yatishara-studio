import { describe, expect, it } from "vitest";
import { videoClipAudioFilter } from "./editorExportAudio";

describe("export audio mute / volume", () => {
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
});
