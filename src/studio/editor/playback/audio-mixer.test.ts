import { describe, expect, it, vi } from "vitest";
import { AudioMixer, transitionAudioGain } from "./audio-mixer";
import type { RenderSlice } from "./timeline-compiler";

describe("transition audio envelopes", () => {
  it("de-clicks abutting clips around the cut without hidden handles", () => {
    expect(transitionAudioGain("outgoing", 0)).toBe(1);
    expect(transitionAudioGain("outgoing", 0.25)).toBe(0.5);
    expect(transitionAudioGain("outgoing", 0.5)).toBe(0);
    expect(transitionAudioGain("incoming", 0.5)).toBe(0);
    expect(transitionAudioGain("incoming", 0.75)).toBe(0.5);
    expect(transitionAudioGain("incoming", 1)).toBe(1);
  });

  it("keeps non-transition audio at unity", () => {
    expect(transitionAudioGain("single", 0)).toBe(1);
    expect(transitionAudioGain("single", 1)).toBe(1);
  });
});

function fakeContext() {
  const gainParam = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  const gain = {
    gain: gainParam,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    currentTime: 0,
    destination: {},
    state: "running",
    sampleRate: 48_000,
    createGain: () => gain,
    createBufferSource: () => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    }),
    decodeAudioData: vi.fn(async () => {
      throw new Error("decode unavailable in unit test");
    }),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    _gainParam: gainParam,
  } as unknown as AudioContext & { _gainParam: typeof gainParam };
}

function bedSlice(assetId: string, gain = 1, fadeIn = 0): RenderSlice {
  return {
    timelineTime: 0.25,
    video: [],
    transition: null,
    audio: [
      {
        clip: {
          clipId: "bed",
          assetId,
          trackId: "track-audio",
          trackIndex: 1,
          kind: "audio",
          timelineStart: 0,
          timelineEnd: 4,
          sourceStart: 0,
          sourceEnd: 4,
          volume: 1,
          muted: false,
          clip: {
            id: "bed",
            assetId,
            trackId: "track-audio",
            startTime: 0,
            trimIn: 0,
            trimOut: 4,
            label: "bed",
            kind: "audio",
            effects: fadeIn > 0 ? { fadeIn } : undefined,
          },
        },
        sourceTime: 0.25,
        gain,
      },
    ],
    preloadAudio: [],
    text: [],
    textOver: [],
    textUnder: [],
    preload: [],
  };
}

describe("AudioMixer bed readiness", () => {
  it("reports beds not ready until a buffer is cached", () => {
    const mixer = new AudioMixer(fakeContext());
    const slice = bedSlice("a1");
    expect(mixer.bedsReady(slice)).toBe(false);
  });

  it("prepare skips beds with no URL without blocking (returns true)", async () => {
    const mixer = new AudioMixer(fakeContext());
    await expect(mixer.prepare(bedSlice("missing"), new Map())).resolves.toBe(true);
  });
});

describe("AudioMixer fade gain automation", () => {
  it("cancels prior automation and sets fade gain on sync", () => {
    const context = fakeContext();
    const mixer = new AudioMixer(context);
    const buffer = {
      duration: 4,
      length: 4 * 48_000,
      numberOfChannels: 1,
    } as unknown as AudioBuffer;
    (mixer as unknown as { buffers: Map<string, AudioBuffer> }).buffers.set("a1", buffer);

    const fadeGain = Math.sin((Math.PI / 2) * 0.25);
    mixer.sync(bedSlice("a1", fadeGain, 1), 1, new Map(), true);

    expect(context._gainParam.cancelScheduledValues).toHaveBeenCalled();
    expect(context._gainParam.setValueAtTime).toHaveBeenCalledWith(fadeGain, 0);
    expect(context._gainParam.linearRampToValueAtTime).toHaveBeenCalled();
  });
});
