import { buildStyleSheetImagePrompt } from "./styleSheetGuides";
import { sheetFidelityPromptSuffix } from "./elementSheetGuides";
import { GEN_PROMPT_HEADING } from "./composerScriptTypes";
import { DIRECT_PROMPT_PRESET_SLUGS } from "./skipPromptEnhancement";

export type ElementSheetType = "character" | "prop" | "location" | "doc" | "style_sheet";

export type CartoonStyleFamily =
  | "toon-prime"
  | "toon-adult"
  | "toon-surreal"
  | "toon-family"
  | "toon-cgi"
  | "toon-neon-idol";

const STYLE_FAMILY_SHEET_HINT: Record<CartoonStyleFamily, string> = {
  "toon-prime":
    "Prime 2D cel: medium consistent line weight, flat two-tone shading, warm domestic muted palette, sitcom expression readability.",
  "toon-adult":
    "Adult 2D cel: sharper line weight, saturated ironic palette, exaggerated reaction shapes, snappy staging.",
  "toon-surreal":
    "Surreal 2D cel: bold black outlines, thin lanky adults with scribble-pupil eyes and deadpan faces; mundane suburban interiors ruptured by cosmic skies, scale shifts, or miniature landscapes.",
  "toon-family":
    "Family soft 2D: rounded forms, pastel warm palette, gentle flat shading, clear gentle expressions.",
  "toon-cgi":
    "Stylized 3D cartoon: matte toon shader, soft sculpted forms, rim-lit silhouettes, non-photoreal materials.",
  "toon-neon-idol":
    "Neon Idol 3D: polished CGI, saturated neon palette, idol-stage tactical streetwear, glowing energy weapons, neon urban fantasy night city.",
};

export function sheetTitleForType(type: ElementSheetType): string {
  switch (type) {
    case "character":
      return "Character sheet";
    case "prop":
      return "Prop sheet";
    case "location":
      return "Location sheet";
    case "doc":
      return "Style notes";
    case "style_sheet":
      return "Style Sheet";
  }
}

const BASE_RULES =
  "Describe only what is visible in stylized animation. No emotion labels without visible pose or expression. No marketing adjectives. Preserve the creator's intent from references.";

function cartoonSheetBaseRules(styleFamily: CartoonStyleFamily): string {
  return [
    "Seamless neutral flat-color or light-gray turnaround background — no photographic environment.",
    "Absolutely no text, labels, captions, annotations, logos, watermarks, borders, or grid lines anywhere in the image.",
    "Even cel studio lighting for readability — designed shadow shapes, not photographic falloff.",
    STYLE_FAMILY_SHEET_HINT[styleFamily],
    "Traditional stylized animation turnaround — consistent line weight, flat/cel shading. No photoreal skin, no film grain, no live-action look.",
  ].join(" ");
}

const UNSTYLED_SHEET_IMAGE_BASE_RULES = [
  "Seamless neutral light-gray studio background with zero clutter — no environment, no scenery, no furniture, no props beyond the subject.",
  "Absolutely no text, labels, captions, annotations, logos, watermarks, borders, or grid lines anywhere in the image.",
  "Soft even studio lighting, no dramatic shadows.",
  "Photorealistic, documentary-grade detail and texture — not illustration, not 3D render style.",
].join(" ");

