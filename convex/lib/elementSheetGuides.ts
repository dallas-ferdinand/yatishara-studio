import type { ElementSheetType } from "./elementSheets";

export type ElementSourceMode = "photographic" | "designed";

export type SheetReferencePolicy = {
  minImageRefs: number;
  minImageRefsDesigned: number;
  recommendedMin: number;
  recommendedMax: number;
  outputDescription: string;
  uploadChecklist: string[];
  fidelityLocks: string[];
  designedWorkflow: string[];
  workflow: string[];
};

export const ELEMENT_SHEET_REFERENCE_POLICY: Record<
  Exclude<ElementSheetType, "doc">,
  SheetReferencePolicy
> = {
  character: {
    minImageRefs: 3,
    minImageRefsDesigned: 0,
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
      "Do NOT restyle into photoreal or anime/manga defaults",
      "Do NOT change hairstyle, hair length, line weight, or palette registers",
      "Do NOT change face structure, body build, or wardrobe design",
      "Capture identity as consistent cartoon design — stylized fidelity only",
    ],
    designedWorkflow: [
      "studio_create_element { type: character, sourceMode: designed, description: full visual spec }",
      "studio_generate_element_sheet — ONE call builds sheet from description (no photo refs, no throwaway plates)",
      "Visually inspect sheetUrl; use referenceElementIds in video gen",
    ],
    workflow: [
      "Upload 3–8 strong reference photos of a REAL person (not one selfie)",
      "studio_create_element { sourceMode: photographic, referenceAssetIds }",
      "studio_generate_element_text_sheet — optional markdown production bible",
      "studio_generate_element_sheet — builds sheet matching photos (built state)",
      "Visually inspect sheetUrl; use referenceElementIds or sheetAssetId in video/image gen — never raw upload refs",
    ],
  },
  prop: {
    minImageRefs: 2,
    minImageRefsDesigned: 0,
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
    designedWorkflow: [
      "studio_create_element { type: prop, sourceMode: designed, description: materials/scale/wear }",
      "studio_generate_element_sheet — direct sheet, one generation credit",
    ],
    workflow: [
      "Upload 2–6 reference photos of a REAL physical object",
      "studio_create_element type=prop with referenceAssetIds, sourceMode: photographic",
      "studio_generate_element_sheet resolution=2K → buildStatus=built",
      "Use sheetAssetId or referenceElementIds in generation — not upload refs",
    ],
  },
  location: {
    minImageRefs: 2,
    minImageRefsDesigned: 0,
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
    designedWorkflow: [
      "Build prop sheets FIRST if set dressing must match (chair, table props, etc.)",
      "studio_create_element { type: location, sourceMode: designed, description: architecture/lighting }",
      "studio_generate_element_sheet { referenceElementIds: [built prop element ids] } — composes location with prop sheets attached",
      "Do NOT generate throwaway location plates before the sheet call",
    ],
    workflow: [
      "Upload 2–6 reference photos of a REAL space",
      "studio_create_element type=location with referenceAssetIds, sourceMode: photographic",
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

/** Infer mode when caller omits sourceMode on create. */
export function inferElementSourceMode(args: {
  explicit?: ElementSourceMode;
  imageRefCount: number;
  type: ElementSheetType;
}): ElementSourceMode {
  if (args.explicit) {
    return args.explicit;
  }
  const policy = sheetReferencePolicy(args.type);
  const minPhoto = policy?.minImageRefs ?? 1;
  return args.imageRefCount >= minPhoto ? "photographic" : "designed";
}

export function assertSheetGenerationReady(args: {
  type: ElementSheetType;
  imageRefCount: number;
  sourceMode: ElementSourceMode;
  description?: string;
}): void {
  const policy = sheetReferencePolicy(args.type);
  if (!policy) {
    return;
  }

  if (args.sourceMode === "designed") {
    const spec = args.description?.trim() ?? "";
    if (spec.length < 40) {
      throw new Error(
        [
          `${args.type} designed sheet requires a detailed description (40+ chars) on the element.`,
          `Use studio_create_element with sourceMode: "designed" and a full visual spec — do NOT generate throwaway reference plates first.`,
          `Real-person characters (e.g. client headshots) use sourceMode: "photographic" with uploaded referenceAssetIds instead.`,
        ].join(" "),
      );
    }
    return;
  }

  if (args.imageRefCount >= policy.minImageRefs) {
    return;
  }
  throw new Error(
    [
      `${args.type} photographic sheet needs at least ${policy.minImageRefs} reference image(s); got ${args.imageRefCount}.`,
      `For fictional characters/props/locations, use sourceMode: "designed" on create_element and a rich description — then one studio_generate_element_sheet call (no photo refs).`,
      `Recommended photographic: ${policy.recommendedMin}–${policy.recommendedMax} clear photos before generate-sheet.`,
    ].join(" "),
  );
}

/** @deprecated Use assertSheetGenerationReady */
export function assertEnoughSheetImageReferences(args: {
  type: ElementSheetType;
  imageRefCount: number;
}): void {
  assertSheetGenerationReady({
    type: args.type,
    imageRefCount: args.imageRefCount,
    sourceMode: "photographic",
  });
}

export const ELEMENT_PRODUCTION_GUIDE = {
  sourceModes: {
    photographic:
      "Real person, physical prop, or real location. Upload reference photos. Sheet must match photos exactly. Use for Tricia (real nurse), client-provided product photos, etc.",
    designed:
      "Fictional / designed asset (elderly mother character, witness chair, kitchen set). NO throwaway reference image generations. Create element with description → one generate_element_sheet call.",
  },
  buildStates: {
    unbuilt:
      "Element registered. photographic: has referenceAssetIds. designed: has description only. buildStatus=unbuilt until sheet built.",
    built:
      "Element has sheetAssetId. buildStatus=built. Ready for referenceElementIds in video/image gen.",
  },
  generationRules: [
    "Choose sourceMode at create: photographic (real + photos) or designed (fictional + description)",
    "Designed: NEVER studio_generate_image plates before generate_element_sheet — wastes credits",
    "Location designed: build prop sheets first, then generate_element_sheet with referenceElementIds for props in the set",
    "When generating image/video: use referenceElementIds OR sheetAssetId — NEVER raw referenceAssetIds",
    "Element description is appended to prompts when using referenceElementIds",
    "IMAGE: all built element sheets attach as refs (characters included)",
    "VIDEO storyboard (studio_generate_image): all referenceElementIds — compose cast + props + locations into one still",
    "VIDEO clip (studio_generate_video): startFrameAssetId required when people on camera; prop/location sheets as [Image N] refs only; character sheets NOT attached — identity lives in start frame + prompt",
    "No scene element type — start frame is a per-shot asset, not a registry element",
    "Direct handoff: stylePreset unstyled + skipPromptEnhancement true on studio_generate_image and studio_generate_video — NO Flash/GPT rewrite; prompts reach Seedance/GPT Image 2 verbatim (see direct-prompt-handoff.md in cartoon-ad-production skill)",
    "stylePresetSlug on studio_generate_element_sheet — unstyled|raw (photoreal sheet, no cartoon stylization) or toon-prime|toon-adult|toon-surreal|toon-family|toon-cgi|toon-neon-idol from production bible",
    "Visually inspect sheetUrl after build before production video",
  ],
  mcpWorkflowDesigned: [
    "studio_element_sheet_guide",
    "studio_create_element { sourceMode: designed, description: full visual spec }",
    "studio_generate_element_sheet → sheetAssetId, buildStatus=built",
    "studio_generate_image { stylePreset: unstyled, skipPromptEnhancement: true, referenceElementIds } → storyboard still → startFrameAssetId",
    "studio_generate_video { stylePreset: unstyled, skipPromptEnhancement: true, startFrameAssetId, referenceElementIds }",
  ],
  mcpWorkflowPhotographic: [
    "studio_element_sheet_guide",
    "studio_upload_asset × N",
    "studio_create_element { sourceMode: photographic, referenceAssetIds }",
    "studio_generate_element_text_sheet (optional)",
    "studio_generate_element_sheet → sheetAssetId, buildStatus=built",
    "studio_generate_image { stylePreset: unstyled, skipPromptEnhancement: true, referenceElementIds } → storyboard still → startFrameAssetId",
    "studio_generate_video { stylePreset: unstyled, skipPromptEnhancement: true, startFrameAssetId, referenceElementIds }",
  ],
};

export function sheetFidelityPromptSuffix(
  type: ElementSheetType,
  sourceMode: ElementSourceMode = "photographic",
  styleFamily: string = "toon-prime",
): string {
  const unstyled = styleFamily === "unstyled" || styleFamily === "raw";
  if (sourceMode === "designed") {
    if (unstyled) {
      return [
        "DESIGNED ASSET: Invent from the written specification below — this is not a photo-match task.",
        "Maintain documentary photorealism, natural skin texture, subtle film grain, no catalog gloss.",
        "Do not add text, logos, or watermarks.",
      ].join(" ");
    }
    return [
      "DESIGNED ASSET: Invent from the written specification below — stylized cartoon turnaround.",
      `Style family: ${styleFamily}. Maintain consistent line weight, flat cel shading, locked palette registers — no photoreal skin, no film grain, no catalog gloss.`,
      "Do not add text, logos, or watermarks.",
    ].join(" ");
  }
  const policy = sheetReferencePolicy(type);
  if (!policy) {
    return "";
  }
  const fidelityLocks = unstyled
    ? [
        "Do NOT restyle, beautify, slim, age-shift, or change ethnicity",
        "Do NOT change hairstyle, hair length, hair texture, or hair color",
        "Do NOT change skin tone, face structure, body build, or height",
        "Do NOT add or remove wardrobe, jewelry, tattoos, scars, or accessories",
        "Capture exactly what the reference photos show — documentary fidelity only",
      ]
    : policy.fidelityLocks;
  return [
    "CRITICAL FIDELITY: This is a production reference sheet, not a creative reinterpretation.",
    ...fidelityLocks.map((rule) => `- ${rule}`),
    "If reference images are attached, treat them as ground truth — reproduce visible features exactly.",
  ].join(" ");
}
