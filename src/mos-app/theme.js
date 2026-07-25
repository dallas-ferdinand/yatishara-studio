import { applyStudioBackgroundNow, resolveWallpaperImageUrl } from "@/studio/lib/studio-background-apply";
import { extractWallpaperPalette } from "@/studio/lib/extract-wallpaper-palette";
import { getStudioBackgroundBootInlineFragment } from "@/studio/lib/studio-background-registry";
import {
  DEFAULT_WALLPAPER,
  MODE_KEY,
  SCHEME_KEY,
  STUDIO_BG_PACK_KEY,
  dropMissingAsset,
  getCachedPalette,
  getCurrentWallpaper,
  pinSavedAsset,
  readWallpaperState,
  setCachedPalette,
  setUrlHint,
  unpinSavedAsset,
  updateWallpaperCurrent,
  writeWallpaperState,
} from "@/studio/lib/wallpaper-state";

/** Appearance mode (light/dark) + accent color schemes — CSS variables on :root */

export const SCHEMES = {
  agent: {
    label: "Genesis",
    accent: "#22c55e",
    bg: "#05080f",
    surface: "#0a1018",
    raised: "#101820",
  },
  gold: {
    label: "Archive",
    accent: "#c4a574",
    bg: "#0a0b10",
    surface: "#12131a",
    raised: "#181922",
  },
  ocean: {
    label: "Ocean",
    accent: "#38bdf8",
    bg: "#05080c",
    surface: "#0a121c",
    raised: "#101a28",
  },
  ember: {
    label: "Forge",
    accent: "#fb923c",
    bg: "#080605",
    surface: "#120e0a",
    raised: "#1a1410",
  },
  mint: {
    label: "Meadow",
    accent: "#4ade80",
    bg: "#050807",
    surface: "#0a1410",
    raised: "#101c16",
  },
  violet: {
    label: "Dusk",
    accent: "#c084fc",
    bg: "#07060a",
    surface: "#100c18",
    raised: "#161022",
  },
  rose: {
    label: "Bloom",
    accent: "#fb7185",
    bg: "#0a0607",
    surface: "#140c0e",
    raised: "#1c1216",
  },
  cobalt: {
    label: "Skyline",
    accent: "#60a5fa",
    bg: "#05070c",
    surface: "#0a101c",
    raised: "#101828",
  },
  coral: {
    label: "Reef",
    accent: "#f472b6",
    bg: "#0a0608",
    surface: "#140c12",
    raised: "#1c121a",
  },
  sage: {
    label: "Grove",
    accent: "#86efac",
    bg: "#050806",
    surface: "#0c1410",
    raised: "#121c16",
  },
  cherry: {
    label: "Pulse",
    accent: "#f87171",
    bg: "#080505",
    surface: "#140a0a",
    raised: "#1c1010",
  },
  teal: {
    label: "Lagoon",
    accent: "#2dd4bf",
    bg: "#050808",
    surface: "#0a1412",
    raised: "#101c1a",
  },
  lime: {
    label: "Canopy",
    accent: "#a3e635",
    bg: "#060805",
    surface: "#10140a",
    raised: "#161c0e",
  },
  fuchsia: {
    label: "Neon",
    accent: "#e879f9",
    bg: "#08050a",
    surface: "#120a16",
    raised: "#1a1020",
  },
  copper: {
    label: "Foundry",
    accent: "#d97706",
    bg: "#080605",
    surface: "#120e0a",
    raised: "#1a1410",
  },
  indigo: {
    label: "Midnight",
    accent: "#818cf8",
    bg: "#06050a",
    surface: "#0c0a16",
    raised: "#12101e",
  },
};

export const STUDIO_BACKGROUND_FAMILIES = {
  animated: {
    label: "Animated",
    description: "Illustrated cartoon matte environments (dark + light)",
  },
  cinematic: {
    label: "Cinematic",
    description: "Photoreal film-set moods (dark + light)",
  },
};

/** @deprecated use STUDIO_BACKGROUND_FAMILIES */
export const STUDIO_BACKGROUND_PACKS = {
  animated: { label: "Animated" },
  worlds: { label: "Scenes" },
  clean: { label: "Clean" },
};

const BG_FAMILY_MIGRATION = {
  worlds: "animated",
  space: "animated",
  animated: "animated",
  cinematic: "cinematic",
  spacey: "animated",
  scenic: "animated",
  clean: "animated",
};

function normalizeBgFamily(id) {
  if (!id) return "animated";
  return BG_FAMILY_MIGRATION[id] ?? (STUDIO_BACKGROUND_FAMILIES[id] ? id : "animated");
}

