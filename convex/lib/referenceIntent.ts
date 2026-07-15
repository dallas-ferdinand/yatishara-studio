import { DIRECT_PROMPT_PRESET_SLUGS } from "./skipPromptEnhancement";

export const REFERENCE_INTENT_SLUGS = [
  "auto",
  "stylize",
  "match_reference",
  "element_lock",
] as const;

export type ReferenceIntentSlug = (typeof REFERENCE_INTENT_SLUGS)[number];

export type ReferenceContext = {
  intent?: string | null;
  presetSlug?: string;
  /** When set, generation is styled — do not treat unstyled preset as Direct. */
  styleSheetElementId?: string | null;
  hasRawImageRef?: boolean;
  hasElementAttachment?: boolean;
  hasBuiltElementRef?: boolean;
  hasVideoRef?: boolean;
};

export function normalizeReferenceIntent(value?: string | null): ReferenceIntentSlug {
  const slug = String(value ?? "auto").trim().toLowerCase();
  if ((REFERENCE_INTENT_SLUGS as readonly string[]).includes(slug)) {
    return slug as ReferenceIntentSlug;
  }
  return "auto";
}

export function resolveReferenceIntent(context: ReferenceContext): ReferenceIntentSlug {
  const requested = normalizeReferenceIntent(context.intent);
  if (requested !== "auto") {
    return requested;
  }

  const isDirect =
    !context.styleSheetElementId &&
    Boolean(context.presetSlug && DIRECT_PROMPT_PRESET_SLUGS.has(context.presetSlug));
  if (isDirect) {
    return context.hasRawImageRef ? "match_reference" : "element_lock";
  }

  if (context.hasBuiltElementRef || (context.hasElementAttachment && !context.hasRawImageRef)) {
    return "element_lock";
  }

  if (context.hasRawImageRef) {
    return "stylize";
  }

  return "stylize";
}

/** Enhancement-layer instructions for image/video prompt rewrite. */
export function referenceIntentEnhancementLayer(
  intent: ReferenceIntentSlug,
  outputKind: "image_prompt" | "video_prompt" | "script",
): string | undefined {
  switch (intent) {
    case "match_reference":
      return [
        "Reference intent: MATCH REFERENCE.",
        "Preserve photographic fidelity from attached images — identity, materials, proportions, lighting mood.",
        "Do not cartoonize or restyle unless the user brief explicitly overrides.",
        outputKind === "video_prompt"
          ? "Video: treat refs as ground truth for subject lock; motion may be new."
          : "Image: output must read as the same subject/product as the reference photos.",
      ].join(" ");
    case "element_lock":
      return [
        "Reference intent: ELEMENT LOCK.",
        "Built element sheets and element descriptions are canonical — honor their design, palette, and silhouette.",
        "Stylize into the active cartoon preset; do not drift toward photoreal skin or catalog product gloss.",
        "Raw upload photos are secondary; element bible + sheet win conflicts.",
      ].join(" ");
    case "stylize":
      return [
        "Reference intent: STYLIZE TO PRESET.",
        "Use attached images for identity and layout cues only — translate into the active style preset look.",
        "Cartoon production: consistent line weight, flat cel shading, readable expression, no photoreal skin or film grain.",
        "Witness objects share the same palette register as cast.",
      ].join(" ");
    default:
      return undefined;
  }
}

export function referenceIntentProductionNotes(
  intent: ReferenceIntentSlug,
  hasImageReference: boolean,
  hasVideoReference: boolean,
): string[] {
  if (!hasImageReference && !hasVideoReference) {
    return [];
  }

  const notes: string[] = [];
  if (hasVideoReference) {
    notes.push(
      intent === "match_reference"
        ? "Video reference attached: footage-VFX — lock unchanged regions; name the frame the effect begins."
        : "Video reference attached: stylize motion into preset look while preserving subject identity.",
    );
  }
  if (hasImageReference) {
    notes.push(
      intent === "match_reference"
        ? "Image reference attached: match photographic subject fidelity."
        : intent === "element_lock"
          ? "Image/element reference attached: lock built element design; stylize per preset."
          : "Image reference attached: extract identity cues; render in active preset cartoon look.",
    );
  }
  return notes;
}
