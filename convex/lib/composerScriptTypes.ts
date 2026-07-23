import { promptSnippetForName, shortUniqueToken } from "./generationAssetNames";

export const GEN_PROMPT_HEADING = "## Generation prompt";

export const COMPOSER_SCRIPT_TYPE_SLUGS = [
  "production",
  "storyboard",
  "shot_list",
  "image_prompt",
  "video_prompt",
  "scene_split",
  "style_guide",
  "element_brief",
  "reference_sheet_guide",
  "vo_script",
] as const;

export type ComposerScriptTypeSlug = (typeof COMPOSER_SCRIPT_TYPE_SLUGS)[number];

/** Script types shown in Studio UI. Agent/API still accept the full slug list. */
export const UI_COMPOSER_SCRIPT_TYPE_SLUGS = [
  "production",
  "storyboard",
  "shot_list",
  "image_prompt",
  "video_prompt",
  "scene_split",
  "vo_script",
] as const satisfies readonly ComposerScriptTypeSlug[];

export type ComposerScriptTypeDefinition = {
  slug: ComposerScriptTypeSlug;
  label: string;
  description: string;
  /** Suggested document title prefix when model omits H1 */
  titlePrefix: string;
  /** Whether output should include ## Generation prompt */
  includesGenerationPrompt: boolean;
  /** Whether output should include ## Storyboard prompt (still for I2V) */
  includesStoryboardPrompt: boolean;
};

export const COMPOSER_SCRIPT_TYPES: ComposerScriptTypeDefinition[] = [
  {
    slug: "production",
    label: "Production script",
    description: "Full timed ad script — scenes, dialogue, VO, SFX, and a distilled generation prompt.",
    titlePrefix: "Production script",
    includesGenerationPrompt: true,
    includesStoryboardPrompt: false,
  },
  {
    slug: "storyboard",
    label: "Storyboard",
    description: "Numbered panels with duration, framing, blocking, camera intent, and an opening still prompt.",
    titlePrefix: "Storyboard",
    includesGenerationPrompt: true,
    includesStoryboardPrompt: true,
  },
  {
    slug: "shot_list",
    label: "Shot list",
    description: "Table of shots with IDs, durations, and one-line observable actions — no prose bloat.",
    titlePrefix: "Shot list",
    includesGenerationPrompt: false,
    includesStoryboardPrompt: false,
  },
  {
    slug: "image_prompt",
    label: "Image prompt pack",
    description: "Single still brief for GPT Image 2 — composition, light, materials, one generation prompt.",
    titlePrefix: "Image prompt",
    includesGenerationPrompt: true,
    includesStoryboardPrompt: false,
  },
  {
    slug: "video_prompt",
    label: "Video prompt pack",
    description: "Production-ready timed beats, one camera move per beat, distilled video generation prompt.",
    titlePrefix: "Video prompt",
    includesGenerationPrompt: true,
    includesStoryboardPrompt: false,
  },
  {
    slug: "scene_split",
    label: "Scene split pack",
    description: "Multiple independent scenes (## Scene 1, 2, …), each with shot notes and its own generation prompt.",
    titlePrefix: "Scene pack",
    includesGenerationPrompt: true,
    includesStoryboardPrompt: false,
  },
  {
    slug: "style_guide",
    label: "Style guide",
    description: "Cartoon style bible — render model, palette, line weight, forbidden list, look prefix for storyboards.",
    titlePrefix: "Style guide",
    includesGenerationPrompt: false,
    includesStoryboardPrompt: false,
  },
  {
    slug: "element_brief",
    label: "Element brief",
    description: "Character, prop, or location production bible — identity locks, wardrobe, materials, sheet notes.",
    titlePrefix: "Element brief",
    includesGenerationPrompt: false,
    includesStoryboardPrompt: false,
  },
  {
    slug: "reference_sheet_guide",
    label: "Reference sheet guide",
    description: "Instructions for building multi-panel reference sheets — panel layout, fidelity locks, what to capture.",
    titlePrefix: "Reference sheet guide",
    includesGenerationPrompt: false,
    includesStoryboardPrompt: false,
  },
  {
    slug: "vo_script",
    label: "VO / narrator script",
    description: "Voiceover and narrator lines only — timing cues, pronunciation notes, no shot breakdown.",
    titlePrefix: "VO script",
    includesGenerationPrompt: false,
    includesStoryboardPrompt: false,
  },
];

