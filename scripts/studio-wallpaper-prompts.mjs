/** Illustrated cartoon scene prompts for Studio theme backgrounds — painted animation matte style. */
export const CARTOON_DARK_SUFFIX =
  "Premium traditional animated film background painting, illustrated matte-painting with atmospheric depth and clear foreground-midground-background planes. Stylized cel-friendly environment art — painted shapes, soft gradient skies, gentle color wash, readable silhouettes. NO photorealism, NO photography, NO film grain, NO camera lens bokeh, NO live-action textures, NO people, NO faces, NO text, NO logos. 16:9 widescreen establishing shot. Cinematic mood through illustrated color and light design.";

export const CARTOON_LIGHT_SUFFIX =
  "Premium illustrated animated environment background, bright high-key spatial interior or landscape. White or near-white architectural volumes with clear perspective depth — floor, walls, ceiling or horizon receding to a vanishing point. Theme accent as soft painted ambient colored light wash. Painted gouache/watercolor texture on stylized forms, not photography. NO vignette crush, NO dark corners, NO photoreal materials, NO people, NO furniture clutter, NO text, NO logos. 16:9 widescreen architectural establishing still.";

/** @deprecated Photoreal dark suffix — replaced by CARTOON_DARK_SUFFIX */
export const CINEMATIC_SUFFIX = CARTOON_DARK_SUFFIX;

/** @deprecated Photoreal light suffix — replaced by CARTOON_LIGHT_SUFFIX */
export const LIGHT_SPATIAL_SUFFIX = CARTOON_LIGHT_SUFFIX;

