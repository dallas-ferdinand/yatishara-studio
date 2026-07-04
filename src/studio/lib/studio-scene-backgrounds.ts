/** Studio theme scene wallpaper paths (dark cinematic + light spatial). */

export const STUDIO_SCENE_SLUG_TO_THEME_ID = {
  "agent-genesis": "agent",
  "gold-archive": "gold",
  "ocean-depth": "ocean",
  "ember-forge": "ember",
  "mint-meadow": "mint",
  "violet-dusk": "violet",
  "rose-bloom": "rose",
  "cobalt-skyline": "cobalt",
  "coral-reef": "coral",
  "sage-grove": "sage",
  "cherry-pulse": "cherry",
  "teal-lagoon": "teal",
  "lime-canopy": "lime",
  "fuchsia-neon": "fuchsia",
  "copper-foundry": "copper",
  "indigo-midnight": "indigo",
} as const;

export function studioSceneThemeIdFromPath(path: string) {
  for (const [slug, themeId] of Object.entries(STUDIO_SCENE_SLUG_TO_THEME_ID)) {
    if (path.includes(slug)) return themeId;
  }
  return "agent";
}

export const STUDIO_SCENE_DARK_PATHS = [
  "/studio-scene-agent-genesis-4k.webp",
  "/studio-scene-gold-archive-4k.webp",
  "/studio-scene-ocean-depth-4k.webp",
  "/studio-scene-ember-forge-4k.webp",
  "/studio-scene-mint-meadow-4k.webp",
  "/studio-scene-violet-dusk-4k.webp",
  "/studio-scene-rose-bloom-4k.webp",
  "/studio-scene-cobalt-skyline-4k.webp",
  "/studio-scene-coral-reef-4k.webp",
  "/studio-scene-sage-grove-4k.webp",
  "/studio-scene-cherry-pulse-4k.webp",
  "/studio-scene-teal-lagoon-4k.webp",
  "/studio-scene-lime-canopy-4k.webp",
  "/studio-scene-fuchsia-neon-4k.webp",
  "/studio-scene-copper-foundry-4k.webp",
  "/studio-scene-indigo-midnight-4k.webp",
] as const;

export const STUDIO_SCENE_LIGHT_PATHS = [
  "/studio-scene-agent-genesis-light-4k.webp",
  "/studio-scene-gold-archive-light-4k.webp",
  "/studio-scene-ocean-depth-light-4k.webp",
  "/studio-scene-ember-forge-light-4k.webp",
  "/studio-scene-mint-meadow-light-4k.webp",
  "/studio-scene-violet-dusk-light-4k.webp",
  "/studio-scene-rose-bloom-light-4k.webp",
  "/studio-scene-cobalt-skyline-light-4k.webp",
  "/studio-scene-coral-reef-light-4k.webp",
  "/studio-scene-sage-grove-light-4k.webp",
  "/studio-scene-cherry-pulse-light-4k.webp",
  "/studio-scene-teal-lagoon-light-4k.webp",
  "/studio-scene-lime-canopy-light-4k.webp",
  "/studio-scene-fuchsia-neon-light-4k.webp",
  "/studio-scene-copper-foundry-light-4k.webp",
  "/studio-scene-indigo-midnight-light-4k.webp",
] as const;

export const STUDIO_SCENE_ALL_PATHS = [...STUDIO_SCENE_DARK_PATHS, ...STUDIO_SCENE_LIGHT_PATHS];

/** Sign-in carousel — all current theme scene wallpapers (no legacy space/bg pack). */
export const STUDIO_AUTH_BACKGROUND_PATHS = STUDIO_SCENE_ALL_PATHS;
