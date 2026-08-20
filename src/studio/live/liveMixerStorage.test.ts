import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addSourceToMixer, emptyMixerState, patchSource } from "./liveMixerModel";
import {
  forgetDevicePreset,
  loadMixerState,
  loadPresetForSource,
  saveMixerState,
} from "./liveMixerStorage";

const memory = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

describe("liveMixerStorage", () => {
  beforeEach(() => {
    memory.clear();
    (globalThis as { window?: unknown }).window = { localStorage };
  });

  afterEach(() => {
    memory.clear();
  });

  it("keeps phone layout and zoom after a disconnect", () => {
    let state = addSourceToMixer(emptyMixerState(), {
      kind: "phone",
      name: "iPhone",
      deviceKey: "abc",
      sessionId: "sess_1",
      zoom: 2.4,
      rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    });
    saveMixerState(state);
    const loaded = loadMixerState();
    const phone = loaded?.sources[0];
    expect(phone?.offline).toBe(true);
    expect(phone?.sessionId).toBeUndefined();
    expect(phone?.zoom).toBe(2.4);
    expect(phone?.deviceKey).toBe("abc");
    expect(phone?.rect).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(loadPresetForSource({ kind: "phone", deviceKey: "abc" })?.zoom).toBe(2.4);
  });

  it("keeps a disconnected screen so it can share again", () => {
    let state = addSourceToMixer(emptyMixerState(), {
      kind: "screen",
      name: "Desk",
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    saveMixerState(state);
    const loaded = loadMixerState();
    const screen = loaded?.sources[0];
    expect(screen?.kind).toBe("screen");
    expect(screen?.offline).toBe(true);
    expect(screen?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("drops a device when remember is turned off", () => {
    let state = addSourceToMixer(emptyMixerState(), {
      kind: "phone",
      name: "iPhone",
      deviceKey: "abc",
      zoom: 2,
    });
    state = patchSource(state, state.sources[0]!.id, { remembered: false });
    forgetDevicePreset(state.sources[0]!);
    saveMixerState(state);
    expect(loadMixerState()?.sources).toHaveLength(0);
    expect(loadPresetForSource({ kind: "phone", deviceKey: "abc" })).toBeNull();
  });
});
