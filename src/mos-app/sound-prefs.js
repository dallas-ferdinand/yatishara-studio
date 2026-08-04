/** UI sound preferences — localStorage-backed, respects reduced motion. */
export const UI_SOUND_PREFS_KEY = "mercuryos.uiSounds.v2";
export const LEGACY_SOUND_KEY = "mercuryos-sounds-v1";
export const LEGACY_SOUND_PREFS_V1 = "mercuryos.uiSounds.v1";

/** @typedef {{ taps: boolean, messaging: boolean, social: boolean, feedback: boolean }} UiSoundCategories */
/** @typedef {{ enabled: boolean, volume: number, categories: UiSoundCategories }} UiSoundPrefs */

/** @type {UiSoundCategories} */
export const DEFAULT_UI_SOUND_CATEGORIES = {
  taps: true,
  messaging: true,
  social: true,
  feedback: true,
};

/** @type {UiSoundPrefs} */
export const DEFAULT_UI_SOUND_PREFS = {
  enabled: true,
  volume: 0.48,
  categories: { ...DEFAULT_UI_SOUND_CATEGORIES },
};

/** Map sound ids → category for per-type mute. */
export const UI_SOUND_CATEGORY_BY_ID = {
  tap: "taps",
  button: "taps",
  select: "taps",
  key: "taps",
  pop: "taps",
  toggle: "taps",
  nav: "taps",
  navBack: "taps",
  sheet: "taps",
  shuffle: "taps",
  send: "messaging",
  message: "messaging",
  like: "social",
  unlike: "social",
  save: "social",
  unsave: "social",
  follow: "social",
  unfollow: "social",
  share: "social",
  success: "feedback",
  error: "feedback",
  notify: "feedback",
  lock: "feedback",
};

function normalizeCategories(raw) {
  const next = { ...DEFAULT_UI_SOUND_CATEGORIES };
  if (!raw || typeof raw !== "object") return next;
  for (const key of Object.keys(next)) {
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  }
  return next;
}

/** @returns {UiSoundPrefs} */
export function readUiSoundPrefs() {
  if (typeof window === "undefined") return DEFAULT_UI_SOUND_PREFS;
  try {
    const raw =
      window.localStorage.getItem(UI_SOUND_PREFS_KEY) ||
      window.localStorage.getItem(LEGACY_SOUND_PREFS_V1);
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
        categories: normalizeCategories(parsed.categories),
      };
    }
    const legacy = window.localStorage.getItem(LEGACY_SOUND_KEY);
    if (legacy === "off") {
      return {
        enabled: false,
        volume: DEFAULT_UI_SOUND_PREFS.volume,
        categories: { ...DEFAULT_UI_SOUND_CATEGORIES },
      };
    }
    if (legacy === "on") return { ...DEFAULT_UI_SOUND_PREFS };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_UI_SOUND_PREFS, categories: { ...DEFAULT_UI_SOUND_CATEGORIES } };
}

/** @param {UiSoundPrefs} prefs */
export function writeUiSoundPrefs(prefs) {
  if (typeof window === "undefined") return;
  const next = {
    enabled: prefs.enabled,
    volume: Math.min(1, Math.max(0, prefs.volume)),
    categories: normalizeCategories(prefs.categories),
  };
  window.localStorage.setItem(UI_SOUND_PREFS_KEY, JSON.stringify(next));
  window.localStorage.setItem(LEGACY_SOUND_KEY, next.enabled ? "on" : "off");
}

export function uiSoundsReducedBySystem() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @param {string} id @param {UiSoundPrefs} [prefs] */
export function uiSoundCategoryEnabled(id, prefs = readUiSoundPrefs()) {
  const category = UI_SOUND_CATEGORY_BY_ID[id];
  if (!category) return true;
  return Boolean(prefs.categories?.[category] ?? true);
}
