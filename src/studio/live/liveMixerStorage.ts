import {
  emptyMixerState,
  isAudioOnlyKind,
  type LiveMixerState,
  type LiveSource,
} from "./liveMixerModel";

const MIXER_KEY = "studio-live-mixer-v1";
const PRESET_KEY = "studio-live-device-presets-v1";

export type LiveDevicePreset = Pick<
  LiveSource,
  | "name"
  | "rect"
  | "maskRect"
  | "shape"
  | "radius"
  | "opacity"
  | "shadow"
  | "border"
  | "maskBorder"
  | "volume"
  | "muted"
  | "facing"
  | "torch"
  | "mirror"
  | "zoom"
  | "zoomMin"
  | "zoomMax"
  | "zoomHardware"
  | "cameraDeviceId"
  | "cameraLabel"
  | "remembered"
  | "mediaAspect"
>;

export function devicePresetKey(
  source: Pick<LiveSource, "kind" | "deviceId" | "deviceKey" | "cameraDeviceId">,
) {
  if (source.deviceKey) return `phone:${source.deviceKey}`;
  if (source.kind === "phone" && source.deviceId) return `device:${source.deviceId}`;
  if (source.cameraDeviceId) return `camera:${source.cameraDeviceId}`;
  return null;
}

export function presetFromSource(source: LiveSource): LiveDevicePreset {
  return {
    name: source.name,
    rect: source.rect,
    maskRect: source.maskRect,
    shape: source.shape,
    radius: source.radius,
    opacity: source.opacity,
    shadow: source.shadow,
    border: source.border,
    maskBorder: source.maskBorder,
    volume: source.volume,
    muted: source.muted,
    facing: source.facing,
    torch: source.torch,
    mirror: source.mirror,
    zoom: source.zoom,
    zoomMin: source.zoomMin,
    zoomMax: source.zoomMax,
    zoomHardware: source.zoomHardware,
    cameraDeviceId: source.cameraDeviceId,
    cameraLabel: source.cameraLabel,
    remembered: source.remembered,
    mediaAspect: source.mediaAspect,
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadDevicePresets(): Record<string, LiveDevicePreset> {
  const parsed = readJson<Record<string, LiveDevicePreset>>(PRESET_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function saveDevicePreset(key: string, preset: LiveDevicePreset) {
  if (typeof window === "undefined" || !key) return;
  try {
    const all = loadDevicePresets();
    all[key] = preset;
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export function loadPresetForSource(
  source: Pick<LiveSource, "kind" | "deviceId" | "deviceKey" | "cameraDeviceId">,
) {
  const key = devicePresetKey(source);
  if (!key) return null;
  return loadDevicePresets()[key] ?? null;
}

export function persistSourcePreset(source: LiveSource) {
  if (source.remembered === false) return;
  if (source.kind !== "phone" && source.kind !== "camera") return;
  const key = devicePresetKey(source);
  if (!key) return;
  saveDevicePreset(key, presetFromSource(source));
}

export function forgetDevicePreset(
  source: Pick<LiveSource, "kind" | "deviceId" | "deviceKey" | "cameraDeviceId">,
) {
  const key = devicePresetKey(source);
  if (!key || typeof window === "undefined") return;
  try {
    const all = loadDevicePresets();
    if (!(key in all)) return;
    delete all[key];
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

function keepRememberedDevice(source: LiveSource) {
  if (source.kind !== "phone" && source.kind !== "camera") return true;
  return source.remembered !== false;
}

function sanitizeMixer(state: LiveMixerState): LiveMixerState {
  const sources = state.sources.filter(keepRememberedDevice).map((source) => {
    if (source.kind === "screen" || isAudioOnlyKind(source.kind)) {
      return { ...source, offline: true };
    }
    if (source.kind !== "phone" && source.kind !== "camera") return source;
    return {
      ...source,
      sessionId: undefined,
      offline: true,
      remembered: true,
    };
  });
  const kept = new Set(sources.map((source) => source.id));
  return {
    ...state,
    selectedFocus: state.selectedFocus ?? "video",
    sources,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      sourceIds: scene.sourceIds.filter((id) => kept.has(id)),
    })),
  };
}

export function loadMixerState(): LiveMixerState | null {
  const parsed = readJson<LiveMixerState | null>(MIXER_KEY, null);
  if (!parsed || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.sources)) {
    return null;
  }
  if (!parsed.scenes.length) return emptyMixerState();
  return sanitizeMixer(parsed);
}

export function saveMixerState(state: LiveMixerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIXER_KEY, JSON.stringify(sanitizeMixer(state)));
  } catch {
    /* quota */
  }
  for (const source of state.sources) persistSourcePreset(source);
}
