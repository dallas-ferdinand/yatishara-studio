/** Studio wallpaper path matrix — family × theme × appearance. */

export const STUDIO_THEME_IDS = [
  "agent",
  "gold",
  "ocean",
  "ember",
  "mint",
  "violet",
  "rose",
  "cobalt",
  "coral",
  "sage",
  "cherry",
  "teal",
  "lime",
  "fuchsia",
  "copper",
  "indigo",
] as const;

export type StudioThemeId = (typeof STUDIO_THEME_IDS)[number];

export const STUDIO_BACKGROUND_FAMILIES = [
  "animated",
  "cinematic",
] as const;

export type StudioBackgroundFamily = (typeof STUDIO_BACKGROUND_FAMILIES)[number];

/** Theme id → filename slug segment (shared across families). */
export const STUDIO_THEME_SLUGS: Record<StudioThemeId, string> = {
  agent: "agent-genesis",
  gold: "gold-archive",
  ocean: "ocean-depth",
  ember: "ember-forge",
  mint: "mint-meadow",
  violet: "violet-dusk",
  rose: "rose-bloom",
  cobalt: "cobalt-skyline",
  coral: "coral-reef",
  sage: "sage-grove",
  cherry: "cherry-pulse",
  teal: "teal-lagoon",
  lime: "lime-canopy",
  fuchsia: "fuchsia-neon",
  copper: "copper-foundry",
  indigo: "indigo-midnight",
};

const FAMILY_FILE_PREFIX: Record<StudioBackgroundFamily, string> = {
  animated: "studio-scene",
  cinematic: "studio-cinematic",
};

/** Legacy localStorage / dataset values → current family id. */
export const STUDIO_BG_FAMILY_MIGRATION: Record<string, StudioBackgroundFamily> = {
  worlds: "animated",
  space: "animated",
  animated: "animated",
  cinematic: "cinematic",
  spacey: "animated",
  scenic: "animated",
  clean: "animated",
};

export function normalizeStudioBackgroundFamily(
  value: string | null | undefined,
): StudioBackgroundFamily {
  if (!value) return "animated";
  const migrated = STUDIO_BG_FAMILY_MIGRATION[value];
  if (migrated) return migrated;
  return STUDIO_BACKGROUND_FAMILIES.includes(value as StudioBackgroundFamily)
    ? (value as StudioBackgroundFamily)
    : "animated";
}

