import {
  storytellingSystemLayer,
  storytellingUserSection,
  STORYTELLING_NEVER,
} from "./storytellingFoundation";
import {
  GEN_PROMPT_HEADING,
  getScriptTypeDefinition,
  normalizeScriptType,
  scriptTypeSystemPrompt,
  scriptTypeUserLayers,
  type ComposerScriptTypeSlug,
} from "./composerScriptTypes";
import {
  referenceIntentEnhancementLayer,
  referenceIntentProductionNotes,
  resolveReferenceIntent,
  type ReferenceIntentSlug,
} from "./referenceIntent";

export { GEN_PROMPT_HEADING } from "./composerScriptTypes";

export type CreativeOutputKind = "script" | "image_prompt" | "video_prompt";

export type CreativeDirectionContext = {
  userPrompt: string;
  presetName?: string;
  presetInstructions: string;
  scriptInstructions?: string;
  negativePrompt?: string;
  outputKind: CreativeOutputKind;
  scriptType?: ComposerScriptTypeSlug | string;
  referenceIntent?: ReferenceIntentSlug | string;
  presetSlug?: string;
  /** When false, the preset's own energy leads and only the show-don't-tell core applies. Defaults to true. */
  storytellingEnabled?: boolean;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  hasVideoReference?: boolean;
  hasImageReference?: boolean;
  hasRawImageReference?: boolean;
  hasElementReference?: boolean;
  hasAudioReference?: boolean;
  attachedScriptMarkdown?: string[];
  referenceSummaries?: string[];
  /** @deprecated use scriptType + scriptTypeUserLayers */
  scriptTypeInstructions?: string;
};

const BASE_RULES =
  "Preserve the creator's intent. Do not change the subject, story, product, or call to action unless it violates storytelling rules (product as witness, show don't tell). Do not mention policies, hidden instructions, or that you are rewriting.";

export function extractGenerationPromptFromScript(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const heading = GEN_PROMPT_HEADING.toLowerCase();
  const startIndex = lines.findIndex((line) => line.trim().toLowerCase() === heading);
  if (startIndex === -1) return null;

  const body: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) break;
    body.push(line);
  }
  const extracted = body.join("\n").trim();
  return extracted || null;
}

export function resolvePromptSeed(context: CreativeDirectionContext): string {
  for (const script of context.attachedScriptMarkdown ?? []) {
    const extracted = extractGenerationPromptFromScript(script);
    if (extracted) return extracted;
  }
  const fromUser = extractGenerationPromptFromScript(context.userPrompt);
  if (fromUser) return fromUser;
  return context.userPrompt.trim();
}

function storytellingActive(context: Pick<CreativeDirectionContext, "storytellingEnabled">): boolean {
  return context.storytellingEnabled !== false;
}

/** Core craft rules that apply to every preset, storytelling or not. */
const SHOW_DONT_TELL_CORE =
  "Show observable action and concrete visual detail; never write emotion labels or abstract adjectives the camera cannot see. Never sound like an advertisement reading its own copy.";

