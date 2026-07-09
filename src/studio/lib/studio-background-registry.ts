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
  "spacey",
  "scenic",
  "clean",
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

const FAMILY_FILE_PREFIX: Record<Exclude<StudioBackgroundFamily, "clean">, string> = {
  animated: "studio-scene",
  cinematic: "studio-cinematic",
  spacey: "studio-space",
  scenic: "studio-scenic",
};

/** Legacy localStorage / dataset values → current family id. */
export const STUDIO_BG_FAMILY_MIGRATION: Record<string, StudioBackgroundFamily> = {
  worlds: "animated",
  space: "spacey",
  animated: "animated",
  cinematic: "cinematic",
  spacey: "spacey",
  scenic: "scenic",
  clean: "clean",
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

export function studioBackgroundPath(
  family: StudioBackgroundFamily,
  themeId: string,
  appearance: "light" | "dark",
): string | null {
  if (family === "clean") return null;
  const slug = STUDIO_THEME_SLUGS[themeId as StudioThemeId] ?? STUDIO_THEME_SLUGS.agent;
  const prefix = FAMILY_FILE_PREFIX[family];
  const lightSuffix = appearance === "light" ? "-light" : "";
  return `/${prefix}-${slug}${lightSuffix}-4k.webp`;
}

/** Resolve wallpaper path; falls back to animated when family assets are missing. */
export function resolveStudioBackgroundPath(
  family: StudioBackgroundFamily,
  themeId: string,
  appearance: "light" | "dark",
): string | null {
  if (family === "clean") return null;
  const animated = studioBackgroundPath("animated", themeId, appearance);
  if (family === "animated") return animated;
  return studioBackgroundPath(family, themeId, appearance) ?? animated;
}

export function studioBackgroundCssValue(path: string | null): string {
  if (!path) return "none";
  return `url("${path}")`;
}

/** All paths for a family (auth carousel, preload). */
export function studioBackgroundPathsForFamily(family: StudioBackgroundFamily): string[] {
  if (family === "clean") return [];
  const paths: string[] = [];
  for (const themeId of STUDIO_THEME_IDS) {
    const dark = studioBackgroundPath(family, themeId, "dark");
    const light = studioBackgroundPath(family, themeId, "light");
    if (dark) paths.push(dark);
    if (light) paths.push(light);
  }
  return paths;
}

/** Sign-in carousel — mix of all image families. */
export const STUDIO_AUTH_BACKGROUND_PATHS = STUDIO_BACKGROUND_FAMILIES.flatMap((family) =>
  studioBackgroundPathsForFamily(family),
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
  return (
    `var STUDIO_BG_PREFIX=${prefixes};`
    + `var STUDIO_THEME_SLUGS=${slugs};`
    + "function studioBootWallpaper(family,theme,mode){"
    + 'if(family==="clean")return null;'
    + "var slug=STUDIO_THEME_SLUGS[theme]||STUDIO_THEME_SLUGS.agent;"
    + "var suffix=(mode===\"light\"?\"-light\":\"\")+\"-4k.webp\";"
    + "var familyPrefix=STUDIO_BG_PREFIX[family];"
    + "var animatedPrefix=STUDIO_BG_PREFIX.animated;"
    + "return \"/\"+(familyPrefix||animatedPrefix)+\"-\"+slug+suffix;"
    + "}"
    + "function studioBootWallpaperFallback(family,theme,mode){"
    + "var primary=studioBootWallpaper(family,theme,mode);"
    + 'if(family==="animated"||family==="clean")return primary;'
    + "return primary||studioBootWallpaper(\"animated\",theme,mode);"
    + "}"
    + "var wp=studioBootWallpaperFallback(bgFamily,sid,mode);"
    + "if(wp){"
    + 'var u=\'url("\'+wp+\'")\';'
    + 'root.style.setProperty("--studio-active-bg",u);'
    + 'root.style.setProperty("--studio-loaded-bg",u);'
    + 'var pl=document.createElement("link");'
    + 'pl.rel="preload";pl.as="image";pl.type="image/webp";pl.href=wp;'
    + "document.head.appendChild(pl);"
    + "}"
  );
}