/** Public Bunny (or other CDN) base for wallpapers. Empty = same-origin /public. */
export function studioBackgroundCdnBase(): string {
  const raw = process.env.NEXT_PUBLIC_STUDIO_BG_CDN?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

/** Viewport/DPR-aware wallpaper transform — keeps visual fidelity without shipping 8K to phones. */
export function studioBackgroundTransformParams(
  options?: { width?: number; quality?: number; dpr?: number },
): string {
  const dpr =
    options?.dpr ??
    (typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2);
  const cssWidth =
    options?.width ??
    (typeof window !== "undefined" ? Math.max(window.innerWidth || 1280, 390) : 1920);
  // Cap source decode size: 2× CSS width up to 2560 logical, never 8192.
  const width = Math.min(2560, Math.round(cssWidth * Math.max(1, dpr)));
  const quality = options?.quality ?? (width >= 1920 ? 82 : 78);
  return `width=${width}&quality=${quality}`;
}

export function studioBackgroundFilename(
  family: StudioBackgroundFamily,
  themeId: string,
  appearance: "light" | "dark",
): string {
  const slug = STUDIO_THEME_SLUGS[themeId as StudioThemeId] ?? STUDIO_THEME_SLUGS.agent;
  const prefix = FAMILY_FILE_PREFIX[family];
  const lightSuffix = appearance === "light" ? "-light" : "";
  return `${prefix}-${slug}${lightSuffix}-4k.webp`;
}

export function studioBackgroundPath(
  family: StudioBackgroundFamily,
  themeId: string,
  appearance: "light" | "dark",
  options?: { width?: number; quality?: number; dpr?: number },
): string {
  const file = studioBackgroundFilename(family, themeId, appearance);
  const cdn = studioBackgroundCdnBase();
  if (!cdn) return `/${file}`;
  return `${cdn}/${file}?${studioBackgroundTransformParams(options)}`;
}

/** Resolve wallpaper path; falls back to animated when family assets are missing. */
export function resolveStudioBackgroundPath(
  family: StudioBackgroundFamily,
  themeId: string,
  appearance: "light" | "dark",
): string {
  if (family === "animated") {
    return studioBackgroundPath("animated", themeId, appearance);
  }
  return studioBackgroundPath(family, themeId, appearance);
}

export function studioBackgroundCssValue(path: string | null): string {
  if (!path) return "none";
  return `url("${path}")`;
}

export type StudioWallpaperPreset = {
  family: StudioBackgroundFamily;
  themeId: StudioThemeId;
  label: string;
  pathDark: string;
  pathLight: string;
};

/** Flat preset catalog for the wallpaper picker (one tile per family×theme). */
export function listStudioWallpaperPresets(
  labels: Record<string, string>,
): StudioWallpaperPreset[] {
  const presets: StudioWallpaperPreset[] = [];
  for (const family of STUDIO_BACKGROUND_FAMILIES) {
    for (const themeId of STUDIO_THEME_IDS) {
      presets.push({
        family,
        themeId,
        label: labels[themeId] ?? themeId,
        pathDark: studioBackgroundPath(family, themeId, "dark"),
        pathLight: studioBackgroundPath(family, themeId, "light"),
      });
    }
  }
  return presets;
}

/** All paths for a family (auth carousel, preload). */
export function studioBackgroundPathsForFamily(family: StudioBackgroundFamily): string[] {
  const paths: string[] = [];
  for (const themeId of STUDIO_THEME_IDS) {
    paths.push(studioBackgroundPath(family, themeId, "dark"));
    paths.push(studioBackgroundPath(family, themeId, "light"));
  }
  return paths;
}

/** Sign-in carousel — one appearance per family×theme (not both light+dark). */
export const STUDIO_AUTH_BACKGROUND_PATHS = STUDIO_BACKGROUND_FAMILIES.flatMap((family) =>
  STUDIO_THEME_IDS.map((themeId) => studioBackgroundPath(family, themeId, "dark")),
);

export function studioThemeIdFromPath(path: string): StudioThemeId {
  for (const [slug, themeId] of Object.entries(STUDIO_THEME_SLUGS)) {
    if (path.includes(slug)) return themeId as StudioThemeId;
  }
  return "agent";
}

/** @deprecated use studioThemeIdFromPath */
export const studioSceneThemeIdFromPath = studioThemeIdFromPath;

/** @deprecated use studioBackgroundPathsForFamily("animated") */
export const STUDIO_SCENE_DARK_PATHS = STUDIO_THEME_IDS.map(
  (id) => studioBackgroundPath("animated", id, "dark")!,
);

/** @deprecated use studioBackgroundPathsForFamily("animated") */
export const STUDIO_SCENE_LIGHT_PATHS = STUDIO_THEME_IDS.map(
  (id) => studioBackgroundPath("animated", id, "light")!,
);

export const STUDIO_SCENE_ALL_PATHS = [
  ...STUDIO_SCENE_DARK_PATHS,
  ...STUDIO_SCENE_LIGHT_PATHS,
];

export const STUDIO_SCENE_SLUG_TO_THEME_ID = STUDIO_THEME_SLUGS;

/** Inline JS for layout boot — sets wallpaper CSS + preload before React hydrates. */
export function getStudioBackgroundBootInlineFragment(): string {
  const prefixes = JSON.stringify(FAMILY_FILE_PREFIX);
  const slugs = JSON.stringify(STUDIO_THEME_SLUGS);
  const cdn = JSON.stringify(studioBackgroundCdnBase());
  return (
    `var STUDIO_BG_PREFIX=${prefixes};`
    + `var STUDIO_THEME_SLUGS=${slugs};`
    + `var STUDIO_BG_CDN=${cdn};`
    + "function studioBootWallpaper(family,theme,mode){"
    + "var slug=STUDIO_THEME_SLUGS[theme]||STUDIO_THEME_SLUGS.agent;"
    + "var suffix=(mode===\"light\"?\"-light\":\"\")+\"-4k.webp\";"
    + "var familyPrefix=STUDIO_BG_PREFIX[family];"
    + "var animatedPrefix=STUDIO_BG_PREFIX.animated;"
    + "var file=(familyPrefix||animatedPrefix)+\"-\"+slug+suffix;"
    + "if(!STUDIO_BG_CDN)return \"/\"+file;"
    + "var dpr=Math.min((window.devicePixelRatio||1),3);"
    + "var cssW=Math.max(window.innerWidth||1280,390);"
    + "var w=Math.min(2560,Math.round(cssW*Math.max(1,dpr)));"
    + "var q=w>=1920?82:78;"
    + "return STUDIO_BG_CDN+\"/\"+file+\"?width=\"+w+\"&quality=\"+q;"
    + "}"
    + "function studioBootWallpaperFallback(family,theme,mode){"
    + "var primary=studioBootWallpaper(family,theme,mode);"
    + 'if(family==="animated")return primary;'
    + "return primary||studioBootWallpaper(\"animated\",theme,mode);"
    + "}"
    + "var wp=typeof wpOverride===\"string\"&&wpOverride?wpOverride:studioBootWallpaperFallback(bgFamily,sid,mode);"
    + "if(wp){"
    + 'var u=\'url("\'+wp+\'")\';'
    + 'root.style.setProperty("--studio-active-bg",u);'
    + 'root.style.setProperty("--studio-loaded-bg",u);'
    // CSS background-image uses no-cors; do not set crossOrigin or the
    // preload is discarded (credentials mode mismatch).
    + 'var pl=document.createElement("link");'
    + 'pl.rel="preload";pl.as="image";pl.type="image/webp";pl.href=wp;'
    + "document.head.appendChild(pl);"
    + "}"
  );
}