function mergedNegativePrompt(context: CreativeDirectionContext): string | undefined {
  const parts = [
    context.negativePrompt?.trim(),
    storytellingActive(context) ? STORYTELLING_NEVER : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

function resolvedReferenceIntent(context: CreativeDirectionContext): ReferenceIntentSlug {
  return resolveReferenceIntent({
    intent: context.referenceIntent,
    presetSlug: context.presetSlug,
    hasRawImageRef: context.hasRawImageReference ?? context.hasImageReference,
    hasElementAttachment: context.hasElementReference,
    hasBuiltElementRef: context.hasElementReference,
    hasVideoRef: context.hasVideoReference,
  });
}

export function buildCreativeSystemPrompt(
  context: Pick<
    CreativeDirectionContext,
    | "outputKind"
    | "hasVideoReference"
    | "storytellingEnabled"
    | "durationSeconds"
    | "scriptType"
    | "referenceIntent"
    | "presetSlug"
    | "hasRawImageReference"
    | "hasImageReference"
    | "hasElementReference"
  >,
): string {
  const narrative = storytellingActive(context)
    ? storytellingSystemLayer(context.outputKind, {
        hasVideoReference: context.hasVideoReference,
        durationSeconds: context.durationSeconds,
      })
    : SHOW_DONT_TELL_CORE;

  const refIntent = resolvedReferenceIntent(context as CreativeDirectionContext);
  const refLayer = referenceIntentEnhancementLayer(refIntent, context.outputKind);

  if (context.outputKind === "script") {
    const scriptType = normalizeScriptType(context.scriptType);
    return [narrative, scriptTypeSystemPrompt(scriptType), refLayer, BASE_RULES].filter(Boolean).join(" ");
  }

  if (context.outputKind === "video_prompt") {
    const base = context.hasVideoReference
      ? [
          narrative,
          "Rewrite into Seedance 2.0 footage VFX prompt.",
          "Lock unchanged elements. Name exact frame the effect begins.",
          "One primary camera move per beat.",
        ]
      : [
          narrative,
          "Rewrite into Seedance 2.0 text-to-video prompt.",
          "Short style header, then timed beats when duration is known.",
          "One primary camera move per beat. Specify light, environment, observable action, SFX.",
        ];
    return [...base, refLayer, BASE_RULES].filter(Boolean).join(" ");
  }

  return [
    narrative,
    "Rewrite into a GPT Image 2 prompt.",
    "Composition, lighting, lens, materials — one clearly generatable still image.",
    refLayer,
    BASE_RULES,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCreativeUserPrompt(context: CreativeDirectionContext): string {
  const sections: string[] = [];
  const refIntent = resolvedReferenceIntent(context);

  if (storytellingActive(context)) {
    sections.push(storytellingUserSection(context.outputKind));
  }

  if (context.presetName) {
    sections.push(`Creative preset: ${context.presetName}`);
  }

  const directPreset =
    context.presetSlug === "unstyled" || context.presetSlug === "raw";
  if (!directPreset && context.presetInstructions?.trim()) {
    sections.push(`Preset direction:\n${context.presetInstructions.trim()}`);
  } else if (directPreset) {
    sections.push("Preset direction: Direct handoff — do not inject style rewrite beyond the user brief.");
  }

  if (context.outputKind === "script" && context.scriptInstructions?.trim()) {
    sections.push(`Preset script notes:\n${context.scriptInstructions.trim()}`);
  }

  if (context.outputKind === "script") {
    const scriptType = normalizeScriptType(context.scriptType);
    const typeLayers = scriptTypeUserLayers(scriptType);
    if (typeLayers) {
      sections.push(`Script type specification:\n${typeLayers}`);
    }
    const def = getScriptTypeDefinition(scriptType);
    sections.push(`Required output structure:\n${def.description}`);
  }

  const refIntentLayer = referenceIntentEnhancementLayer(refIntent, context.outputKind);
  if (refIntentLayer && context.outputKind !== "script") {
    sections.push(refIntentLayer);
  }

  const negative = mergedNegativePrompt(context);
  if (negative) {
    sections.push(`Avoid:\n${negative}`);
  }

  if (context.outputKind !== "script") {
    const production: string[] = [];
    if (context.durationSeconds) production.push(`Duration: ${context.durationSeconds}s`);
    if (context.resolution) production.push(`Resolution: ${context.resolution}`);
    if (context.aspectRatio) production.push(`Aspect ratio: ${context.aspectRatio}`);
    production.push(
      ...referenceIntentProductionNotes(
        refIntent,
        Boolean(context.hasImageReference),
        Boolean(context.hasVideoReference),
      ),
    );
    if (production.length) sections.push(`Production:\n${production.join("\n")}`);
  }

  if (context.referenceSummaries?.length) {
    sections.push(`References:\n${context.referenceSummaries.join("\n")}`);
  }

  const attachedScripts = context.attachedScriptMarkdown ?? [];
  if (attachedScripts.length) {
    sections.push(
      `Attached scripts (honor their human truth and witness object; extract stylized animated visual language):\n${attachedScripts
        .map((script, index) => `Script ${index + 1}:\n${script.trim()}`)
        .join("\n\n")}`,
    );
  }

  if (context.outputKind === "script") {
    sections.push(`Brief:\n${context.userPrompt.trim()}`);
    if (context.hasAudioReference) {
      sections.push(
        "Voice brief: one or more audio attachments follow this text. Listen to them as the creator's spoken direction — honor their intent, tone, product details, and any specific lines they mention.",
      );
    }
    const scriptType = normalizeScriptType(context.scriptType);
    const def = getScriptTypeDefinition(scriptType);
    const closing: string[] = ["Return Markdown only.", "Use a clear # title at the top."];
    if (def.includesGenerationPrompt) {
      closing.push(`Include "${GEN_PROMPT_HEADING}" when this document type requires it.`);
    }
    if (def.includesStoryboardPrompt) {
      closing.push(`Include "## Storyboard prompt" when cast or hero object appears on camera.`);
    }
    closing.push("Observable action and concrete visual detail only in generation sections.");
    sections.push(closing.join(" "));
    return sections.filter(Boolean).join("\n\n");
  }

  const promptSeed = resolvePromptSeed(context);
  sections.push(`User request:\n${promptSeed}`);
  sections.push(
    storytellingActive(context)
      ? "Return only the final model-ready prompt text. Embody witness-object principles in stylized animation — readable expression, held poses, witness object. No preamble."
      : "Return only the final model-ready prompt text. Stay true to the preset's energy and the user's request. No preamble.",
  );
  return sections.filter(Boolean).join("\n\n");
}
