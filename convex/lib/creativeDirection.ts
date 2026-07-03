import {
  storytellingSystemLayer,
  storytellingUserSection,
  STORYTELLING_NEVER,
} from "./storytellingFoundation";

export const GEN_PROMPT_HEADING = "## Generation prompt";

export type CreativeOutputKind = "script" | "image_prompt" | "video_prompt";

export type CreativeDirectionContext = {
  userPrompt: string;
  presetName?: string;
  presetInstructions: string;
  scriptInstructions?: string;
  negativePrompt?: string;
  outputKind: CreativeOutputKind;
  /** When false, the preset's own energy leads and only the show-don't-tell core applies. Defaults to true. */
  storytellingEnabled?: boolean;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  hasVideoReference?: boolean;
  hasImageReference?: boolean;
  hasAudioReference?: boolean;
  attachedScriptMarkdown?: string[];
  referenceSummaries?: string[];
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

export function buildCreativeSystemPrompt(
  context: Pick<
    CreativeDirectionContext,
    "outputKind" | "hasVideoReference" | "storytellingEnabled" | "durationSeconds"
  >,
): string {
  const narrative = storytellingActive(context)
    ? storytellingSystemLayer(context.outputKind, {
        hasVideoReference: context.hasVideoReference,
        durationSeconds: context.durationSeconds,
      })
    : SHOW_DONT_TELL_CORE;

  if (context.outputKind === "script") {
    return [
      narrative,
      "Write production-ready Markdown scripts for short-form video.",
      "Include shot timing, visual notes, minimal dialogue, audio/SFX notes.",
      `End with a section titled exactly "${GEN_PROMPT_HEADING}" — a single Seedance-ready prompt distilled from the script.`,
      BASE_RULES,
    ].join(" ");
  }

  if (context.outputKind === "video_prompt") {
    if (context.hasVideoReference) {
      return [
        narrative,
        "Rewrite into Seedance 2.0 footage VFX prompt.",
        "Lock unchanged elements. Name exact frame the effect begins.",
        "One primary camera move per beat. Film-grade lens, lighting, grade vocabulary.",
        BASE_RULES,
      ].join(" ");
    }
    return [
      narrative,
      "Rewrite into Seedance 2.0 text-to-video prompt.",
      "Short style header, then timed beats when duration is known.",
      "One primary camera move per beat. Specify light, environment, observable action, SFX.",
      BASE_RULES,
    ].join(" ");
  }

  return [
    narrative,
    "Rewrite into a GPT Image 2 prompt.",
    "Composition, lighting, lens, materials — one clearly generatable still image.",
    BASE_RULES,
  ].join(" ");
}

export function buildCreativeUserPrompt(context: CreativeDirectionContext): string {
  const sections: string[] = [];

  if (storytellingActive(context)) {
    sections.push(storytellingUserSection(context.outputKind));
  }

  if (context.presetName) {
    sections.push(`Creative preset: ${context.presetName}`);
  }
  sections.push(`Preset direction:\n${context.presetInstructions}`);

  if (context.outputKind === "script" && context.scriptInstructions?.trim()) {
    sections.push(`Preset script notes:\n${context.scriptInstructions.trim()}`);
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
    if (context.hasVideoReference) production.push("Video reference attached: use footage-VFX framing.");
    if (context.hasImageReference) production.push("Image reference attached: lock subject/product consistency.");
    if (production.length) sections.push(`Production:\n${production.join("\n")}`);
  }

  if (context.referenceSummaries?.length) {
    sections.push(`References:\n${context.referenceSummaries.join("\n")}`);
  }

  const attachedScripts = context.attachedScriptMarkdown ?? [];
  if (attachedScripts.length) {
    sections.push(
      `Attached scripts (honor their human truth and witness object; extract observational visual language):\n${attachedScripts
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
    sections.push(
      [
        "Return Markdown only.",
        storytellingActive(context)
          ? "Follow the required script structure from the storytelling foundation."
          : "Structure: title, concept, timed shot-by-shot scenes, minimal dialogue, visual and audio notes.",
        `Include "${GEN_PROMPT_HEADING}" as the final section.`,
        "The generation prompt must describe only what the camera can see — concrete action, light, and objects.",
      ].join(" "),
    );
    return sections.filter(Boolean).join("\n\n");
  }

  const promptSeed = resolvePromptSeed(context);
  sections.push(`User request:\n${promptSeed}`);
  sections.push(
    storytellingActive(context)
      ? "Return only the final model-ready prompt text. Embody the storytelling principles on screen — observable life, witness object, patient camera. No preamble."
      : "Return only the final model-ready prompt text. Stay true to the preset's energy and the user's request. No preamble.",
  );
  return sections.filter(Boolean).join("\n\n");
}
