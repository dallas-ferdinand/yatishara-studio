import { GEN_PROMPT_HEADING } from "./creativeDirection";

export type ElementSheetType = "character" | "prop" | "location" | "doc";

export function sheetTitleForType(type: ElementSheetType): string {
  switch (type) {
    case "character":
      return "Character sheet";
    case "prop":
      return "Prop sheet";
    case "location":
      return "Location sheet";
    case "doc":
      return "Style sheet";
  }
}

const BASE_RULES =
  "Describe only what a camera can observe. No emotion labels without visible behavior. No marketing adjectives. Preserve the creator's intent from references.";

const SHEET_IMAGE_BASE_RULES = [
  "Seamless neutral light-gray studio background with zero clutter — no environment, no scenery, no furniture, no props beyond the subject.",
  "Absolutely no text, labels, captions, annotations, logos, watermarks, borders, or grid lines anywhere in the image.",
  "Soft even studio lighting, no dramatic shadows.",
  "Photorealistic, documentary-grade detail and texture — not illustration, not 3D render style.",
].join(" ");

/**
 * Image-sheet prompts follow the production workflow for AI video reference
 * sheets: all needed angles in one image, exactly one visible face so the
 * video model has a single face to lock onto, and identical identity across
 * panels. Notes ("doc") elements are text-only and return null.
 */
export function buildElementSheetImagePrompt(args: {
  type: ElementSheetType;
  name: string;
}): string | null {
  const name = args.name.trim() || "the subject";
  switch (args.type) {
    case "character":
      return [
        `Character reference sheet of ${name} in three panels side by side: full-body front view standing in a neutral pose, full-body back view standing, and a large head-and-shoulders closeup.`,
        "The face is clearly visible ONLY in the closeup panel — exactly one visible face in the whole image so a video model has a single face to lock onto.",
        "Identical person in every panel: exactly the same face structure, hairstyle, hair texture and volume, skin tone, build, height, and wardrobe. Do not restyle, do not idealize, do not change the hair.",
        "Match the identity in the attached reference images exactly if provided.",
        SHEET_IMAGE_BASE_RULES,
      ].join(" ");
    case "prop":
      return [
        `Product reference sheet of ${name} in two panels side by side: straight-on front view and a three-quarter perspective view.`,
        "Identical object in both panels: exactly the same materials, colors, proportions, branding, and wear. No hands, no people.",
        "Match the object in the attached reference images exactly if provided.",
        SHEET_IMAGE_BASE_RULES,
      ].join(" ");
    case "location":
      return [
        `Location reference plate of ${name}: a single wide establishing shot from a three-quarter angle to give the space depth for camera movement.`,
        "Bright, clean, high-end commercial look. No people, no text, no logos, no watermarks.",
        "Match the space in the attached reference images exactly if provided.",
        "Photorealistic, documentary-grade detail — not illustration, not 3D render style.",
      ].join(" ");
    case "doc":
      return null;
  }
}

function characterSystemPrompt(): string {
  return [
    "You write production-ready character sheets for AI image and video generation.",
    "Extract identity from reference images and any notes — face structure, hair, skin, build, wardrobe, distinguishing marks, typical posture and gesture.",
    "Lock consistency rules the model must preserve across every shot. The face, hairstyle, hair texture, and skin tone must never change between shots — state this as a hard lock.",
    `End with a section titled exactly "${GEN_PROMPT_HEADING}" — one Seedance/GPT-Image-ready paragraph distilling the character for generation.`,
    BASE_RULES,
  ].join(" ");
}

function propSystemPrompt(): string {
  return [
    "You write production-ready prop sheets for AI image and video generation.",
    "Extract materials, color, scale, branding, wear, how light hits the surface, and how hands or actors interact with it.",
    "Specify what must stay identical across shots (logo placement, color, proportions).",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph for generating this prop.`,
    BASE_RULES,
  ].join(" ");
}

function locationSystemPrompt(): string {
  return [
    "You write production-ready location/set sheets for AI image and video generation.",
    "Extract geography, era, architecture, key landmarks, layout, time of day, weather, practical lights, and atmosphere.",
    "Note camera-friendly angles and depth layers (foreground, mid, background).",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph for this set.`,
    BASE_RULES,
  ].join(" ");
}

function docSystemPrompt(): string {
  return [
    "You write style and reference sheets from uploaded mood boards, notes, or media.",
    "Extract palette, lighting taste, lens/grade cues, texture, pacing energy, and hard rules (do / don't).",
    `End with "${GEN_PROMPT_HEADING}" — one model-ready paragraph capturing the visual direction.`,
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
    "Study every attached reference. If video or audio is attached, infer motion, sound, or performance cues where visible.",
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