export const UI_COMPOSER_SCRIPT_TYPES = COMPOSER_SCRIPT_TYPES.filter((item) =>
  (UI_COMPOSER_SCRIPT_TYPE_SLUGS as readonly string[]).includes(item.slug),
);

const STORYBOARD_PROMPT_HEADING = "## Storyboard prompt";

export function normalizeScriptType(value?: string | null): ComposerScriptTypeSlug {
  const slug = String(value ?? "production").trim().toLowerCase();
  if ((COMPOSER_SCRIPT_TYPE_SLUGS as readonly string[]).includes(slug)) {
    return slug as ComposerScriptTypeSlug;
  }
  return "production";
}

export function getScriptTypeDefinition(
  slug?: string | null,
): ComposerScriptTypeDefinition {
  const normalized = normalizeScriptType(slug);
  return COMPOSER_SCRIPT_TYPES.find((item) => item.slug === normalized) ?? COMPOSER_SCRIPT_TYPES[0];
}

/** System-layer instructions for GPT script generation (replaces generic script system prompt). */
export function scriptTypeSystemPrompt(slug: ComposerScriptTypeSlug): string {
  switch (slug) {
    case "storyboard":
      return [
        "Write a storyboard document in Markdown for stylized short-form animation.",
        "Use numbered panels/beats. Each beat: duration, framing (shot size), blocking, camera intent, observable action only.",
        "No emotion labels — show don't tell. Witness-object grammar when a product is present.",
        `Include "${STORYBOARD_PROMPT_HEADING}" with one complete GPT Image 2 still prompt for the opening panel when cast or hero object appears on camera.`,
        `Include "${GEN_PROMPT_HEADING}" only if a motion clip is also needed from beat one; otherwise omit generation prompt.`,
      ].join(" ");
    case "shot_list":
      return [
        "Write a production shot list in Markdown.",
        "Start with a markdown table: shot_id | scene | duration_sec | action (one observable line).",
        "Follow with optional brief notes per shot — camera, prop lock, continuity — no dialogue walls.",
        "Do not include generation prompts unless the brief explicitly asks.",
      ].join(" ");
    case "image_prompt":
      return [
        "Write a single-shot image generation brief in Markdown.",
        "Sections: concept (2–3 lines), composition, lens/framing, light, materials, continuity locks.",
        `End with exactly "${GEN_PROMPT_HEADING}" — one complete GPT Image 2 prompt, model-ready, no preamble.`,
      ].join(" ");
    case "video_prompt":
      return [
        "Write a production-ready video prompt pack in Markdown.",
        "Use timed beats when duration is known. One primary camera move per beat.",
        "Observable action, environment, cel-motivated light, SFX — no emotion labels.",
        `End with exactly "${GEN_PROMPT_HEADING}" — distilled motion prompt (60–100 words when start-frame workflow applies).`,
      ].join(" ");
    case "scene_split":
      return [
        "Split the brief into independently generatable scene documents within one Markdown file.",
        "Use ## Scene 1, ## Scene 2, etc. Each scene: shot list, minimal dialogue, visual notes.",
        `Each scene that needs generation ends with its own "${GEN_PROMPT_HEADING}" section.`,
        "Scenes must chain narratively but be generatable as separate clips.",
      ].join(" ");
    case "style_guide":
      return [
        "Write a cartoon style guide / look bible in Markdown for Yatishara animation production.",
        "Required sections: style_family, render_style, line_weight, shading_model, palette_id, expression_readability, forbidden[] (photoreal, grain, anime tropes unless requested).",
        "Include the mandatory cartoon look prefix block for storyboards (2D cel default).",
        "Include guidance for FULL look on storyboard stills vs abbreviated PRESERVE line on I2V video prompts.",
        "No generation prompt section unless brief asks for a sample still prompt.",
      ].join(" ");
    case "element_brief":
      return [
        "Write an element production bible in Markdown for a character, prop, or location.",
        "Identity locks: face/hair/build/wardrobe/materials/wear — observable facts only.",
        "For characters: expression readability, silhouette, forbidden drift.",
        "For props: materials, scale, witness-object staging rules.",
        "For locations: FG/MG/BG layers, time of day, cel lighting direction.",
        "This document feeds reference sheet generation — be exhaustive and production-ready.",
      ].join(" ");
    case "reference_sheet_guide":
      return [
        "Write a reference sheet build guide in Markdown.",
        "Specify element type (character | prop | location), required photo angles/counts, panel layout (e.g. 3-panel turnaround), fidelity locks (match refs exactly vs stylize to preset).",
        "List what each panel must show. Note gray/neutral background requirement for sheets.",
        "Include checklist for post-sheet visual scrutiny.",
      ].join(" ");
    case "vo_script":
      return [
        "Write a voiceover / narrator script in Markdown.",
        "Table or line-by-line format with timecodes or beat markers when duration is known.",
        "Pronunciation notes, pauses, emphasis — no camera or shot breakdown.",
        "Match witness-object tone: intimate, human, not announcer hype unless brief requests.",
      ].join(" ");
    default:
      return [
        "Write a production-ready Markdown script for short-form stylized video.",
        "Include timed scenes, minimal dialogue, visual and audio/SFX notes.",
        "Witness-object grammar: product silent; life happens around it.",
        `End with "${GEN_PROMPT_HEADING}" — one production-ready prompt distilled from the script.`,
      ].join(" ");
  }
}