function buildUnstyledElementSheetImagePrompt(args: {
  type: ElementSheetType;
  name: string;
  description?: string;
  sourceMode?: "photographic" | "designed";
}): string | null {
  const name = args.name.trim() || "the subject";
  const sourceMode = args.sourceMode ?? "photographic";
  const fidelity = sheetFidelityPromptSuffix(args.type, sourceMode, "unstyled");
  const specBlock = args.description?.trim()
    ? `Visual specification: ${args.description.trim()}`
    : "";
  switch (args.type) {
    case "character":
      return [
        `Character reference sheet of ${name} in three panels side by side: full-body front view standing in a neutral pose, full-body back view standing, and a large head-and-shoulders closeup.`,
        "The face is clearly visible ONLY in the closeup panel — exactly one visible face in the whole image so a video model has a single face to lock onto.",
        sourceMode === "designed"
          ? "Design this fictional character from the written specification — identical person in every panel."
          : "Identical person in every panel: exactly the same face structure, hairstyle, hair texture and volume, skin tone, build, height, and wardrobe. Match attached reference photos exactly.",
        specBlock,
        sourceMode === "photographic"
          ? "Match the identity in the attached reference images exactly if provided."
          : "",
        UNSTYLED_SHEET_IMAGE_BASE_RULES,
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "prop":
      return [
        `Product reference sheet of ${name} in two panels side by side: straight-on front view and a three-quarter perspective view.`,
        "Identical object in both panels: exactly the same materials, colors, proportions, and wear. No hands, no people.",
        specBlock,
        sourceMode === "photographic"
          ? "Match the object in the attached reference images exactly if provided."
          : "",
        UNSTYLED_SHEET_IMAGE_BASE_RULES,
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "location":
      return [
        `Location reference plate of ${name}: a single wide establishing shot from a three-quarter angle to give the space depth for camera movement.`,
        "Documentary Caribbean domestic realism where applicable. No people, no text, no logos, no watermarks.",
        specBlock,
        sourceMode === "photographic"
          ? "Match the space in the attached reference images exactly if provided."
          : "If prop reference sheets are attached, place those exact objects in the set dressing.",
        "Photorealistic, documentary-grade detail with subtle film grain — not illustration, not 3D render style.",
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "doc":
      return null;
    case "style_sheet":
      return null;
  }
}

function buildCartoonElementSheetImagePrompt(args: {
  type: ElementSheetType;
  name: string;
  description?: string;
  sourceMode?: "photographic" | "designed";
  stylePresetSlug?: string;
}): string | null {
  const name = args.name.trim() || "the subject";
  const sourceMode = args.sourceMode ?? "designed";
  const styleFamily: CartoonStyleFamily =
    args.stylePresetSlug && args.stylePresetSlug in STYLE_FAMILY_SHEET_HINT
      ? (args.stylePresetSlug as CartoonStyleFamily)
      : "toon-prime";
  const sheetRules = cartoonSheetBaseRules(styleFamily);
  const fidelity = sheetFidelityPromptSuffix(args.type, sourceMode, styleFamily);
  const specBlock = args.description?.trim()
    ? `Visual specification: ${args.description.trim()}`
    : "";
  switch (args.type) {
    case "character":
      return [
        `Cartoon character reference sheet of ${name} in three panels side by side: full-body front view in neutral pose, full-body back view, and head-and-shoulders closeup for expression readability.`,
        "The face is clearly visible ONLY in the closeup panel — exactly one visible face in the whole image.",
        sourceMode === "designed"
          ? "Design this fictional character from the written specification — identical character design in every panel."
          : "Stylize from reference photos into consistent cartoon design — identical face structure, hairstyle, palette registers, build, and wardrobe in every panel.",
        specBlock,
        sourceMode === "photographic"
          ? "Match identity cues from attached references when stylizing — do not drift to photoreal."
          : "",
        sheetRules,
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "prop":
      return [
        `Cartoon prop reference sheet of ${name} in two panels side by side: straight-on front view and three-quarter perspective.`,
        "Identical stylized object in both panels: same line weight, flat color regions, proportions, and wear. No hands, no people.",
        specBlock,
        sourceMode === "photographic"
          ? "Stylize object from attached references into cartoon prop design."
          : "",
        sheetRules,
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "location":
      return [
        `Stylized cartoon location reference plate of ${name}: single wide establishing shot from three-quarter angle with readable FG/MG/BG layers.`,
        "Animated domestic or brand environment matching style bible — no people, no text, no logos.",
        specBlock,
        sourceMode === "photographic"
          ? "Stylize space from attached references into flat cel environment design."
          : "If prop reference sheets are attached, place those exact stylized objects in set dressing.",
        sheetRules,
        fidelity,
      ]
        .filter(Boolean)
        .join(" ");
    case "doc":
      return null;
    case "style_sheet":
      return null;
  }
}

/**
 * Image-sheet prompts for production reference sheets.
 * stylePresetSlug unstyled|raw → photoreal turnaround; toon-* → cartoon family.
 */
export function buildElementSheetImagePrompt(args: {
  type: ElementSheetType;
  name: string;
  description?: string;
  sourceMode?: "photographic" | "designed";
  stylePresetSlug?: string;
  styleRules?: string;
  renderMode?: "photoreal" | "illustrated_2d" | "illustrated_3d" | "mixed";
  referenceCount?: number;
}): string | null {
  if (args.type === "style_sheet") {
    return buildStyleSheetImagePrompt({
      name: args.name,
      styleRules: args.styleRules ?? args.description,
      renderMode: args.renderMode,
      referenceCount: args.referenceCount ?? 0,
    });
  }
  if (args.stylePresetSlug && DIRECT_PROMPT_PRESET_SLUGS.has(args.stylePresetSlug)) {
    return buildUnstyledElementSheetImagePrompt(args);
  }
  return buildCartoonElementSheetImagePrompt(args);
}

function characterSystemPrompt(): string {
  return [
    "You write production-ready cartoon character sheets for AI image and video generation.",
    "Extract identity — face structure, hair, designed skin tone family, build, wardrobe, distinguishing marks, typical pose and gesture.",
    "Lock consistency rules: line weight, palette registers, and design proportions must never change between shots.",
    `End with a section titled exactly "${GEN_PROMPT_HEADING}" — one model-ready paragraph distilling the stylized character.`,
    BASE_RULES,
  ].join(" ");
}

function propSystemPrompt(): string {
  return [
    "You write production-ready cartoon prop sheets for AI image and video generation.",
    "Extract materials as flat color regions, outline weight, scale, wear, and how cast interacts with the object.",
    "Specify what must stay identical across shots (palette register, proportions, line weight).",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph for this stylized prop.`,
    BASE_RULES,
  ].join(" ");
}

function locationSystemPrompt(): string {
  return [
    "You write production-ready stylized location/set sheets for AI image and video generation.",
    "Extract layout, era, architecture as cartoon staging, time of day, cel lighting direction, and atmosphere.",
    "Note readable depth layers (foreground, mid, background) for 2D composition.",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph for this stylized set.`,
    BASE_RULES,
  ].join(" ");
}

function docSystemPrompt(): string {
  return [
    "You write cartoon style and reference sheets from mood boards, notes, or media.",
    "Extract palette registers, cel lighting taste, line weight, shading model, pacing energy, and hard rules (do / don't).",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph capturing the cartoon visual direction.`,
    BASE_RULES,
  ].join(" ");
}

export function buildElementSheetSystemPrompt(type: ElementSheetType): string {
  switch (type) {
    case "character":
      return characterSystemPrompt();
    case "prop":
      return propSystemPrompt();
    case "location":
      return locationSystemPrompt();
    case "doc":
      return docSystemPrompt();
    case "style_sheet":
      return [
        "You write Style Sheet production bibles for AI image and video generation.",
        "Extract palette, line weight, shading model, render mode, forbidden drift, and consistency locks.",
        `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph capturing the visual direction.`,
        BASE_RULES,
      ].join(" ");
  }
}

export function buildElementSheetUserPrompt(args: {
  type: ElementSheetType;
  name: string;
  existingNotes?: string;
}): string {
  const title = sheetTitleForType(args.type);
  const sections = [
    `${title} for: ${args.name.trim()}`,
    "Study every attached reference. If video or audio is attached, infer motion or performance cues where visible.",
  ];
  if (args.existingNotes?.trim()) {
    sections.push(`Creator notes to honor:\n${args.existingNotes.trim()}`);
  }
  sections.push(
    [
      "Return Markdown only.",
      `Start with a single # heading: ${args.name.trim()} — ${title}`,
      "Use ## sections appropriate to the element type (identity, wardrobe, consistency locks, avoid list, etc.).",
      `Include "${GEN_PROMPT_HEADING}" as the final section with a single dense generation paragraph.`,
      "No preamble.",
    ].join(" "),
  );
  return sections.join("\n\n");
}
