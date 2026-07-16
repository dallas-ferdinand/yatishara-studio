/** Wallpaper preference — localStorage model for wallpaper-first themes. */

import {
  normalizeStudioBackgroundFamily,
  type StudioBackgroundFamily,
  type StudioThemeId,
  STUDIO_THEME_IDS,
} from "@/studio/lib/studio-background-registry";

export const WALLPAPER_KEY = "mercuryos-wallpaper-v1";
export const SCHEME_KEY = "mercuryos-theme-v1";
export const MODE_KEY = "mercuryos-appearance-v1";
export const STUDIO_BG_PACK_KEY = "mercuryos-studio-bg-pack-v1";

export type WallpaperRef =
  | { kind: "preset"; family: StudioBackgroundFamily; themeId: string }
  | { kind: "asset"; assetId: string };

export type WallpaperPalette = {
  accent: string;
  bg?: string;
  surface?: string;
  raised?: string;
};

export type WallpaperState = {
  current: WallpaperRef;
  savedAssetIds: string[];
  palettes: Record<string, WallpaperPalette>;
  urlHints: Record<string, string>;
};

export const DEFAULT_WALLPAPER = {
  kind: "preset" as const,
  family: "animated" as const,
  themeId: "agent",
};

export function wallpaperKey(ref: WallpaperRef): string {
  if (ref.kind === "preset") return `preset:${ref.family}:${ref.themeId}`;
  return `asset:${ref.assetId}`;
}

export function isValidThemeId(id: string): id is StudioThemeId {
  return (STUDIO_THEME_IDS as readonly string[]).includes(id);
}

function defaultStateFromLegacy(): WallpaperState {
  const themeRaw = typeof localStorage !== "undefined" ? localStorage.getItem(SCHEME_KEY) : null;
  const themeId =
    themeRaw && themeRaw !== "light" && isValidThemeId(themeRaw) ? themeRaw : "agent";
  const family = normalizeStudioBackgroundFamily(
    typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_BG_PACK_KEY) : null,
  );
  const current: WallpaperRef = { kind: "preset", family, themeId };
  const palettes: Record<string, WallpaperPalette> = {};
  return {
    current,
    savedAssetIds: [],
    palettes,
    urlHints: {},
  };
}

function parseRef(raw: unknown): WallpaperRef | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "preset") {
    const family = normalizeStudioBackgroundFamily(
      typeof obj.family === "string" ? obj.family : null,
    );
    const themeId =
      typeof obj.themeId === "string" && isValidThemeId(obj.themeId) ? obj.themeId : "agent";
    return { kind: "preset", family, themeId };
  }
  if (obj.kind === "asset" && typeof obj.assetId === "string" && obj.assetId.length > 0) {
    return { kind: "asset", assetId: obj.assetId };
  }
  return null;
}

function sanitizeState(raw: unknown): WallpaperState {
  const fallback = defaultStateFromLegacy();
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const current = parseRef(obj.current) ?? fallback.current;
  const savedAssetIds = Array.isArray(obj.savedAssetIds)
    ? [...new Set(obj.savedAssetIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  const palettes: Record<string, WallpaperPalette> = {};
  if (obj.palettes && typeof obj.palettes === "object") {
    for (const [key, value] of Object.entries(obj.palettes as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const p = value as Record<string, unknown>;
      if (typeof p.accent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(p.accent)) continue;
      palettes[key] = {
        accent: p.accent,
        ...(typeof p.bg === "string" ? { bg: p.bg } : {}),
        ...(typeof p.surface === "string" ? { surface: p.surface } : {}),
        ...(typeof p.raised === "string" ? { raised: p.raised } : {}),
      };
    }
  }
  const urlHints: Record<string, string> = {};
  if (obj.urlHints && typeof obj.urlHints === "object") {
    for (const [key, value] of Object.entries(obj.urlHints as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) urlHints[key] = value;
    }
  }
  return { current, savedAssetIds, palettes, urlHints };
}

export function readWallpaperState(): WallpaperState {
  if (typeof localStorage === "undefined") return defaultStateFromLegacy();
  try {
    const raw = localStorage.getItem(WALLPAPER_KEY);
    if (!raw) {
      const migrated = defaultStateFromLegacy();
      writeWallpaperState(migrated);
      return migrated;
    }
    return sanitizeState(JSON.parse(raw));
  } catch {
    return defaultStateFromLegacy();
  }
}

export function writeWallpaperState(state: WallpaperState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(WALLPAPER_KEY, JSON.stringify(state));
  // Keep legacy keys in sync for boot / older readers.
  if (state.current.kind === "preset") {
    localStorage.setItem(SCHEME_KEY, state.current.themeId);
    localStorage.setItem(STUDIO_BG_PACK_KEY, state.current.family);
  }
}

export function getCurrentWallpaper(): WallpaperRef {
  return readWallpaperState().current;
}

export function getCachedPalette(ref: WallpaperRef): WallpaperPalette | null {
  const state = readWallpaperState();
  return state.palettes[wallpaperKey(ref)] ?? null;
}

export function setCachedPalette(ref: WallpaperRef, palette: WallpaperPalette): void {
  const state = readWallpaperState();
  state.palettes[wallpaperKey(ref)] = palette;
  writeWallpaperState(state);
}

export function getUrlHint(ref: WallpaperRef): string | null {
  if (ref.kind !== "asset") return null;
  const state = readWallpaperState();
  return state.urlHints[wallpaperKey(ref)] ?? null;
}

export function setUrlHint(assetId: string, url: string): void {
  const state = readWallpaperState();
  state.urlHints[wallpaperKey({ kind: "asset", assetId })] = url;
  writeWallpaperState(state);
}

export function clearUrlHint(assetId: string): void {
  const state = readWallpaperState();
  delete state.urlHints[wallpaperKey({ kind: "asset", assetId })];
  writeWallpaperState(state);
}

export function updateWallpaperCurrent(ref: WallpaperRef): WallpaperState {
  const state = readWallpaperState();
  state.current = ref;
  if (ref.kind === "asset" && !state.savedAssetIds.includes(ref.assetId)) {
    state.savedAssetIds = [...state.savedAssetIds, ref.assetId];
  }
  writeWallpaperState(state);
  return state;
}

export function pinSavedAsset(assetId: string): void {
  const state = readWallpaperState();
  if (!state.savedAssetIds.includes(assetId)) {
    state.savedAssetIds = [...state.savedAssetIds, assetId];
    writeWallpaperState(state);
  }
}

export function unpinSavedAsset(assetId: string): WallpaperState {
  const state = readWallpaperState();
  state.savedAssetIds = state.savedAssetIds.filter((id) => id !== assetId);
  delete state.urlHints[wallpaperKey({ kind: "asset", assetId })];
  if (state.current.kind === "asset" && state.current.assetId === assetId) {
    state.current = { ...DEFAULT_WALLPAPER };
  }
  writeWallpaperState(state);
  return state;
}

export function dropMissingAsset(assetId: string): WallpaperState {
  const state = readWallpaperState();
  state.savedAssetIds = state.savedAssetIds.filter((id) => id !== assetId);
  delete state.urlHints[wallpaperKey({ kind: "asset", assetId })];
  delete state.palettes[wallpaperKey({ kind: "asset", assetId })];
  if (state.current.kind === "asset" && state.current.assetId === assetId) {
    state.current = { ...DEFAULT_WALLPAPER };
  }
  writeWallpaperState(state);
  return state;
}
