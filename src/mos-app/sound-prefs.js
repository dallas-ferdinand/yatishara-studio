/** UI sound preferences — localStorage-backed, respects reduced motion. */
export const UI_SOUND_PREFS_KEY = "mercuryos.uiSounds.v1";
export const LEGACY_SOUND_KEY = "mercuryos-sounds-v1";

/** @typedef {{ enabled: boolean, volume: number }} UiSoundPrefs */

/** @type {UiSoundPrefs} */
export const DEFAULT_UI_SOUND_PREFS = {
  enabled: true,
  volume: 0.42,
};

/** @returns {UiSoundPrefs} */
export function readUiSoundPrefs() {
  if (typeof window === "undefined") return DEFAULT_UI_SOUND_PREFS;
  try {
    const raw = window.localStorage.getItem(UI_SOUND_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const volume =
        typeof parsed.volume === "number"
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_UI_SOUND_PREFS.volume;
      return {
        enabled:
          typeof parsed.enabled === "boolean"
            ? parsed.enabled
            : DEFAULT_UI_SOUND_PREFS.enabled,
        volume,
      };
    }
    const legacy = window.localStorage.getItem(LEGACY_SOUND_KEY);
    if (legacy === "off") return { enabled: false, volume: DEFAULT_UI_SOUND_PREFS.volume };
    if (legacy === "on") return DEFAULT_UI_SOUND_PREFS;
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_SOUND_PREFS;
}

/** @param {UiSoundPrefs} prefs */
export function writeUiSoundPrefs(prefs) {
  if (typeof window === "undefined") return;
  const next = {
    enabled: prefs.enabled,
    volume: Math.min(1, Math.max(0, prefs.volume)),
  };
  window.localStorage.setItem(UI_SOUND_PREFS_KEY, JSON.stringify(next));
  window.localStorage.setItem(LEGACY_SOUND_KEY, next.enabled ? "on" : "off");
}

export function uiSoundsReducedBySystem() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
