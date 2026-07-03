/** Cinematic scene prompts for Studio theme backgrounds — Seedance film-grade vocabulary. */
export const CINEMATIC_SUFFIX =
  "Photorealistic cinematic film still as if shot on ARRI Alexa 65 with Cooke anamorphic lens. Dramatic motivated lighting, shallow depth of field, controlled color grade, subtle film grain. Empty atmospheric environment — no people, no faces, no text, no logos. 16:9 widescreen establishing shot. Ultra-high detail, documentary-grade textures, real-world physical materials.";

export const LIGHT_SPATIAL_SUFFIX =
  "Photorealistic cinematic establishing shot, bright high-key Mercury OS empty space. Stark white architecture with clear spatial depth — visible floor plane, walls, ceiling, perspective lines receding to a distant vanishing point or horizon. Theme accent as soft ambient colored light (skylight, window glow, or horizon wash). Surfaces are white marble, white plaster, or white concrete with subtle real texture. NO vignette, NO dark corners, NO edge darkening, NO gray muddy shadows — but DO show readable room volume and depth. Empty — no people, no furniture clutter, no text, no logos. 16:9 widescreen architectural still.";

/** Light-mode spatial backgrounds — AI-generated (Cursor image gen), then upscaled to 4K WebP. */
export const STUDIO_LIGHT_SCENE_PROMPTS = {
  agent: {
    file: "studio-scene-agent-genesis-light-4k.webp",
    png: "studio-scene-agent-genesis-light.png",
    prompt: `Long white minimalist creative studio interior in one-point perspective, polished white floor, white walls, glass partitions receding into distance, emerald green accent light through tall windows, empty quiet workspace you can walk into. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  gold: {
    file: "studio-scene-gold-archive-light-4k.webp",
    png: "studio-scene-gold-archive-light.png",
    prompt: `Grand white marble archive hall with columns and vaulted ceiling, perspective down a long gallery, warm golden sunlight through high clerestory windows, white stone floor with soft reflection, empty classical space. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  ocean: {
    file: "studio-scene-ocean-depth-light-4k.webp",
    png: "studio-scene-ocean-depth-light.png",
    prompt: `White coastal observation deck or gallery open to the sea, white walls and floor, wide opening framing soft cyan ocean horizon and pale sky, sea breeze light filling a real architectural space. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  ember: {
    file: "studio-scene-ember-forge-light-4k.webp",
    png: "studio-scene-ember-forge-light.png",
    prompt: `White industrial loft with high ceiling and white concrete floor, warm orange ambient light from large side windows, distant white brick wall, empty forge-inspired volume with real depth. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  mint: {
    file: "studio-scene-mint-meadow-light-4k.webp",
    png: "studio-scene-mint-meadow-light.png",
    prompt: `White glass pavilion in a meadow, floor-to-ceiling windows on three sides, mint green morning light across white interior floor, distant white fog and trees through glass, serene spatial interior. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  violet: {
    file: "studio-scene-violet-dusk-light-4k.webp",
    png: "studio-scene-violet-dusk-light.png",
    prompt: `White modern gallery cube with tall walls and polished white floor, soft violet purple twilight glow through a large rectangular opening at the far end, calm empty exhibition space with perspective. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  rose: {
    file: "studio-scene-rose-bloom-light-4k.webp",
    png: "studio-scene-rose-bloom-light.png",
    prompt: `White garden conservatory with white stone floor and white iron frame glass roof, rose pink diffused daylight, white courtyard visible through arched openings, romantic empty pavilion space. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  cobalt: {
    file: "studio-scene-cobalt-skyline-light-4k.webp",
    png: "studio-scene-cobalt-skyline-light.png",
    prompt: `White rooftop terrace room with low white walls, open sky above, cobalt blue daylight, distant white city skyline at eye level, empty urban observatory with clear spatial depth. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  coral: {
    file: "studio-scene-coral-reef-light-4k.webp",
    png: "studio-scene-coral-reef-light.png",
    prompt: `White underwater observation tunnel or aquarium gallery, curved white walls and floor, soft coral pink caustic light rippling on white surfaces, blue-white water glow at the far end, immersive empty space. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  sage: {
    file: "studio-scene-sage-grove-light-4k.webp",
    png: "studio-scene-sage-grove-light.png",
    prompt: `White forest chapel or pavilion among trees, white wooden floor and posts, sage green dappled light through canopy visible beyond open sides, quiet grove interior with depth. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  cherry: {
    file: "studio-scene-cherry-pulse-light-4k.webp",
    png: "studio-scene-cherry-pulse-light.png",
    prompt: `White urban passage between white buildings, wet white pavement reflecting cherry red ambient city glow, perspective down a narrow bright alley space, empty high-key street volume. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  teal: {
    file: "studio-scene-teal-lagoon-light-4k.webp",
    png: "studio-scene-teal-lagoon-light.png",
    prompt: `White beach cabana or lagoon deck interior, white sand-toned floor, open front facing turquoise shallow water and pale sky, teal light filling a sheltered coastal space. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  lime: {
    file: "studio-scene-lime-canopy-light-4k.webp",
    png: "studio-scene-lime-canopy-light.png",
    prompt: `White atrium with skylight opening to jungle canopy above, white walls and floor, lime green sun shafts through leaves far overhead, vertical spatial volume looking upward and outward. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  fuchsia: {
    file: "studio-scene-fuchsia-neon-light-4k.webp",
    png: "studio-scene-fuchsia-neon-light.png",
    prompt: `White Tokyo-style covered arcade interior, white tile floor and white ceiling, fuchsia magenta neon ambient glow from distant storefronts, perspective down a bright empty passage. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  copper: {
    file: "studio-scene-copper-foundry-light-4k.webp",
    png: "studio-scene-copper-foundry-light.png",
    prompt: `White foundry hall with tall white walls and white concrete floor, warm copper orange light from molten glow far at the end of the space, industrial cathedral volume, empty. ${LIGHT_SPATIAL_SUFFIX}`,
  },
  indigo: {
    file: "studio-scene-indigo-midnight-light-4k.webp",
    png: "studio-scene-indigo-midnight-light.png",
    prompt: `White penthouse room before floor-to-ceiling glass, white floor and minimal white walls, soft indigo blue city twilight outside, interior still bright high-key, empty night view space. ${LIGHT_SPATIAL_SUFFIX}`,
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
    prompt: `Modern creative studio interior at blue hour, emerald green accent ambient light on minimalist glass desks, floor-to-ceiling windows with soft city bokeh outside, quiet empty workspace. ${CINEMATIC_SUFFIX}`,
  },
  gold: {
    file: "studio-scene-gold-archive-4k.webp",
    prompt: `Grand vintage archive library, floor-to-ceiling leather-bound books, warm tungsten reading lamps, golden dust motes floating in a single sun shaft, worn oak tables. ${CINEMATIC_SUFFIX}`,
  },
  ocean: {
    file: "studio-scene-ocean-depth-4k.webp",
    prompt: `Open ocean horizon at pre-dawn, gentle rolling waves catching first cyan light, vast calm sea meeting soft sky gradient, minimal composition. ${CINEMATIC_SUFFIX}`,
  },
  ember: {
    file: "studio-scene-ember-forge-4k.webp",
    prompt: `Traditional blacksmith forge interior, orange fire glow reflecting on hammered steel and brick, wisps of smoke, dramatic chiaroscuro, worn tools on bench. ${CINEMATIC_SUFFIX}`,
  },
  mint: {
    file: "studio-scene-mint-meadow-4k.webp",
    prompt: `Misty green meadow at first light, dew on wild grass, distant tree line fading into soft fog, patient wide landscape. ${CINEMATIC_SUFFIX}`,
  },
  violet: {
    file: "studio-scene-violet-dusk-4k.webp",
    prompt: `Purple twilight over rolling lavender fields, distant hills under violet sky, last warm rim light on horizon, serene rural landscape. ${CINEMATIC_SUFFIX}`,
  },
  rose: {
    file: "studio-scene-rose-bloom-4k.webp",
    prompt: `Rain-wet English rose garden after shower, soft pink petals with water droplets, overcast diffused light, stone path between beds. ${CINEMATIC_SUFFIX}`,
  },
  cobalt: {
    file: "studio-scene-cobalt-skyline-4k.webp",
    prompt: `Metropolitan skyline at blue hour from high terrace, glass towers reflecting last light, cool cobalt sky deepening, empty rooftop foreground. ${CINEMATIC_SUFFIX}`,
  },
  coral: {
    file: "studio-scene-coral-reef-4k.webp",
    prompt: `Underwater coral reef in clear tropical water, sunlight caustics dancing on colorful coral formations, gentle particulate, serene marine still. ${CINEMATIC_SUFFIX}`,
  },
  sage: {
    file: "studio-scene-sage-grove-4k.webp",
    prompt: `Ancient temperate forest grove, moss-covered boulders, dappled green canopy light on fern floor, quiet old-growth atmosphere. ${CINEMATIC_SUFFIX}`,
  },
  cherry: {
    file: "studio-scene-cherry-pulse-4k.webp",
    prompt: `Rain-slick urban alley at night, red neon reflections on wet asphalt, steam rising from grate, cinematic noir mood without people. ${CINEMATIC_SUFFIX}`,
  },
  teal: {
    file: "studio-scene-teal-lagoon-4k.webp",
    prompt: `Tropical lagoon from elevated view, turquoise shallow water over white sand, palm shadows, crystal clear Caribbean clarity. ${CINEMATIC_SUFFIX}`,
  },
  lime: {
    file: "studio-scene-lime-canopy-4k.webp",
    prompt: `Dense jungle canopy viewed from below, bright lime-green leaves against sky, sun shafts piercing foliage, humid tropical atmosphere. ${CINEMATIC_SUFFIX}`,
  },
  fuchsia: {
    file: "studio-scene-fuchsia-neon-4k.webp",
    prompt: `Neon-lit Asian city street at night, magenta and fuchsia sign glow on wet pavement, bokeh lights receding into depth, cyberpunk color without crowds. ${CINEMATIC_SUFFIX}`,
  },
  copper: {
    file: "studio-scene-copper-foundry-4k.webp",
    prompt: `Industrial copper foundry interior, molten metal orange glow, steam and sparks frozen in still frame, rust and patina textures on machinery. ${CINEMATIC_SUFFIX}`,
  },
  indigo: {
    file: "studio-scene-indigo-midnight-4k.webp",
    prompt: `Moonlit quiet city viewed through tall window at midnight, deep indigo sky, soft interior silhouette edge, distant amber street lights. ${CINEMATIC_SUFFIX}`,
  },
};