/** User-prompt layers appended during enhancement. */
export function scriptTypeUserLayers(slug: ComposerScriptTypeSlug): string | undefined {
  const def = getScriptTypeDefinition(slug);
  const lines: string[] = [`Document type: ${def.label}`, def.description];

  if (def.includesStoryboardPrompt) {
    lines.push(`When cast or hero object is on camera, include "${STORYBOARD_PROMPT_HEADING}" before the generation section.`);
  }
  if (def.includesGenerationPrompt) {
    lines.push(`Include "${GEN_PROMPT_HEADING}" as specified for this document type.`);
  } else {
    lines.push(`Do not add "${GEN_PROMPT_HEADING}" unless the user brief explicitly requests it.`);
  }

  return lines.join("\n");
}

/** @deprecated use scriptTypeUserLayers — kept for MCP import path */
export function scriptTypeInstructions(slug: ComposerScriptTypeSlug): string | undefined {
  return scriptTypeUserLayers(slug);
}

export function scriptDocumentTitle(
  slug: ComposerScriptTypeSlug,
  userPrompt: string,
  contentMarkdown: string,
  uniqueId?: string,
): string {
  const token = ` · ${shortUniqueToken(uniqueId ?? String(Date.now()), 5)}`;
  const markdownTitle = contentMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  if (markdownTitle) {
    const heading = markdownTitle.replace(/^#\s+/, "").trim();
    return `${heading.slice(0, Math.max(12, 80 - token.length))}${token}`.slice(0, 80);
  }
  const def = getScriptTypeDefinition(slug);
  const brief = promptSnippetForName(userPrompt, 36);
  const base = `${def.titlePrefix}${brief ? `: ${brief}` : ""}`;
  return `${base.slice(0, Math.max(12, 80 - token.length))}${token}`.slice(0, 80);
}