const LIGHT_BASE = {
  // Soft light chrome: no pure white; L3 (raised) reads clearly darker than L2 plate.
  bg: "#ececf0",
  surface: "#f5f5f7",
  raised: "#d4d4da",
  text: "#1c1c1e",
  textMuted: "#636366",
  textFaint: "#8e8e93",
  border: "rgba(0,0,0,0.11)",
  borderSoft: "rgba(0,0,0,0.075)",
  hover: "#e6e6ec",
  active: "#c8c8d0",
};

function parseHex(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixHex(a, b, t) {
  const c1 = parseHex(a);
  const c2 = parseHex(b);
  const f = (x, y) => Math.round(x + (y - x) * t);
  return `#${[f(c1.r, c2.r), f(c1.g, c2.g), f(c1.b, c2.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lighten(hex, amt = 0.12) {
  return mixHex(hex, "#ffffff", amt);
}

function darken(hex, amt = 0.12) {
  return mixHex(hex, "#000000", amt);
}

function accentDim(hex) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},0.14)`;
}

function accentBorder(hex) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},0.28)`;
}

function accentHover(hex) {
  return lighten(hex, 0.1);
}

/** Composer/header ink — dark chrome should sit near this, not slate-lifted. */
const DARK_INK = "#05080f";

function hexLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Pull a color toward composer ink, then clamp luminance so panes stay deep. */
function deepenDarkSurface(hex, towardInk = 0.45, maxLum = 0.1) {
  const mixed = mixHex(hex, DARK_INK, towardInk);
  const lum = hexLuminance(mixed);
  if (lum <= maxLum) return mixed;
  const scale = maxLum / lum;
  const { r, g, b } = parseHex(mixed);
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * scale))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Hairline borders — low-contrast rgba, not lightened hex stripes. */
function hairlineBorder(isLight, alpha) {
  return isLight ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
}

function resolveSchemeForWallpaper(wallpaper, cached) {
  const fallbackId =
    wallpaper?.kind === "preset" && SCHEMES[wallpaper.themeId] ? wallpaper.themeId : "agent";
  const base = SCHEMES[fallbackId] ?? SCHEMES.agent;
  if (!cached?.accent) return { scheme: base, schemeId: fallbackId };
  return {
    scheme: {
      ...base,
      accent: cached.accent,
      ...(cached.bg ? { bg: cached.bg } : {}),
      ...(cached.surface ? { surface: cached.surface } : {}),
      ...(cached.raised ? { raised: cached.raised } : {}),
    },
    schemeId: fallbackId,
  };
}

function buildDeskPalette(scheme, isLight) {
  if (isLight) {
    /* Semantic steps (neutral greys): page lightest → plate → plateStrong darkest. */
    const page = LIGHT_BASE.surface;
    const plate = LIGHT_BASE.bg;
    const plateStrong = LIGHT_BASE.raised;
    return {
      /* Legacy: light mos-bg = plate, mos-panel = page (admin swap). */
      bg: plate,
      sidebar: plate,
      panel: page,
      composer: mixHex(plate, page, 0.38),
      surface: mixHex(plate, page, 0.55),
      surfaceRaised: plateStrong,
      surfaceOverlay: LIGHT_BASE.hover,
      surfaceInput: page,
      page,
      plate,
      plateStrong,
      border: hairlineBorder(true, 0.11),
      borderSoft: hairlineBorder(true, 0.075),
      borderSubtle: hairlineBorder(true, 0.09),
      borderFocus: mixHex(scheme.accent, "#000000", 0.28),
      text: LIGHT_BASE.text,
      textSoft: mixHex(LIGHT_BASE.text, LIGHT_BASE.textMuted, 0.35),
      muted: LIGHT_BASE.textMuted,
      faint: LIGHT_BASE.textFaint,
      hover: LIGHT_BASE.hover,
      active: LIGHT_BASE.active,
      accent: scheme.accent,
    };
  }

  /* Dark: same step amounts, but scheme-tinted — not flat grey. */
  const page = deepenDarkSurface(scheme.bg, 0.4, 0.075);
  const panel = deepenDarkSurface(scheme.surface, 0.45, 0.105);
  /* Keep L3 a clearer step above plate (slightly more lifted / distinct). */
  const plateStrong = deepenDarkSurface(scheme.raised, 0.18, 0.16);
  const plate = mixHex(page, panel, 0.58);
  const sidebar = darken(page, 0.06);
  const composer = mixHex(page, panel, 0.12);
  const surface = mixHex(page, panel, 0.28);

  return {
    bg: page,
    sidebar,
    panel,
    composer,
    surface,
    surfaceRaised: plateStrong,
    surfaceOverlay: mixHex(plateStrong, page, 0.22),
    surfaceInput: mixHex(page, panel, 0.35),
    page,
    plate,
    plateStrong,
    border: hairlineBorder(false, 0.07),
    borderSoft: hairlineBorder(false, 0.04),
    borderSubtle: hairlineBorder(false, 0.05),
    borderFocus: mixHex(scheme.accent, page, 0.38),
    text: "#ffffff",
    textSoft: "rgba(255,255,255,0.82)",
    muted: "rgba(255,255,255,0.62)",
    faint: "rgba(255,255,255,0.42)",
    hover: mixHex(panel, page, 0.2),
    active: mixHex(panel, page, 0.32),
    accent: scheme.accent,
  };
}

function overlayTokens(isLight) {
  if (isLight) {
    return {
      subtle: "rgba(0, 0, 0, 0.04)",
      hover: "rgba(0, 0, 0, 0.06)",
      muted: "rgba(0, 0, 0, 0.025)",
      track: "transparent",
      thumb: "rgba(0, 0, 0, 0.18)",
      thumbHover: "rgba(0, 0, 0, 0.28)",
    };
  }
  return {
    subtle: "rgba(255, 255, 255, 0.05)",
    hover: "rgba(255, 255, 255, 0.08)",
    muted: "rgba(255, 255, 255, 0.03)",
    track: "transparent",
    thumb: "rgba(255, 255, 255, 0.2)",
    thumbHover: "rgba(255, 255, 255, 0.34)",
  };
}

function applyDeskTokens(palette, isLight) {
  const root = document.documentElement;
  const accent = palette.accent;
  const hover = accentHover(accent);
  const { r, g, b } = parseHex(accent);
  const overlays = overlayTokens(isLight);

  root.style.setProperty("--cursor-accent", accent);
  root.style.setProperty("--cursor-accent-hover", hover);
  root.style.setProperty("--cursor-accent-dim", accentDim(accent));
  root.style.setProperty("--cursor-accent-border", accentBorder(accent));
  root.style.setProperty("--cursor-sidebar", palette.sidebar);

  root.style.setProperty("--cursor-overlay-subtle", overlays.subtle);
  root.style.setProperty("--cursor-overlay-hover", overlays.hover);
  root.style.setProperty("--cursor-overlay-muted", overlays.muted);

  root.style.setProperty("--mos-bg", palette.bg);
  root.style.setProperty("--mos-sidebar", palette.sidebar);
  root.style.setProperty("--mos-panel", palette.panel);
  root.style.setProperty("--mos-raised", palette.surfaceRaised);
  /* Appearance-agnostic chrome roles — dark keeps scheme hue. */
  root.style.setProperty("--mos-page", palette.page ?? palette.panel);
  root.style.setProperty("--mos-plate", palette.plate ?? palette.bg);
  root.style.setProperty(
    "--mos-plate-strong",
    palette.plateStrong ?? palette.surfaceRaised
  );
  root.style.setProperty("--mos-composer", palette.composer);
  root.style.setProperty("--mos-surface", palette.surface);
  root.style.setProperty("--mos-border", palette.border);
  root.style.setProperty("--mos-border-soft", palette.borderSoft);
  root.style.setProperty("--mos-border-subtle", palette.borderSubtle);
  root.style.setProperty("--mos-text", palette.text);
  root.style.setProperty("--mos-text-soft", palette.textSoft);
  root.style.setProperty("--mos-text-bright", palette.text);
  root.style.setProperty("--mos-muted", palette.muted);
  root.style.setProperty("--mos-faint", palette.faint);
  root.style.setProperty("--mos-accent", accent);
  root.style.setProperty("--mos-accent-hover", hover);
  root.style.setProperty("--mos-hover", palette.hover);
  root.style.setProperty("--mos-active", palette.active);

  root.style.setProperty("--color-cursor-bg", palette.bg);
  root.style.setProperty("--color-cursor-sidebar", palette.sidebar);
  root.style.setProperty("--color-cursor-editor", palette.panel);
  root.style.setProperty("--color-cursor-chat", palette.bg);
  root.style.setProperty("--color-cursor-composer", palette.composer);
  root.style.setProperty("--color-cursor-border", palette.border);
  root.style.setProperty("--color-cursor-border-soft", palette.borderSoft);
  root.style.setProperty("--color-cursor-border-subtle", palette.borderSubtle);
  root.style.setProperty("--color-cursor-muted", palette.muted);
  root.style.setProperty("--color-cursor-text", palette.text);
  root.style.setProperty("--color-cursor-text-soft", palette.textSoft);
  root.style.setProperty("--color-cursor-hover", palette.hover);
  root.style.setProperty("--color-cursor-active", palette.active);
  root.style.setProperty("--color-cursor-accent", accent);
  root.style.setProperty("--color-cursor-fg", palette.text);

  root.style.setProperty("--cursor-surface", palette.surface);
  root.style.setProperty("--cursor-surface-raised", palette.surfaceRaised);
  root.style.setProperty("--cursor-surface-overlay", palette.surfaceOverlay);
  root.style.setProperty("--cursor-surface-input", palette.surfaceInput);
  root.style.setProperty("--cursor-border-subtle", palette.borderSubtle);
  root.style.setProperty("--cursor-border-focus", palette.borderFocus);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dim", accentDim(accent));
  root.style.setProperty("--accent-rgb", `${r},${g},${b}`);
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--surface", palette.panel);
  root.style.setProperty("--surface-raised", palette.surfaceRaised);
  root.style.setProperty("--surface-hover", palette.hover);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--border-strong", palette.borderSubtle);
  root.style.setProperty("--ring", `rgba(${r},${g},${b},0.32)`);

  root.style.setProperty("--scrollbar-track", overlays.track);
  root.style.setProperty("--scrollbar-thumb", overlays.thumb);
  root.style.setProperty("--scrollbar-thumb-hover", overlays.thumbHover);

  root.style.setProperty("--text", palette.text);
  root.style.setProperty("--text-muted", palette.muted);
  root.style.setProperty("--text-faint", palette.faint);
}

function migrateLegacy() {
  const id = localStorage.getItem(SCHEME_KEY);
  if (id === "light" && !localStorage.getItem(MODE_KEY)) {
    localStorage.setItem(MODE_KEY, "light");
    localStorage.setItem(SCHEME_KEY, "agent");
  }
  // Ensure wallpaper state exists (migrates from scheme + family keys).
  readWallpaperState();
}

export function getAppearanceMode() {
  migrateLegacy();
  return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
}

export function getSchemeId() {
  migrateLegacy();
  const wallpaper = getCurrentWallpaper();
  if (wallpaper.kind === "preset" && SCHEMES[wallpaper.themeId]) return wallpaper.themeId;
  const id = localStorage.getItem(SCHEME_KEY);
  if (id === "light") return "agent";
  return SCHEMES[id] ? id : "agent";
}

export function getWallpaper() {
  migrateLegacy();
  return getCurrentWallpaper();
}

export function getWallpaperState() {
  migrateLegacy();
  return readWallpaperState();
}

export function getStudioBackgroundFamily() {
  const wallpaper = getCurrentWallpaper();
  if (wallpaper.kind === "preset") return normalizeBgFamily(wallpaper.family);
  const id = localStorage.getItem(STUDIO_BG_PACK_KEY);
  const family = normalizeBgFamily(id);
  if (id && family !== id) {
    localStorage.setItem(STUDIO_BG_PACK_KEY, family);
  }
  return family;
}

/** @deprecated use getStudioBackgroundFamily */
export function getStudioBackgroundPack() {
  return getStudioBackgroundFamily();
}

function pickNextPresetWallpaper(exclude) {
  const families = Object.keys(STUDIO_BACKGROUND_FAMILIES);
  const schemeIds = Object.keys(SCHEMES);
  let family = families[Math.floor(Math.random() * families.length)] ?? "animated";
  let themeId = schemeIds[Math.floor(Math.random() * schemeIds.length)] ?? "agent";
  let guard = 0;
  while (
    exclude
    && exclude.kind === "preset"
    && exclude.family === family
    && exclude.themeId === themeId
    && guard++ < 24
  ) {
    family = families[Math.floor(Math.random() * families.length)] ?? "animated";
    themeId = schemeIds[Math.floor(Math.random() * schemeIds.length)] ?? "agent";
  }
  return { kind: "preset", family: normalizeBgFamily(family), themeId };
}

function writeStudioBackgroundFamily(id) {
  const family = normalizeBgFamily(id);
  document.documentElement.dataset.studioBgFamily = family;
  document.documentElement.dataset.studioBgPack = family === "animated" ? "worlds" : family;
  localStorage.setItem(STUDIO_BG_PACK_KEY, family);
  return family;
}

export function setStudioBackgroundFamily(id) {
  const family = writeStudioBackgroundFamily(id);
  const current = getCurrentWallpaper();
  const themeId =
    current.kind === "preset" && SCHEMES[current.themeId] ? current.themeId : getSchemeId();
  void setWallpaper({ kind: "preset", family, themeId });
}

/** @deprecated use setStudioBackgroundFamily */
export function setStudioBackgroundPack(id) {
  setStudioBackgroundFamily(id);
}

/** @deprecated use getSchemeId */
export function getThemeId() {
  return getSchemeId();
}

function syncAppearanceControls(mode) {
  document.querySelectorAll("#appearance-mode-seg .seg-btn, #theme-appearance-seg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function syncSchemeChips(schemeId) {
  document.querySelectorAll(".theme-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.theme === schemeId);
  });
}

function syncWallpaperDataset(wallpaper) {
  const root = document.documentElement;
  if (wallpaper.kind === "preset") {
    root.dataset.theme = wallpaper.themeId;
    root.dataset.studioBgFamily = wallpaper.family;
    root.dataset.studioBgPack = wallpaper.family === "animated" ? "worlds" : wallpaper.family;
    root.dataset.wallpaperKind = "preset";
    delete root.dataset.wallpaperAssetId;
  } else {
    root.dataset.theme = getSchemeId();
    root.dataset.wallpaperKind = "asset";
    root.dataset.wallpaperAssetId = wallpaper.assetId;
  }
}

async function extractAndCacheForWallpaper(wallpaper, imageUrl) {
  if (!imageUrl) return null;
  const extracted = await extractWallpaperPalette(imageUrl, {
    crossOrigin: wallpaper.kind === "asset" || Boolean(process.env.NEXT_PUBLIC_STUDIO_BG_CDN),
  });
  if (!extracted?.accent) return null;
  setCachedPalette(wallpaper, extracted);
  return extracted;
}

export function applyTheme(schemeId, mode) {
  migrateLegacy();
  const wallpaper = getCurrentWallpaper();
  const appearance = mode === "light" || mode === "dark" ? mode : getAppearanceMode();
  const cached = getCachedPalette(wallpaper);
  const sid =
    schemeId && SCHEMES[schemeId]
      ? schemeId
      : wallpaper.kind === "preset" && SCHEMES[wallpaper.themeId]
        ? wallpaper.themeId
        : getSchemeId();
  const { scheme } = resolveSchemeForWallpaper(
    wallpaper.kind === "preset" ? { ...wallpaper, themeId: sid } : wallpaper,
    cached,
  );
  const isLight = appearance === "light";
  const palette = buildDeskPalette(scheme, isLight);

  const root = document.documentElement;
  root.dataset.appearance = appearance;
  syncWallpaperDataset(
    wallpaper.kind === "preset" ? { kind: "preset", family: wallpaper.family, themeId: sid } : wallpaper,
  );

  applyDeskTokens(palette, isLight);

  root.style.setProperty("--danger", "#dc2626");
  root.style.setProperty("--danger-fg", "#ffffff");
  root.style.setProperty("--danger-rgb", "220,38,38");
  root.style.setProperty("--danger-dim", "rgba(220,38,38,0.14)");

  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  if (wallpaper.kind === "preset") {
    localStorage.setItem(SCHEME_KEY, sid);
    localStorage.setItem(STUDIO_BG_PACK_KEY, wallpaper.family);
  } else {
    localStorage.setItem(SCHEME_KEY, sid);
  }
  localStorage.setItem(MODE_KEY, appearance);
  syncSchemeChips(sid);
  syncAppearanceControls(appearance);

  const bgFamilyNow = getStudioBackgroundFamily();
  window.dispatchEvent(
    new CustomEvent("mercuryos-theme-change", {
      detail: {
        schemeId: sid,
        mode: appearance,
        bgFamily: bgFamilyNow,
        bgPack: bgFamilyNow === "animated" ? "worlds" : bgFamilyNow,
        wallpaper,
      },
    }),
  );
  syncStudioBackgroundCss();
}

function syncStudioBackgroundCss() {
  if (typeof window === "undefined") return;
  applyStudioBackgroundNow();
}

export function setAppearanceMode(mode) {
  // Keep the same wallpaper; only remap light/dark tokens.
  applyTheme(getSchemeId(), mode === "light" ? "light" : "dark");
}

export function setColorScheme(id) {
  const family = getStudioBackgroundFamily();
  void setWallpaper({ kind: "preset", family, themeId: SCHEMES[id] ? id : "agent" });
}

/**
 * Set current wallpaper (preset or asset), derive/cache palette, apply tokens + backdrop.
 * @param {{ kind: "preset", family: string, themeId: string } | { kind: "asset", assetId: string }} ref
 * @param {{ url?: string, extract?: boolean }} [opts]
 */
export async function setWallpaper(ref, opts = {}) {
  migrateLegacy();
  const wallpaper =
    ref?.kind === "asset" && ref.assetId
      ? { kind: "asset", assetId: ref.assetId }
      : {
          kind: "preset",
          family: normalizeBgFamily(ref?.family),
          themeId: SCHEMES[ref?.themeId] ? ref.themeId : "agent",
        };

  if (wallpaper.kind === "asset" && opts.url) {
    setUrlHint(wallpaper.assetId, opts.url);
  }

  updateWallpaperCurrent(wallpaper);
  if (wallpaper.kind === "preset") {
    writeStudioBackgroundFamily(wallpaper.family);
    localStorage.setItem(SCHEME_KEY, wallpaper.themeId);
  }

  const appearance = getAppearanceMode();
  applyTheme(
    wallpaper.kind === "preset" ? wallpaper.themeId : getSchemeId(),
    appearance,
  );

  if (opts.extract === false) return wallpaper;

  const imageUrl = opts.url ?? resolveWallpaperImageUrl(wallpaper, appearance);
  if (imageUrl) {
    const extracted = await extractAndCacheForWallpaper(wallpaper, imageUrl);
    if (extracted) {
      applyTheme(
        wallpaper.kind === "preset" ? wallpaper.themeId : getSchemeId(),
        appearance,
      );
    }
  }

  return wallpaper;
}

/** Pin an asset as a saved wallpaper without necessarily applying it. */
export function saveWallpaperAsset(assetId, url) {
  if (!assetId) return;
  pinSavedAsset(assetId);
  if (url) setUrlHint(assetId, url);
  window.dispatchEvent(
    new CustomEvent("mercuryos-theme-change", {
      detail: { wallpaper: getCurrentWallpaper(), saved: true },
    }),
  );
}

export function removeSavedWallpaper(assetId) {
  const state = unpinSavedAsset(assetId);
  applyTheme(
    state.current.kind === "preset" ? state.current.themeId : getSchemeId(),
    getAppearanceMode(),
  );
}

/** Refresh signed URL for the active asset wallpaper and re-paint. */
export function refreshAssetWallpaperUrl(assetId, url) {
  if (!assetId || !url) return;
  setUrlHint(assetId, url);
  const current = getCurrentWallpaper();
  if (current.kind === "asset" && current.assetId === assetId) {
    applyStudioBackgroundNow();
    void extractAndCacheForWallpaper(current, url).then((extracted) => {
      if (extracted) applyTheme(getSchemeId(), getAppearanceMode());
    });
  }
}

/** Fallback when a custom wallpaper asset is deleted or fails to load. */
export function fallbackWallpaper(missingAssetId) {
  const state = missingAssetId
    ? dropMissingAsset(missingAssetId)
    : (() => {
        const s = readWallpaperState();
        s.current = { ...DEFAULT_WALLPAPER };
        writeWallpaperState(s);
        return s;
      })();

  writeStudioBackgroundFamily(state.current.family);
  localStorage.setItem(SCHEME_KEY, state.current.themeId);
  applyTheme(state.current.themeId, getAppearanceMode());
  return state.current;
}

/** Use a Files image asset as wallpaper (apply + pin). */
export async function useAssetAsWallpaper(assetId, url) {
  if (!assetId) return null;
  return setWallpaper({ kind: "asset", assetId }, { url });
}

/** Shuffle among preset wallpapers + light/dark (logo easter egg). */
export function randomizeStudioAppearance() {
  const next = pickNextPresetWallpaper(getCurrentWallpaper());
  const nextMode = Math.random() < 0.5 ? "light" : "dark";
  localStorage.setItem(MODE_KEY, nextMode);
  writeStudioBackgroundFamily(next.family);
  void setWallpaper(next);
  return { family: next.family, schemeId: next.themeId, mode: nextMode, wallpaper: next };
}

/** @deprecated use randomizeStudioAppearance */
export function randomizeTheme() {
  randomizeStudioAppearance();
}

export function initTheme() {
  migrateLegacy();
  applyTheme(getSchemeId(), getAppearanceMode());
}

const wiredPickers = new WeakSet();
const wiredModeSegs = new WeakSet();

export function wireThemePicker(container) {
  if (!container || wiredPickers.has(container)) return;
  wiredPickers.add(container);
  container.innerHTML = "";
  const current = getSchemeId();
  for (const [id, t] of Object.entries(SCHEMES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `theme-chip${id === current ? " active" : ""}`;
    btn.dataset.theme = id;
    btn.setAttribute("aria-label", t.label);
    btn.innerHTML = `<span class="theme-chip-swatch" style="background:${t.accent}"></span><span class="theme-chip-label">${t.label}</span>`;
    btn.addEventListener("click", () => setColorScheme(id));
    container.appendChild(btn);
  }
}

export function wireAppearanceMode(container) {
  if (!container || wiredModeSegs.has(container)) return;
  wiredModeSegs.add(container);
  const current = getAppearanceMode();
  container.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === current);
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "light" || mode === "dark") setAppearanceMode(mode);
    });
  });
}

export function wireAppearanceSettings() {
  wireAppearanceMode(document.querySelector("#appearance-mode-seg"));
  wireAppearanceMode(document.querySelector("#theme-appearance-seg"));
  wireThemePicker(document.querySelector("#theme-picker"));
  wireThemePicker(document.querySelector("#theme-sheet-picker"));
}

/** Blocking inline script for layout — sets --mos-* before first paint (Tailwind reads these). */
export function getThemeBootInlineScript() {
  const schemesJson = JSON.stringify(SCHEMES);
  const bgMigrationJson = JSON.stringify(BG_FAMILY_MIGRATION);
  const wallpaperBoot = getStudioBackgroundBootInlineFragment();
  return `(function(){try{var SCHEMES=${schemesJson};var BG_MIG=${bgMigrationJson};var SK="mercuryos-theme-v1",MK="mercuryos-appearance-v1",BK="mercuryos-studio-bg-pack-v1",WK="mercuryos-wallpaper-v1";var DARK_INK="#05080f";function parseHex(h){h=h.replace("#","");return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}}function mixHex(a,b,t){function f(x,y){return Math.round(x+(y-x)*t)}var c1=parseHex(a),c2=parseHex(b);return"#"+[f(c1.r,c2.r),f(c1.g,c2.g),f(c1.b,c2.b)].map(function(v){return v.toString(16).padStart(2,"0")}).join("")}function darken(h,a){return mixHex(h,"#000000",a||0.12)}function lighten(h,a){return mixHex(h,"#ffffff",a||0.12)}function hexLum(h){var p=parseHex(h);return(0.2126*p.r+0.7152*p.g+0.0722*p.b)/255}function deepenDark(h,toward,maxLum){var mixed=mixHex(h,DARK_INK,toward==null?0.45:toward);var lum=hexLum(mixed);if(lum<=(maxLum==null?0.1:maxLum))return mixed;var scale=(maxLum==null?0.1:maxLum)/lum;var p=parseHex(mixed);return"#"+[p.r,p.g,p.b].map(function(v){return Math.max(0,Math.min(255,Math.round(v*scale))).toString(16).padStart(2,"0")}).join("")}function hairlineBorder(isLight,a){return isLight?"rgba(0,0,0,"+a+")":"rgba(255,255,255,"+a+")"}function accentDim(hex){var p=parseHex(hex);return"rgba("+p.r+","+p.g+","+p.b+",0.14)"}function accentBorder(hex){var p=parseHex(hex);return"rgba("+p.r+","+p.g+","+p.b+",0.28)"}function accentHover(hex){return lighten(hex,0.1)}function normBg(id){if(!id)return"animated";return BG_MIG[id]||id||"animated"}var wpState=null;try{wpState=JSON.parse(localStorage.getItem(WK)||"null")}catch(e){wpState=null}var sid=localStorage.getItem(SK)||"agent";var mode=localStorage.getItem(MK)||"dark";var storedBg=localStorage.getItem(BK);var bgFamily=normBg(storedBg);var assetUrlHint=null;var cachedPal=null;if(wpState&&wpState.current){if(wpState.current.kind==="preset"){sid=wpState.current.themeId||sid;bgFamily=normBg(wpState.current.family)}else if(wpState.current.kind==="asset"){var ak="asset:"+wpState.current.assetId;assetUrlHint=wpState.urlHints&&wpState.urlHints[ak];cachedPal=wpState.palettes&&wpState.palettes[ak]}if(wpState.current.kind==="preset"){var pk="preset:"+bgFamily+":"+sid;cachedPal=wpState.palettes&&wpState.palettes[pk]}}if(sid==="light"){mode="light";sid="agent"}if(!SCHEMES[sid])sid="agent";var scheme=Object.assign({},SCHEMES[sid]);if(cachedPal&&cachedPal.accent){scheme.accent=cachedPal.accent;if(cachedPal.bg)scheme.bg=cachedPal.bg;if(cachedPal.surface)scheme.surface=cachedPal.surface;if(cachedPal.raised)scheme.raised=cachedPal.raised}var isLight=mode==="light";var LIGHT={bg:"#ececf0",surface:"#f5f5f7",raised:"#d4d4da",text:"#1c1c1e",textMuted:"#636366",textFaint:"#8e8e93",hover:"#e6e6ec",active:"#c8c8d0"};var palette;if(isLight){var lPage=LIGHT.surface,lPlate=LIGHT.bg,lStrong=LIGHT.raised;palette={bg:lPlate,sidebar:lPlate,panel:lPage,composer:mixHex(lPlate,lPage,0.38),surface:mixHex(lPlate,lPage,0.55),surfaceRaised:lStrong,surfaceOverlay:LIGHT.hover,surfaceInput:lPage,page:lPage,plate:lPlate,plateStrong:lStrong,border:hairlineBorder(true,0.11),borderSoft:hairlineBorder(true,0.075),borderSubtle:hairlineBorder(true,0.09),borderFocus:mixHex(scheme.accent,"#000000",0.28),text:LIGHT.text,textSoft:mixHex(LIGHT.text,LIGHT.textMuted,0.35),muted:LIGHT.textMuted,faint:LIGHT.textFaint,hover:LIGHT.hover,active:LIGHT.active,accent:scheme.accent}}else{var dbg=deepenDark(scheme.bg,0.4,0.075);var dpanel=deepenDark(scheme.surface,0.45,0.105);var dstrong=deepenDark(scheme.raised,0.18,0.16);var dplate=mixHex(dbg,dpanel,0.58);palette={bg:dbg,sidebar:darken(dbg,0.06),panel:dpanel,composer:mixHex(dbg,dpanel,0.12),surface:mixHex(dbg,dpanel,0.28),surfaceRaised:dstrong,surfaceOverlay:mixHex(dstrong,dbg,0.22),surfaceInput:mixHex(dbg,dpanel,0.35),page:dbg,plate:dplate,plateStrong:dstrong,border:hairlineBorder(false,0.07),borderSoft:hairlineBorder(false,0.04),borderSubtle:hairlineBorder(false,0.05),borderFocus:mixHex(scheme.accent,dbg,0.38),text:"#ffffff",textSoft:"rgba(255,255,255,0.82)",muted:"rgba(255,255,255,0.62)",faint:"rgba(255,255,255,0.42)",hover:mixHex(dpanel,dbg,0.2),active:mixHex(dpanel,dbg,0.32),accent:scheme.accent}}var root=document.documentElement;var accent=palette.accent;var hover=accentHover(accent);var rgb=parseHex(accent);root.dataset.appearance=mode;root.dataset.theme=sid;root.dataset.studioBgFamily=bgFamily;root.dataset.studioBgPack=bgFamily==="animated"?"worlds":bgFamily;if(wpState&&wpState.current&&wpState.current.kind==="asset"){root.dataset.wallpaperKind="asset";root.dataset.wallpaperAssetId=wpState.current.assetId}else{root.dataset.wallpaperKind="preset"}root.style.setProperty("--mos-bg",palette.bg);root.style.setProperty("--mos-sidebar",palette.sidebar);root.style.setProperty("--mos-panel",palette.panel);root.style.setProperty("--mos-raised",palette.surfaceRaised);root.style.setProperty("--mos-page",palette.page||palette.panel);root.style.setProperty("--mos-plate",palette.plate||palette.bg);root.style.setProperty("--mos-plate-strong",palette.plateStrong||palette.surfaceRaised);root.style.setProperty("--mos-composer",palette.composer);root.style.setProperty("--mos-surface",palette.surface);root.style.setProperty("--mos-border",palette.border);root.style.setProperty("--mos-border-soft",palette.borderSoft);root.style.setProperty("--mos-border-subtle",palette.borderSubtle);root.style.setProperty("--mos-text",palette.text);root.style.setProperty("--mos-text-soft",palette.textSoft);root.style.setProperty("--mos-text-bright",palette.text);root.style.setProperty("--mos-muted",palette.muted);root.style.setProperty("--mos-faint",palette.faint);root.style.setProperty("--mos-accent",accent);root.style.setProperty("--mos-accent-hover",hover);root.style.setProperty("--mos-hover",palette.hover);root.style.setProperty("--mos-active",palette.active);root.style.setProperty("--cursor-accent",accent);root.style.setProperty("--cursor-accent-hover",hover);root.style.setProperty("--cursor-accent-dim",accentDim(accent));root.style.setProperty("--cursor-accent-border",accentBorder(accent));root.style.setProperty("--cursor-sidebar",palette.sidebar);root.style.setProperty("--color-cursor-bg",palette.bg);root.style.setProperty("--color-cursor-border-subtle",palette.borderSubtle);root.style.setProperty("--accent-rgb",rgb.r+","+rgb.g+","+rgb.b);var ov=isLight?{subtle:"rgba(0,0,0,0.04)",hover:"rgba(0,0,0,0.06)",muted:"rgba(0,0,0,0.025)"}:{subtle:"rgba(255,255,255,0.05)",hover:"rgba(255,255,255,0.08)",muted:"rgba(255,255,255,0.03)"};root.style.setProperty("--cursor-overlay-subtle",ov.subtle);root.style.setProperty("--cursor-overlay-hover",ov.hover);root.style.setProperty("--cursor-overlay-muted",ov.muted);var wpOverride=assetUrlHint;${wallpaperBoot}}catch(e){}})();`;
}
