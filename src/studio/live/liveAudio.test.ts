import { describe, expect, it } from "vitest";
import { isLoopbackAudioLabel } from "./liveAudio";

describe("liveAudio", () => {
  it("treats speaker monitors and virtual cables as loopback devices", () => {
    expect(isLoopbackAudioLabel("Monitor of Built-in Audio Analog Stereo")).toBe(
      true,
    );
    expect(isLoopbackAudioLabel("Stereo Mix (Realtek)")).toBe(true);
    expect(isLoopbackAudioLabel("BlackHole 2ch")).toBe(true);
    expect(isLoopbackAudioLabel("VB-Audio Cable Output")).toBe(true);
    expect(isLoopbackAudioLabel("Built-in Microphone")).toBe(false);
    expect(isLoopbackAudioLabel("USB Audio Device")).toBe(false);
  });
});