/** Light-mode spatial backgrounds — AI-generated (Cursor image gen), then upscaled to 4K WebP. */
export const STUDIO_LIGHT_SCENE_PROMPTS = {
  agent: {
    file: "studio-scene-agent-genesis-light-4k.webp",
    png: "studio-scene-agent-genesis-light.png",
    prompt: `Long white minimalist creative studio interior in one-point perspective, polished white floor, white walls, glass partitions receding into distance, emerald green accent light through tall windows, empty quiet workspace you can walk into. ${CARTOON_LIGHT_SUFFIX}`,
  },
  gold: {
    file: "studio-scene-gold-archive-light-4k.webp",
    png: "studio-scene-gold-archive-light.png",
    prompt: `Grand white marble archive hall with columns and vaulted ceiling, perspective down a long gallery, warm golden sunlight through high clerestory windows, white stone floor with soft reflection, empty classical space. ${CARTOON_LIGHT_SUFFIX}`,
  },
  ocean: {
    file: "studio-scene-ocean-depth-light-4k.webp",
    png: "studio-scene-ocean-depth-light.png",
    prompt: `White coastal observation deck or gallery open to the sea, white walls and floor, wide opening framing soft cyan ocean horizon and pale sky, sea breeze light filling a real architectural space. ${CARTOON_LIGHT_SUFFIX}`,
  },
  ember: {
    file: "studio-scene-ember-forge-light-4k.webp",
    png: "studio-scene-ember-forge-light.png",
    prompt: `White industrial loft with high ceiling and white concrete floor, warm orange ambient light from large side windows, distant white brick wall, empty forge-inspired volume with real depth. ${CARTOON_LIGHT_SUFFIX}`,
  },
  mint: {
    file: "studio-scene-mint-meadow-light-4k.webp",
    png: "studio-scene-mint-meadow-light.png",
    prompt: `White glass pavilion in a meadow, floor-to-ceiling windows on three sides, mint green morning light across white interior floor, distant white fog and trees through glass, serene spatial interior. ${CARTOON_LIGHT_SUFFIX}`,
  },
  violet: {
    file: "studio-scene-violet-dusk-light-4k.webp",
    png: "studio-scene-violet-dusk-light.png",
    prompt: `White modern gallery cube with tall walls and polished white floor, soft violet purple twilight glow through a large rectangular opening at the far end, calm empty exhibition space with perspective. ${CARTOON_LIGHT_SUFFIX}`,
  },
  rose: {
    file: "studio-scene-rose-bloom-light-4k.webp",
    png: "studio-scene-rose-bloom-light.png",
    prompt: `White garden conservatory with white stone floor and white iron frame glass roof, rose pink diffused daylight, white courtyard visible through arched openings, romantic empty pavilion space. ${CARTOON_LIGHT_SUFFIX}`,
  },
  cobalt: {
    file: "studio-scene-cobalt-skyline-light-4k.webp",
    png: "studio-scene-cobalt-skyline-light.png",
    prompt: `White rooftop terrace room with low white walls, open sky above, cobalt blue daylight, distant white city skyline at eye level, empty urban observatory with clear spatial depth. ${CARTOON_LIGHT_SUFFIX}`,
  },
  coral: {
    file: "studio-scene-coral-reef-light-4k.webp",
    png: "studio-scene-coral-reef-light.png",
    prompt: `White underwater observation tunnel or aquarium gallery, curved white walls and floor, soft coral pink caustic light rippling on white surfaces, blue-white water glow at the far end, immersive empty space. ${CARTOON_LIGHT_SUFFIX}`,
  },
  sage: {
    file: "studio-scene-sage-grove-light-4k.webp",
    png: "studio-scene-sage-grove-light.png",
    prompt: `White forest chapel or pavilion among trees, white wooden floor and posts, sage green dappled light through canopy visible beyond open sides, quiet grove interior with depth. ${CARTOON_LIGHT_SUFFIX}`,
  },
  cherry: {
    file: "studio-scene-cherry-pulse-light-4k.webp",
    png: "studio-scene-cherry-pulse-light.png",
    prompt: `White urban passage between white buildings, wet white pavement reflecting cherry red ambient city glow, perspective down a narrow bright alley space, empty high-key street volume. ${CARTOON_LIGHT_SUFFIX}`,
  },
  teal: {
    file: "studio-scene-teal-lagoon-light-4k.webp",
    png: "studio-scene-teal-lagoon-light.png",
    prompt: `White beach cabana or lagoon deck interior, white sand-toned floor, open front facing turquoise shallow water and pale sky, teal light filling a sheltered coastal space. ${CARTOON_LIGHT_SUFFIX}`,
  },
  lime: {
    file: "studio-scene-lime-canopy-light-4k.webp",
    png: "studio-scene-lime-canopy-light.png",
    prompt: `White atrium with skylight opening to jungle canopy above, white walls and floor, lime green sun shafts through leaves far overhead, vertical spatial volume looking upward and outward. ${CARTOON_LIGHT_SUFFIX}`,
  },
  fuchsia: {
    file: "studio-scene-fuchsia-neon-light-4k.webp",
    png: "studio-scene-fuchsia-neon-light.png",
    prompt: `White Tokyo-style covered arcade interior, white tile floor and white ceiling, fuchsia magenta neon ambient glow from distant storefronts, perspective down a bright empty passage. ${CARTOON_LIGHT_SUFFIX}`,
  },
  copper: {
    file: "studio-scene-copper-foundry-light-4k.webp",
    png: "studio-scene-copper-foundry-light.png",
    prompt: `White foundry hall with tall white walls and white concrete floor, warm copper orange light from molten glow far at the end of the space, industrial cathedral volume, empty. ${CARTOON_LIGHT_SUFFIX}`,
  },
  indigo: {
    file: "studio-scene-indigo-midnight-light-4k.webp",
    png: "studio-scene-indigo-midnight-light.png",
    prompt: `White penthouse room before floor-to-ceiling glass, white floor and minimal white walls, soft indigo blue city twilight outside, interior still bright high-key, empty night view space. ${CARTOON_LIGHT_SUFFIX}`,
  },
};

export const STUDIO_LIGHT_SCENE_FILES = Object.fromEntries(
  Object.entries(STUDIO_LIGHT_SCENE_PROMPTS).map(([id, spec]) => [id, spec.file]),
);

