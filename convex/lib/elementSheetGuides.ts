import type { ElementSheetType } from "./elementSheets";

export type SheetReferencePolicy = {
  minImageRefs: number;
  recommendedMin: number;
  recommendedMax: number;
  outputDescription: string;
  uploadChecklist: string[];
  fidelityLocks: string[];
  workflow: string[];
};

export const ELEMENT_SHEET_REFERENCE_POLICY: Record<
  Exclude<ElementSheetType, "doc">,
  SheetReferencePolicy
> = {
  character: {
    minImageRefs: 3,
    recommendedMin: 4,
    recommendedMax: 8,
    outputDescription:
      "One 16:9 image with three panels: full-body front, full-body back, head closeup (single visible face).",
    uploadChecklist: [
      "Clear face closeup (neutral expression)",
      "Full-body front (shows wardrobe and proportions)",
      "Full-body side or 3/4 (silhouette and hair volume)",
      "Optional: back view, detail of hair, hands, shoes, or signature accessory",
    ],
    fidelityLocks: [
      "Do NOT restyle, beautify, slim, age-shift, or change ethnicity",
      "Do NOT change hairstyle, hair length, hair texture, or hair color",
      "Do NOT change skin tone, face structure, body build, or height",
      "Do NOT add or remove wardrobe, jewelry, tattoos, scars, or accessories",
      "Capture exactly what the reference photos show — documentary fidelity only",
    ],
    workflow: [
      "Upload 3–8 strong reference photos (not one selfie)",
      "studio_create_element with referenceAssetIds (unbuilt state)",
      "studio_generate_element_text_sheet — optional markdown production bible",
      "studio_generate_element_sheet — builds sheet image (built state: sheetAssetId set)",
      "Visually inspect sheetUrl; use referenceElementIds or sheetAssetId in video/image gen — never raw upload refs",
    ],
  },
  prop: {
    minImageRefs: 2,
    recommendedMin: 3,
    recommendedMax: 6,
    outputDescription:
      "One 16:9 image with two panels: straight-on front and three-quarter view. Same object, no people or hands.",
    uploadChecklist: [
      "Straight-on front (labels/branding visible if present)",
      "Three-quarter angle (depth and proportions)",
      "Optional: back, top, scale reference, macro of wear/damage/material",
    ],
    fidelityLocks: [
      "Do NOT redesign, clean up, or idealize the object",
      "Do NOT change materials, colors, proportions, branding, or wear patterns",
      "Do NOT add hands, people, or scene context",
      "Match scratches, dents, labels, and patina exactly as photographed",
    ],
    workflow: [
      "Upload 2–6 reference photos of the same object",
      "studio_create_element type=prop with referenceAssetIds",
      "studio_generate_element_sheet resolution=2K → buildStatus=built",
      "Use sheetAssetId or referenceElementIds in generation — not upload refs",
    ],
  },
  location: {
    minImageRefs: 2,
    recommendedMin: 3,
    recommendedMax: 6,
    outputDescription:
      "One wide establishing plate from a three-quarter angle. No people, no text.",
    uploadChecklist: [
      "Wide establishing angle",
      "Alternate angle showing depth layers (foreground / mid / back)",
      "Optional: detail of key architectural or set dressing features",
    ],
    fidelityLocks: [
      "Do NOT redesign the space or change era/architecture",
      "Do NOT add or remove furniture, signage, or landmarks not in refs",
      "Preserve layout, palette, lighting direction, and material finishes",
    ],
    workflow: [
      "Upload 2–6 reference photos of the same space",
      "studio_create_element type=location with referenceAssetIds",
      "studio_generate_element_sheet resolution=2K → buildStatus=built",
      "Use sheetAssetId or referenceElementIds in generation — not upload refs",
    ],
  },
};

export function sheetReferencePolicy(
  type: ElementSheetType,
): SheetReferencePolicy | null {
  if (type === "doc") {
    return null;
  }
  return ELEMENT_SHEET_REFERENCE_POLICY[type];
}

export function assertEnoughSheetImageReferences(args: {
  type: ElementSheetType;
  imageRefCount: number;
}): void {
  const policy = sheetReferencePolicy(args.type);
  if (!policy) {
    return;
  }
  if (args.imageRefCount >= policy.minImageRefs) {
    return;
  }
  throw new Error(
    [
      `${args.type} sheet generation needs at least ${policy.minImageRefs} reference image(s); got ${args.imageRefCount}.`,
      `Recommended: ${policy.recommendedMin}–${policy.recommendedMax} clear photos before calling generate-sheet.`,
      `Upload with studio_upload_asset, attach via referenceAssetIds on create/update, then studio_generate_element_sheet.`,
      `Fidelity rule: capture features exactly as photographed — do not restyle or change identity.`,
    ].join(" "),
  );
}

export const ELEMENT_PRODUCTION_GUIDE = {
  buildStates: {
    unbuilt:
      "Element has referenceAssetIds (upload photos) only. buildStatus=unbuilt. Cannot attach to generation yet.",
    built:
      "Element has sheetAssetId (generated sheet image) + referenceAssetIds. buildStatus=built. Ready for generation.",
  },
  generationRules: [
    "Upload refs → create element (unbuilt) → generate text sheet (optional) → generate sheet image (built)",
    "When generating image/video: use referenceElementIds OR sheetAssetId — NEVER raw referenceAssetIds",
    "Element description (markdown bible) is appended to the prompt automatically when using referenceElementIds",
    "Cinema defaults: stylePreset raw, skipPromptEnhancement true",
    "Visually inspect sheetUrl after build before production video",
  ],
  mcpWorkflow: [
    "studio_element_sheet_guide",
    "studio_upload_asset × N",
    "studio_create_element { referenceAssetIds }",
    "studio_generate_element_text_sheet (optional)",
    "studio_generate_element_sheet → returns element with sheetAssetId, buildStatus=built",
    "studio_generate_video { referenceElementIds: [elementId], stylePreset: raw, skipPromptEnhancement: true }",
  ],
};

export function sheetFidelityPromptSuffix(type: ElementSheetType): string {
  const policy = sheetReferencePolicy(type);
  if (!policy) {
    return "";
  }
  return [
    "CRITICAL FIDELITY: This is a production reference sheet, not a creative reinterpretation.",
    ...policy.fidelityLocks.map((rule) => `- ${rule}`),
    "If reference images are attached, treat them as ground truth — reproduce visible features exactly.",
  ].join(" ");
}
