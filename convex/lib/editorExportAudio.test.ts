import { describe, expect, it } from "vitest";
import {
  collectExportAudioBeds,
  exportCoverUntilSec,
  videoClipAudioFilter,
} from "./editorExportAudio";

describe("export audio mute / volume / fade", () => {
  it("silences muted video tracks", () => {
    expect(videoClipAudioFilter({}, true)).toBeNull();
  });

  it("silences near-zero volume", () => {
    expect(videoClipAudioFilter({ effects: { volume: 0 } }, false)).toBeNull();
  });

  it("allows boost up to 200%", () => {
    expect(videoClipAudioFilter({ effects: { volume: 2 } }, false)).toContain(
      "volume=2",
    );
    expect(
      videoClipAudioFilter({ effects: { volume: 2.5 } }, false),
    ).toContain("volume=2");
  });

  it("keeps default volume without a volume filter", () => {
    expect(videoClipAudioFilter({}, false)).toBe(
      "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo",
    );
  });

  it("applies afade from audioFadeIn/Out, not picture fadeIn/Out", () => {
    const af = videoClipAudioFilter(
      {
        effects: { fadeIn: 2, fadeOut: 2, audioFadeIn: 0.5, audioFadeOut: 1 },
        trimIn: 0,
        trimOut: 4,
      },
      false,
      4,
    );
    expect(af).toContain("afade=t=in:st=0:d=0.5:curve=qsin");
    expect(af).toContain("afade=t=out:st=3:d=1:curve=qsin");
  });

  it("ignores picture-only fades on video audio export", () => {
    const af = videoClipAudioFilter(
      {
        effects: { fadeIn: 0.5, fadeOut: 1 },
        trimIn: 0,
        trimOut: 4,
      },
      false,
      4,
    );
    expect(af).not.toContain("afade=");
  });

  it("ignores draft speed on export (Process bakes a 1× asset)", () => {
    const af = videoClipAudioFilter(
      {
        effects: { speed: 1.1 },
        trimIn: 0,
        trimOut: 4,
      },
      false,
    );
    expect(af).not.toContain("atempo=");
    expect(af).toContain("aresample=44100");
  });
});

describe("collectExportAudioBeds", () => {
  const project = {
    tracks: [
      { id: "track-video", kind: "video" },
      { id: "track-audio", kind: "audio" },
      { id: "track-audio-2", kind: "audio" },
      { id: "track-audio-3", kind: "audio", muted: true },
    ],
    clips: [
      {
        id: "v1",
        kind: "video",
        trackId: "track-video",
        assetId: "a-video",
        startTime: 0,
      },
      {
        id: "bed1",
        kind: "audio",
        trackId: "track-audio",
        assetId: "a-bed1",
        startTime: 2,
      },
      {
        id: "detached",
        kind: "audio",
        trackId: "track-audio-2",
        assetId: "a-video",
        startTime: 0,
        effects: { volume: 1 },
      },
      {
        id: "muted-lane",
        kind: "audio",
        trackId: "track-audio-3",
        assetId: "a-muted",
        startTime: 0,
      },
      {
        id: "silent-bed",
        kind: "audio",
        trackId: "track-audio",
        assetId: "a-silent",
        startTime: 1,
        effects: { volume: 0 },
      },
    ],
  };

  it("includes detached beds on Audio 2+, not only the first Audio lane", () => {
    expect(collectExportAudioBeds(project).map((c) => c.id)).toEqual([
      "detached",
      "bed1",
    ]);
  });

  it("skips muted lanes and near-zero volume beds", () => {
    const ids = collectExportAudioBeds(project).map((c) => c.id);
    expect(ids).not.toContain("muted-lane");
    expect(ids).not.toContain("silent-bed");
    expect(ids).not.toContain("v1");
  });
});

describe("exportCoverUntilSec", () => {
  it("extends past the last video for trailing audio beds", () => {
    expect(
      exportCoverUntilSec({
        textEnds: [4],
        audioClips: [
          { startTime: 3, trimIn: 0, trimOut: 5 },
          { startTime: 0, trimIn: 0, trimOut: 2 },
        ],
      }),
    ).toBe(8);
  });

  it("covers audio-only timelines with no video", () => {
    expect(
      exportCoverUntilSec({
        audioClips: [{ startTime: 1, trimIn: 0, trimOut: 4 }],
      }),
    ).toBe(5);
  });
});
