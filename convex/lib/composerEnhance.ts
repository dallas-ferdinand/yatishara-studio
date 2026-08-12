/**
 * In-composer Enhance — charged, unbiased prompt polish for Create.
 * Preserves user intent/style; applies foundational Seedance 2.5 / image / VO / audio rules.
 */
import { generateText } from "ai";
import { ARK_MODEL_IDS, arkLanguageModel, resolveArkModelId } from "./byteplusArk";
import { ELEVEN_V3_AUDIO_TAG_CATALOG } from "./elevenlabsV3AudioTags";
import {
  measuredTextUsageFromGateway,
  type MeasuredTextUsage,
} from "./generationPricing";

export type TextModelResult = {
  text: string;
  usage: MeasuredTextUsage;
};

export type ComposerEnhanceKind =
  | "video"
  | "image"
  | "voiceover"
  | "sfx"
  | "music";

function enhanceModelId(): string {
  return (
    process.env.GATEWAY_COMPOSER_ENHANCE_MODEL_ID?.trim() ||
    process.env.GATEWAY_DM_IMPROVE_MODEL_ID?.trim() ||
    ARK_MODEL_IDS.text
  );
}

const SHARED_RULES = [
  "You enhance generation prompts only. Return the enhanced prompt as plain text — no labels, markdown fences, or explanations.",
  "UNBIASED: preserve the user's intent, creative style, tone, language variety, slang, and specificity. Do not rewrite into a different aesthetic or corporate voice.",
  "Do not invent new plot points, brands, prices, or claims the user did not imply.",
  "Keep proper names, numbers, and on-screen text the user wrote.",
  "Tighten clarity and structure for the target model; remove fluff that hurts generation.",
].join(" ");

const KIND_RULES: Record<ComposerEnhanceKind, string> = {
  video: [
    "Target: Seedance 2.5 / cinematic video prompt.",
    "Prefer concrete camera, subject, action, lighting, and environment beats.",
    "Follow foundational Seedance PE: shot clarity, temporal beats, spatial anchors — without changing the user's vibe.",
    "Do not add music lyrics or voiceover dialogue unless the user asked for them.",
  ].join(" "),
  image: [
    "Target: still image generation.",
    "Prefer subject, composition, lighting, materials, and lens cues.",
    "Do not force a brand look or style sheet the user did not request.",
  ].join(" "),
  voiceover: [
    "Target: ElevenLabs eleven_v3 voiceover script (audio tags).",
    "PRIMARY GOAL: integrate sparse auditory audio tags in square brackets while STRICTLY preserving the original spoken words and meaning.",
    "DO: place tags immediately before or after the segment they affect; tags MUST describe voice/delivery only (emotion, volume, pace, non-verbal voice sounds).",
    "DO: prefer punctuation, CAPS, ? ! or ellipses for emphasis before piling tags; keep tags sparse and natural (usually 0–3 per short ad).",
    "DO NOT: alter, add, or remove any spoken words; do not invent new dialogue lines; do not wrap original narrative in brackets.",
    "DO NOT: use visual/stage tags ([standing], [grinning], [pacing], [smiling]) or music/SFX tags ([music], [applause], [gunshot], [explosion]).",
    ELEVEN_V3_AUDIO_TAG_CATALOG,
    "Return ONLY the enhanced script text — no labels or explanation.",
  ].join(" "),
  sfx: [
    "Target: sound-effect generation prompt.",
    "Emphasize source, texture, space, and timing. Do not turn it into music.",
  ].join(" "),
  music: [
    "Target: music generation prompt.",
    "Emphasize genre, mood, tempo feel, instrumentation. Do not invent lyrics unless the user asked.",
  ].join(" "),
};

export async function enhanceComposerPrompt(input: {
  kind: ComposerEnhanceKind;
  text: string;
}): Promise<TextModelResult> {
  const draft = input.text.trim();
  if (!draft) throw new Error("Type a prompt first");
  if (draft.length > 8000) throw new Error("Prompt is too long to enhance");

  const system = `${SHARED_RULES}\n${KIND_RULES[input.kind]}`;
  const result = await generateText({
    model: arkLanguageModel(resolveArkModelId(enhanceModelId())),
    system,
    prompt: draft,
  });
  const text = result.text.trim();
  if (!text) throw new Error("Could not enhance that prompt");
  return {
    text,
    usage: measuredTextUsageFromGateway(
      result.totalUsage ?? result.usage ?? {},
    ),
  };
}