export const STUDIO_LIGHT_SCENE_PATHS = Object.values(STUDIO_LIGHT_SCENE_PROMPTS).map(
  (spec) => `/${spec.file}`,
);

/** @deprecated Procedural fallback only — prefer STUDIO_LIGHT_SCENE_PROMPTS + Cursor image gen. */
export const STUDIO_LIGHT_SCENE_SPECS = [
  {
    id: "agent",
    file: "studio-scene-agent-genesis-light-4k.webp",
    accent: "#22c55e",
    baseTop: "#fcfcfd",
    baseBottom: "#f3f4f6",
    glows: [
      { id: "g1", cx: 78, cy: 22, r: 52, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 18, cy: 68, r: 38, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 58, mid: 0.06, end: 0.12, vignette: 0.14 },
  },
  {
    id: "gold",
    file: "studio-scene-gold-archive-light-4k.webp",
    accent: "#c4a574",
    baseTop: "#fdfcfa",
    baseBottom: "#f4f1ea",
    glows: [
      { id: "g1", cx: 50, cy: 82, r: 62, o0: 0.18, o1: 0.05 },
      { id: "g2", cx: 88, cy: 18, r: 34, o0: 0.1, o1: 0.03 },
    ],
    floor: { start: 52, mid: 0.08, end: 0.14, vignette: 0.12 },
  },
  {
    id: "ocean",
    file: "studio-scene-ocean-depth-light-4k.webp",
    accent: "#38bdf8",
    baseTop: "#fbfdff",
    baseBottom: "#eef6fb",
    glows: [
      { id: "g1", cx: 50, cy: 92, r: 58, o0: 0.22, o1: 0.06 },
      { id: "g2", cx: 24, cy: 28, r: 40, o0: 0.09, o1: 0.025 },
    ],
    floor: { start: 48, mid: 0.07, end: 0.13, vignette: 0.13 },
  },
  {
    id: "ember",
    file: "studio-scene-ember-forge-light-4k.webp",
    accent: "#fb923c",
    baseTop: "#fffdfb",
    baseBottom: "#f7f0ea",
    glows: [
      { id: "g1", cx: 28, cy: 44, r: 48, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 72, cy: 76, r: 36, o0: 0.1, o1: 0.03 },
    ],
    floor: { start: 60, mid: 0.07, end: 0.12, vignette: 0.15 },
  },
  {
    id: "mint",
    file: "studio-scene-mint-meadow-light-4k.webp",
    accent: "#4ade80",
    baseTop: "#fbfffc",
    baseBottom: "#eef6f1",
    glows: [
      { id: "g1", cx: 62, cy: 16, r: 50, o0: 0.19, o1: 0.05 },
      { id: "g2", cx: 34, cy: 58, r: 42, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 55, mid: 0.06, end: 0.11, vignette: 0.12 },
  },
  {
    id: "violet",
    file: "studio-scene-violet-dusk-light-4k.webp",
    accent: "#c084fc",
    baseTop: "#fefcff",
    baseBottom: "#f3eef8",
    glows: [
      { id: "g1", cx: 50, cy: 24, r: 56, o0: 0.21, o1: 0.06 },
      { id: "g2", cx: 82, cy: 62, r: 34, o0: 0.09, o1: 0.025 },
    ],
    floor: { start: 54, mid: 0.07, end: 0.12, vignette: 0.14 },
  },
  {
    id: "rose",
    file: "studio-scene-rose-bloom-light-4k.webp",
    accent: "#fb7185",
    baseTop: "#fffcfd",
    baseBottom: "#f8eef1",
    glows: [
      { id: "g1", cx: 44, cy: 78, r: 54, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 76, cy: 30, r: 36, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 50, mid: 0.08, end: 0.13, vignette: 0.13 },
  },
  {
    id: "cobalt",
    file: "studio-scene-cobalt-skyline-light-4k.webp",
    accent: "#60a5fa",
    baseTop: "#f8fbff",
    baseBottom: "#edf2fa",
    glows: [
      { id: "g1", cx: 50, cy: 12, r: 60, o0: 0.22, o1: 0.06 },
      { id: "g2", cx: 16, cy: 72, r: 38, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 56, mid: 0.07, end: 0.12, vignette: 0.12 },
  },
  {
    id: "coral",
    file: "studio-scene-coral-reef-light-4k.webp",
    accent: "#f472b6",
    baseTop: "#fffafd",
    baseBottom: "#f7eef4",
    glows: [
      { id: "g1", cx: 68, cy: 38, r: 46, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 22, cy: 82, r: 40, o0: 0.09, o1: 0.03 },
    ],
    floor: { start: 58, mid: 0.07, end: 0.12, vignette: 0.14 },
  },
  {
    id: "sage",
    file: "studio-scene-sage-grove-light-4k.webp",
    accent: "#86efac",
    baseTop: "#fbfffb",
    baseBottom: "#eef5f0",
    glows: [
      { id: "g1", cx: 36, cy: 26, r: 48, o0: 0.18, o1: 0.05 },
      { id: "g2", cx: 74, cy: 70, r: 42, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 52, mid: 0.08, end: 0.13, vignette: 0.12 },
  },
  {
    id: "cherry",
    file: "studio-scene-cherry-pulse-light-4k.webp",
    accent: "#f87171",
    baseTop: "#fffbfb",
    baseBottom: "#f6eded",
    glows: [
      { id: "g1", cx: 84, cy: 28, r: 44, o0: 0.21, o1: 0.06 },
      { id: "g2", cx: 20, cy: 64, r: 38, o0: 0.09, o1: 0.025 },
    ],
    floor: { start: 60, mid: 0.07, end: 0.12, vignette: 0.15 },
  },
  {
    id: "teal",
    file: "studio-scene-teal-lagoon-light-4k.webp",
    accent: "#2dd4bf",
    baseTop: "#fafffe",
    baseBottom: "#eaf6f4",
    glows: [
      { id: "g1", cx: 50, cy: 88, r: 58, o0: 0.22, o1: 0.06 },
      { id: "g2", cx: 70, cy: 24, r: 36, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 46, mid: 0.08, end: 0.14, vignette: 0.13 },
  },
  {
    id: "lime",
    file: "studio-scene-lime-canopy-light-4k.webp",
    accent: "#a3e635",
    baseTop: "#fdfffa",
    baseBottom: "#f1f6e8",
    glows: [
      { id: "g1", cx: 14, cy: 18, r: 52, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 58, cy: 62, r: 40, o0: 0.09, o1: 0.03 },
    ],
    floor: { start: 54, mid: 0.07, end: 0.12, vignette: 0.12 },
  },
  {
    id: "fuchsia",
    file: "studio-scene-fuchsia-neon-light-4k.webp",
    accent: "#e879f9",
    baseTop: "#fefaff",
    baseBottom: "#f5eef8",
    glows: [
      { id: "g1", cx: 72, cy: 34, r: 50, o0: 0.21, o1: 0.06 },
      { id: "g2", cx: 26, cy: 76, r: 38, o0: 0.1, o1: 0.03 },
    ],
    floor: { start: 57, mid: 0.07, end: 0.12, vignette: 0.14 },
  },
  {
    id: "copper",
    file: "studio-scene-copper-foundry-light-4k.webp",
    accent: "#d97706",
    baseTop: "#fffdfa",
    baseBottom: "#f6f0e6",
    glows: [
      { id: "g1", cx: 48, cy: 80, r: 56, o0: 0.19, o1: 0.05 },
      { id: "g2", cx: 80, cy: 22, r: 34, o0: 0.09, o1: 0.025 },
    ],
    floor: { start: 50, mid: 0.08, end: 0.13, vignette: 0.13 },
  },
  {
    id: "indigo",
    file: "studio-scene-indigo-midnight-light-4k.webp",
    accent: "#818cf8",
    baseTop: "#fafaff",
    baseBottom: "#eef0f8",
    glows: [
      { id: "g1", cx: 52, cy: 72, r: 54, o0: 0.2, o1: 0.05 },
      { id: "g2", cx: 18, cy: 24, r: 40, o0: 0.08, o1: 0.02 },
    ],
    floor: { start: 55, mid: 0.07, end: 0.12, vignette: 0.14 },
  },
];

export const STUDIO_LIGHT_SCENE_PROMPT_LIST = Object.entries(STUDIO_LIGHT_SCENE_PROMPTS).map(
  ([id, spec]) => ({ id, ...spec }),
);

export const STUDIO_SCENE_PROMPTS = {
  agent: {
    file: "studio-scene-agent-genesis-4k.webp",
    png: "studio-scene-agent-genesis.png",
    prompt: `Modern creative studio interior at blue hour, emerald green accent ambient light on minimalist glass desks, floor-to-ceiling windows with soft illustrated city glow outside, quiet empty workspace. ${CARTOON_DARK_SUFFIX}`,
  },
  gold: {
    file: "studio-scene-gold-archive-4k.webp",
    png: "studio-scene-gold-archive.png",
    prompt: `Grand vintage archive library, floor-to-ceiling leather-bound books, warm golden reading lamps, golden dust motes in a painted sun shaft, worn oak tables. ${CARTOON_DARK_SUFFIX}`,
  },
  ocean: {
    file: "studio-scene-ocean-depth-4k.webp",
    png: "studio-scene-ocean-depth.png",
    prompt: `Open ocean horizon at pre-dawn, gentle rolling waves catching first cyan light, vast calm sea meeting soft sky gradient, minimal painted seascape composition. ${CARTOON_DARK_SUFFIX}`,
  },
  ember: {
    file: "studio-scene-ember-forge-4k.webp",
    png: "studio-scene-ember-forge.png",
    prompt: `Traditional blacksmith forge interior, orange fire glow reflecting on hammered steel and brick, wisps of smoke, dramatic chiaroscuro, worn tools on bench. ${CARTOON_DARK_SUFFIX}`,
  },
  mint: {
    file: "studio-scene-mint-meadow-4k.webp",
    png: "studio-scene-mint-meadow.png",
    prompt: `Misty green meadow at first light, dew on wild grass, distant tree line fading into soft fog, patient wide painted landscape. ${CARTOON_DARK_SUFFIX}`,
  },
  violet: {
    file: "studio-scene-violet-dusk-4k.webp",
    png: "studio-scene-violet-dusk.png",
    prompt: `Purple twilight over rolling lavender fields, distant hills under violet sky, last warm rim light on horizon, serene rural painted landscape. ${CARTOON_DARK_SUFFIX}`,
  },
  rose: {
    file: "studio-scene-rose-bloom-4k.webp",
    png: "studio-scene-rose-bloom.png",
    prompt: `Rain-wet English rose garden after shower, soft pink petals with water droplets, overcast diffused light, stone path between beds. ${CARTOON_DARK_SUFFIX}`,
  },
  cobalt: {
    file: "studio-scene-cobalt-skyline-4k.webp",
    png: "studio-scene-cobalt-skyline.png",
    prompt: `Metropolitan skyline at blue hour from high terrace, glass towers reflecting last light, cool cobalt sky deepening, empty rooftop foreground. ${CARTOON_DARK_SUFFIX}`,
  },
  coral: {
    file: "studio-scene-coral-reef-4k.webp",
    png: "studio-scene-coral-reef.png",
    prompt: `Underwater coral reef in clear tropical water, sunlight caustics dancing on colorful coral formations, gentle particulate, serene painted marine still. ${CARTOON_DARK_SUFFIX}`,
  },
  sage: {
    file: "studio-scene-sage-grove-4k.webp",
    png: "studio-scene-sage-grove.png",
    prompt: `Ancient temperate forest grove, moss-covered boulders, dappled green canopy light on fern floor, quiet old-growth painted atmosphere. ${CARTOON_DARK_SUFFIX}`,
  },
  cherry: {
    file: "studio-scene-cherry-pulse-4k.webp",
    png: "studio-scene-cherry-pulse.png",
    prompt: `Rain-slick urban alley at night, red neon reflections on wet asphalt, steam rising from grate, cinematic noir mood without people. ${CARTOON_DARK_SUFFIX}`,
  },
  teal: {
    file: "studio-scene-teal-lagoon-4k.webp",
    png: "studio-scene-teal-lagoon.png",
    prompt: `Tropical lagoon from elevated view, turquoise shallow water over white sand, palm shadows, crystal clear Caribbean clarity. ${CARTOON_DARK_SUFFIX}`,
  },
  lime: {
    file: "studio-scene-lime-canopy-4k.webp",
    png: "studio-scene-lime-canopy.png",
    prompt: `Dense jungle canopy viewed from below, bright lime-green leaves against sky, sun shafts piercing foliage, humid tropical painted atmosphere. ${CARTOON_DARK_SUFFIX}`,
  },
  fuchsia: {
    file: "studio-scene-fuchsia-neon-4k.webp",
    png: "studio-scene-fuchsia-neon.png",
    prompt: `Neon-lit Asian city street at night, magenta and fuchsia sign glow on wet pavement, illustrated bokeh lights receding into depth, cyberpunk color without crowds. ${CARTOON_DARK_SUFFIX}`,
  },
  copper: {
    file: "studio-scene-copper-foundry-4k.webp",
    png: "studio-scene-copper-foundry.png",
    prompt: `Industrial copper foundry interior, molten metal orange glow, steam and sparks frozen in still frame, rust and patina textures on machinery. ${CARTOON_DARK_SUFFIX}`,
  },
  indigo: {
    file: "studio-scene-indigo-midnight-4k.webp",
    png: "studio-scene-indigo-midnight.png",
    prompt: `Moonlit quiet city viewed through tall window at midnight, deep indigo sky, soft interior silhouette edge, distant amber street lights. ${CARTOON_DARK_SUFFIX}`,
  },
};

export const STUDIO_SCENE_PROMPT_LIST = Object.entries(STUDIO_SCENE_PROMPTS).map(
  ([id, spec]) => ({ id, ...spec }),
);

/** Photoreal cinematic backgrounds — film grain, lens bokeh, no cartoon stylization. */
export const CINEMATIC_DARK_SUFFIX =
  "Photorealistic cinematic environment still, shot on ARRI Alexa with anamorphic lens character, natural film grain, shallow depth of field, realistic materials and lighting, atmospheric haze. NO illustration, NO cartoon, NO cel shading, NO people, NO faces, NO text, NO logos. 16:9 widescreen establishing shot.";

export const CINEMATIC_LIGHT_SUFFIX =
  "Photorealistic bright high-key architectural interior or landscape, soft natural daylight, clean white volumes with realistic perspective depth, subtle theme accent as ambient colored light. Real materials and reflections, not illustration. NO cartoon, NO people, NO text, NO logos. 16:9 widescreen establishing still.";

/** Cosmic minimal void backgrounds. */
export const SPACEY_DARK_SUFFIX =
  "Vast cosmic void with deep space nebula accents, minimal foreground, theme-colored star clusters and aurora bands, painterly but not cartoon — ethereal sci-fi matte. NO people, NO text, NO logos. 16:9 widescreen.";

export const SPACEY_LIGHT_SUFFIX =
  "Bright minimal cosmic void, soft white starfield with theme accent nebula glow, airy negative space, serene space observatory mood. NO people, NO text, NO logos. 16:9 widescreen high-key.";

/** Wide scenic vista backgrounds. */
export const SCENIC_DARK_SUFFIX =
  "Wide cinematic landscape vista at golden hour or blue hour, photoreal natural environment, dramatic sky, deep perspective to horizon, environmental storytelling without people. NO cartoon, NO text, NO logos. 16:9 widescreen.";

export const SCENIC_LIGHT_SUFFIX =
  "Wide bright scenic vista, high-key natural landscape or architecture, clear horizon, soft atmospheric perspective, photoreal daylight. NO people, NO text, NO logos. 16:9 widescreen.";

const FAMILY_CONFIG = {
  cinematic: { prefix: "studio-cinematic", darkSuffix: CINEMATIC_DARK_SUFFIX, lightSuffix: CINEMATIC_LIGHT_SUFFIX },
  spacey: { prefix: "studio-space", darkSuffix: SPACEY_DARK_SUFFIX, lightSuffix: SPACEY_LIGHT_SUFFIX },
  scenic: { prefix: "studio-scenic", darkSuffix: SCENIC_DARK_SUFFIX, lightSuffix: SCENIC_LIGHT_SUFFIX },
};

/** Build prompt specs for non-animated families from animated scene subjects. */
function buildFamilyPrompts(family) {
  const config = FAMILY_CONFIG[family];
  if (!config) return { dark: [], light: [] };
  const dark = [];
  const light = [];
  for (const [id, spec] of Object.entries(STUDIO_SCENE_PROMPTS)) {
    const slug = spec.file.replace("studio-scene-", "").replace("-4k.webp", "");
    const subject = spec.prompt.replace(CARTOON_DARK_SUFFIX, "").trim();
    const lightSubject =
      STUDIO_LIGHT_SCENE_PROMPTS[id]?.prompt.replace(CARTOON_LIGHT_SUFFIX, "").trim() ?? subject;
    dark.push({
      id,
      family,
      variant: "dark",
      file: `${config.prefix}-${slug}-4k.webp`,
      png: `${config.prefix}-${slug}.png`,
      prompt: `${subject} ${config.darkSuffix}`,
    });
    light.push({
      id,
      family,
      variant: "light",
      file: `${config.prefix}-${slug}-light-4k.webp`,
      png: `${config.prefix}-${slug}-light.png`,
      prompt: `${lightSubject} ${config.lightSuffix}`,
    });
  }
  return { dark, light };
}

export const STUDIO_CINEMATIC_PROMPT_LIST = [
  ...buildFamilyPrompts("cinematic").dark,
  ...buildFamilyPrompts("cinematic").light,
];
export const STUDIO_SPACEY_PROMPT_LIST = [
  ...buildFamilyPrompts("spacey").dark,
  ...buildFamilyPrompts("spacey").light,
];
export const STUDIO_SCENIC_PROMPT_LIST = [
  ...buildFamilyPrompts("scenic").dark,
  ...buildFamilyPrompts("scenic").light,
];

export const STUDIO_BACKGROUND_PROMPTS_BY_FAMILY = {
  animated: {
    dark: STUDIO_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, family: "animated", variant: "dark" })),
    light: STUDIO_LIGHT_SCENE_PROMPT_LIST.map((spec) => ({ ...spec, family: "animated", variant: "light" })),
  },
  cinematic: buildFamilyPrompts("cinematic"),
  spacey: buildFamilyPrompts("spacey"),
  scenic: buildFamilyPrompts("scenic"),
};

export function studioWallpaperSpecsForFamily(family) {
  if (family === "animated") {
    return [
      ...STUDIO_BACKGROUND_PROMPTS_BY_FAMILY.animated.dark,
      ...STUDIO_BACKGROUND_PROMPTS_BY_FAMILY.animated.light,
    ];
  }
  const pack = STUDIO_BACKGROUND_PROMPTS_BY_FAMILY[family];
  if (!pack) return [];
  return [...pack.dark, ...pack.light];
}
