import { generateText } from "ai";
import {
  buildCreativeSystemPrompt,
  buildCreativeUserPrompt,
  type CreativeDirectionContext,
} from "./creativeDirection";
import {
  buildElementSheetSystemPrompt,
  buildElementSheetUserPrompt,
  type ElementSheetType,
} from "./elementSheets";
import { normalizeAudioMimeType, type ReferenceInput } from "./referenceInput";
import {
  isSeedance25GatewayModel,
  isSeedanceGatewayModel,
} from "./videoModels";
import {
  normalizeSeedanceAspectRatio,
  normalizeSeedanceResolution,
} from "./seedanceResolution";
import {
  measuredTextUsageFromGateway,
  type MeasuredTextUsage,
} from "./generationPricing";
import {
  ARK_MODEL_IDS,
  arkLanguageModel,
  formatArkError,
  generateArkImage,
  generateArkVideo,
  resolveArkModelId,
  seedreamSizeForRequest,
} from "./byteplusArk";

export type GenerationMode = "image" | "video";

export type TextModelResult = {
  text: string;
  usage: MeasuredTextUsage;
};

function usageFromGenerateTextResult(result: {
  usage?: { inputTokens?: number; outputTokens?: number };
  totalUsage?: { inputTokens?: number; outputTokens?: number };
}): MeasuredTextUsage {
  return measuredTextUsageFromGateway(result.totalUsage ?? result.usage ?? {});
}

export type EnhancementInput = CreativeDirectionContext & {
  modelId?: string;
  /** Attached image / video / audio — model must see the full media, not just flags. */
  referenceInputs?: ReferenceInput[];
  /** Opening still for I2V — included as an image part when present. */
  startFrameUrl?: string;
};

export type ImageGenerationInput = {
  prompt: string;
  /** Frozen reviewed Ark model id. Defaults to the current environment for direct calls. */
  modelId?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Legacy GPT Image quality — ignored for Seedream (kept for call-site compat). */
  quality?: string;
  referenceUrls: string[];
};

export type VideoGenerationInput = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  generateAudio: boolean;
  /** Ark / legacy gateway model id */
  modelId?: string;
  /** Storyboard / opening shot — first_frame I2V. Required for on-camera characters. */
  startFrameUrl?: string;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
};

export type ScriptGenerationInput = {
  userPrompt: string;
  presetName?: string;
  presetInstructions: string;
  scriptInstructions?: string;
  /** @deprecated use scriptType */
  scriptTypeInstructions?: string;
  scriptType?: string;
  presetSlug?: string;
  styleSheetElementId?: string | null;
  referenceIntent?: string;
  storytellingEnabled?: boolean;
  negativePrompt?: string;
  attachedScriptMarkdown?: string[];
  referenceInputs: ReferenceInput[];
  hasRawImageReference?: boolean;
  hasElementReference?: boolean;
};

export type GeneratedMedia = {
  data: Uint8Array;
  mediaType: string;
};

export type ImageGenerationResult = {
  images: GeneratedMedia[];
  usageCredits?: number;
};

const VIDEO_POLL_TIMEOUT_MS = 540_000;

function textModelId(): string {
  return (
    process.env.GATEWAY_TEXT_MODEL_ID?.trim() || ARK_MODEL_IDS.text
  );
}

/** Cheap mini model for DM Improve. */
function dmImproveModelId(): string {
  return (
    process.env.GATEWAY_DM_IMPROVE_MODEL_ID?.trim() || ARK_MODEL_IDS.textMini
  );
}

export async function enhancePrompt(
  input: EnhancementInput,
): Promise<TextModelResult> {
  const model = resolveArkModelId(input.modelId ?? textModelId());
  const referenceInputs = input.referenceInputs ?? [];
  const hasStartFrame = Boolean(input.startFrameUrl?.trim());
  const hasAudioReference =
    input.hasAudioReference ||
    referenceInputs.some((reference) => reference.kind === "audio");
  const hasVideoReference =
    input.hasVideoReference ||
    referenceInputs.some((reference) => reference.kind === "video");
  const hasImageReference =
    input.hasImageReference ||
    hasStartFrame ||
    referenceInputs.some((reference) => reference.kind === "image");
  const context: CreativeDirectionContext = {
    userPrompt: input.userPrompt,
    presetName: input.presetName,
    presetInstructions: input.presetInstructions,
    scriptInstructions: input.scriptInstructions,
    storytellingEnabled: input.storytellingEnabled,
    negativePrompt: input.negativePrompt,
    outputKind: input.outputKind,
    scriptType: input.scriptType,
    referenceIntent: input.referenceIntent,
    presetSlug: input.presetSlug,
    styleSheetElementId: input.styleSheetElementId,
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    hasVideoReference,
    hasImageReference,
    hasRawImageReference: input.hasRawImageReference,
    hasElementReference: input.hasElementReference,
    hasAudioReference,
    attachedScriptMarkdown: input.attachedScriptMarkdown,
    referenceSummaries: input.referenceSummaries,
  };
  const mediaParts = [
    ...(hasStartFrame
      ? contentPartForReference({
          kind: "image",
          url: input.startFrameUrl!.trim(),
        })
      : []),
    ...referenceInputs.flatMap((reference) => contentPartForReference(reference)),
  ];
  const userText = buildCreativeUserPrompt(context);
  const result = await generateText({
    model: arkLanguageModel(model),
    system: buildCreativeSystemPrompt(context),
    ...(mediaParts.length
      ? {
          messages: [
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: userText }, ...mediaParts],
            },
          ],
        }
      : { prompt: userText }),
  });
  const enhanced = result.text.trim();
  return {
    text: enhanced || context.userPrompt,
    usage: usageFromGenerateTextResult(result),
  };
}

export type DmImproveReplyContext = {
  kind: string;
  body: string;
  fromMe: boolean;
  imageUrl?: string;
};

export type DmImproveInput = {
  text?: string;
  replyContext?: DmImproveReplyContext;
  imageUrls?: string[];
  /** Local/blob staged photos the model cannot fetch. */
  attachedPhotoCount?: number;
};

const MAX_DM_IMPROVE_IMAGES = 4;

function httpImageUrls(urls: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of urls ?? []) {
    const url = raw.trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (out.includes(url)) continue;
    out.push(url);
    if (out.length >= MAX_DM_IMPROVE_IMAGES) break;
  }
  return out;
}

function buildDmImproveUserPrompt(input: DmImproveInput): string {
  const draft = (input.text ?? "").trim();
  const lines: string[] = [];
  const reply = input.replyContext;
  if (reply) {
    const who = reply.fromMe ? "me (my earlier message)" : "them (peer message)";
    const body = reply.body.trim();
    lines.push(`Replying to ${who} [${reply.kind}]:`);
    if (body) {
      lines.push(body);
    } else if (reply.kind === "image") {
      lines.push("(image message — see attached image)");
    } else if (reply.kind === "voice") {
      lines.push("(voice note)");
    } else {
      lines.push(`(${reply.kind} message)`);
    }
  }
  const photoCount = Math.max(0, Math.floor(input.attachedPhotoCount ?? 0));
  if (photoCount > 0) {
    lines.push(
      `Composer has ${photoCount} photo${photoCount === 1 ? "" : "s"} staged to send with this reply.`,
    );
  }
  if (draft) {
    lines.push(`User note / tone / draft:\n${draft}`);
  }
  return lines.join("\n\n").trim();
}

function buildDmPolishUserPrompt(input: DmImproveInput): string {
  const draft = (input.text ?? "").trim();
  const lines: string[] = [];
  const reply = input.replyContext;
  if (reply) {
    const who = reply.fromMe ? "me (my earlier message)" : "them (peer message)";
    const body = reply.body.trim();
    lines.push(`Thread context — draft is a reply to ${who} [${reply.kind}]:`);
    if (body) {
      lines.push(body);
    } else if (reply.kind === "image") {
      lines.push("(image message — see attached image)");
    } else if (reply.kind === "voice") {
      lines.push("(voice note)");
    } else {
      lines.push(`(${reply.kind} message)`);
    }
  }
  const photoCount = Math.max(0, Math.floor(input.attachedPhotoCount ?? 0));
  if (photoCount > 0) {
    lines.push(
      `Composer has ${photoCount} photo${photoCount === 1 ? "" : "s"} staged with this message.`,
    );
  }
  lines.push(`Draft to improve:\n${draft}`);
  return lines.join("\n\n").trim();
}

/** Short vibe / rewrite instruction — not a real chat draft. */
function looksLikeToneOrInstruction(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > 96) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (
    /^(make|rewrite|fix|shorten|expand|write|turn|keep|be|more|less)\b/i.test(t) &&
    words.length <= 12
  ) {
    return true;
  }
  if (
    /^(cool|cold|angry|angrier|short|funny|formal|casual|sweet|mean|soft|warm|polite|rude|flirty|professional|nicer|friendlier|warmer|colder)(!|\.)?$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^(make (it |this )?).{0,48}$/i.test(t) &&
    words.length <= 8
  ) {
    return true;
  }
  return false;
}

const DM_DRAFT_SYSTEM = [
  "You draft short chat replies for a direct-message composer.",
  "Use the attached reply context and/or images to write one natural reply the user can send.",
  "If the user note includes a tone or instruction (cool, cold, angry, short, funny, formal, etc.), apply it.",
  "If there is no tone note, write a natural, concise reply that fits the context.",
  "Keep language variety (including Trinidad / Caribbean English when present in the context or note).",
  "Do not invent facts, names, prices, links, @handles, or phone numbers.",
  "Do not add greetings unless they fit, quotes, labels, markdown fences, or explanations.",
  "Return plain text only — the reply body alone.",
].join(" ");

const DM_POLISH_SYSTEM = [
  "You improve short chat-message drafts so they read as what the writer meant to say.",
  "Read the draft (and any thread/image context) for intent, tone, relationship, and topic — do not only run a spellchecker.",
  "Fix spelling, punctuation, grammar, homophones, wrong-word mixups, and awkward phrasing when they obscure meaning.",
  "Prefer the wording that fits the conversation context (e.g. reply-to message, photos) when the draft is ambiguous.",
  "If the input clearly includes an instruction (make this friendlier, shorten this, rewrite as…), apply that instruction and return ONLY the resulting message.",
  "Keep the same meaning, intent, energy, and language variety (including Trinidad / Caribbean English, slang, and informal chat voice when present).",
  "Do not sanitize personality into corporate English. Do not add new ideas, jokes, questions, or details the draft did not imply.",
  "Do not change facts, names, prices, links, @handles, phone numbers, or emoji meaning.",
  "Do not add greetings, quotes, labels, markdown fences, or explanations.",
  "Return plain text only — the improved message body alone.",
].join(" ");

/**
 * Short DM polish, or draft a reply from reply-to / attached image context.
 * Typed draft + optional thread context → intelligent polish.
 * Empty / tone-only + context → draft a new reply.
 */
export async function improveMessageDraft(
  input: DmImproveInput | string,
): Promise<TextModelResult> {
  const normalized: DmImproveInput =
    typeof input === "string" ? { text: input } : input;
  const draft = (normalized.text ?? "").trim();
  const reply = normalized.replyContext;
  const imageUrls = httpImageUrls([
    ...(reply?.imageUrl ? [reply.imageUrl] : []),
    ...(normalized.imageUrls ?? []),
  ]);
  const attachedPhotoCount = Math.max(
    0,
    Math.floor(normalized.attachedPhotoCount ?? 0),
  );
  const hasContext = Boolean(
    reply || imageUrls.length > 0 || attachedPhotoCount > 0,
  );
  if (!draft && !hasContext) {
    throw new Error("Type a message first");
  }

  const draftMode =
    hasContext && (!draft || looksLikeToneOrInstruction(draft));
  const system = draftMode ? DM_DRAFT_SYSTEM : DM_POLISH_SYSTEM;

  const mediaParts = imageUrls.flatMap((url) =>
    contentPartForReference({ kind: "image", url }),
  );
  const userText = draftMode
    ? buildDmImproveUserPrompt({
        text: draft,
        replyContext: reply,
        imageUrls,
        attachedPhotoCount,
      })
    : hasContext
      ? buildDmPolishUserPrompt({
          text: draft,
          replyContext: reply,
          imageUrls,
          attachedPhotoCount,
        })
      : draft;

  const result = await generateText({
    model: arkLanguageModel(dmImproveModelId()),
    system,
    ...(mediaParts.length
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: userText },
                ...mediaParts,
              ],
            },
          ],
        }
      : { prompt: userText }),
  });
  const improved = result.text.trim();
  if (!improved) {
    throw new Error(
      draftMode ? "Could not draft a reply" : "Could not improve that text",
    );
  }
  return {
    text: improved,
    usage: usageFromGenerateTextResult(result),
  };
}

export type ElementSheetInput = {
  elementType: ElementSheetType;
  name: string;
  existingNotes?: string;
  referenceInputs: ReferenceInput[];
};

export async function generateElementSheet(
  input: ElementSheetInput,
): Promise<TextModelResult> {
  const result = await generateText({
    model: arkLanguageModel(textModelId()),
    system: buildElementSheetSystemPrompt(input.elementType),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildElementSheetUserPrompt({
              type: input.elementType,
              name: input.name,
              existingNotes: input.existingNotes,
            }),
          },
          ...input.referenceInputs.flatMap((reference) => contentPartForReference(reference)),
        ],
      },
    ],
  });
  const usage = usageFromGenerateTextResult(result);
  const sheet = result.text.trim();
  if (sheet) return { text: sheet, usage };
  const fallbackTitle = input.name.trim() || "Element";
  return {
    text: `# ${fallbackTitle}\n\n${input.existingNotes?.trim() ?? "No sheet generated."}`,
    usage,
  };
}

export async function generateScript(
  input: ScriptGenerationInput,
): Promise<TextModelResult> {
  const hasAudioReference = input.referenceInputs.some((reference) => reference.kind === "audio");
  const hasImageReference =
    input.referenceInputs.some((reference) => reference.kind === "image") ||
    Boolean(input.hasRawImageReference || input.hasElementReference);
  const context: CreativeDirectionContext = {
    userPrompt: input.userPrompt,
    presetName: input.presetName,
    presetInstructions: input.presetInstructions,
    scriptInstructions: input.scriptInstructions,
    scriptType: input.scriptType,
    referenceIntent: input.referenceIntent,
    presetSlug: input.presetSlug,
    styleSheetElementId: input.styleSheetElementId,
    storytellingEnabled: input.storytellingEnabled,
    negativePrompt: input.negativePrompt,
    outputKind: "script",
    attachedScriptMarkdown: input.attachedScriptMarkdown,
    hasAudioReference,
    hasImageReference,
    hasRawImageReference: input.hasRawImageReference,
    hasElementReference: input.hasElementReference,
  };
  const result = await generateText({
    model: arkLanguageModel(textModelId()),
    system: buildCreativeSystemPrompt(context),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildCreativeUserPrompt(context),
          },
          ...input.referenceInputs.flatMap((reference) => contentPartForReference(reference)),
        ],
      },
    ],
  });
  return {
    text: result.text.trim() || `# Script\n\n${input.userPrompt}`,
    usage: usageFromGenerateTextResult(result),
  };
}

export async function generateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const model = resolveArkModelId(
    input.modelId?.trim() ||
      process.env.GATEWAY_IMAGE_MODEL_ID ||
      ARK_MODEL_IDS.image,
  );
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  const size = seedreamSizeForRequest(input.resolution, aspectRatio);
  // quality ignored — Seedream bills by megapixel tier, not GPT quality.
  void input.quality;

  const images = await generateArkImage({
    modelId: model,
    prompt: input.prompt,
    size,
    referenceUrls: input.referenceUrls,
  });
  return {
    images: images.map((image) => ({
      data: image.data,
      mediaType: image.mediaType || "image/png",
    })),
  };
}

export async function generateVideo(
  input: VideoGenerationInput,
): Promise<GeneratedMedia> {
  const model = resolveArkModelId(
    input.modelId?.trim() ||
      process.env.GATEWAY_VIDEO_MODEL_ID ||
      ARK_MODEL_IDS.video25,
  );
  if (!isSeedanceGatewayModel(model)) {
    throw new Error(
      `Unsupported video model: ${model}. Use Seedance 2.5 or Seedance 2.0.`,
    );
  }

  const startFrameUrl = input.startFrameUrl?.trim();
  const referenceImageUrls = input.referenceImageUrls ?? [];
  const referenceVideoUrls = input.referenceVideoUrls ?? [];
  const referenceAudioUrls = input.referenceAudioUrls ?? [];

  const resolution = normalizeSeedanceResolution(input.resolution, model);
  const aspectRatio = normalizeSeedanceAspectRatio(input.aspectRatio);
  const seedanceMaxDuration = isSeedance25GatewayModel(model) ? 30 : 15;
  const durationSeconds = Math.max(
    4,
    Math.min(seedanceMaxDuration, Math.round(Number(input.durationSeconds) || 4)),
  );

  console.info("[seedance] generateVideo request", {
    model,
    inputResolution: input.resolution ?? null,
    resolution,
    aspectRatio: aspectRatio ?? null,
    durationSeconds,
    hasStartFrame: Boolean(startFrameUrl),
    referenceImageCount: referenceImageUrls.length,
    referenceVideoCount: referenceVideoUrls.length,
    referenceAudioCount: referenceAudioUrls.length,
  });

  const result = await generateArkVideo({
    modelId: model,
    prompt: input.prompt,
    resolution,
    ratio: aspectRatio,
    duration: durationSeconds,
    generateAudio: input.generateAudio,
    startFrameUrl,
    referenceImageUrls,
    referenceVideoUrls,
    referenceAudioUrls,
    pollTimeoutMs: VIDEO_POLL_TIMEOUT_MS,
  });

  return {
    data: result.data,
    mediaType: result.mediaType || "video/mp4",
  };
}

export function imageModelForRequest(): string {
  return resolveArkModelId(
    process.env.GATEWAY_IMAGE_MODEL_ID || ARK_MODEL_IDS.image,
  );
}

export function videoModelForRequest(): string {
  return resolveArkModelId(
    process.env.GATEWAY_VIDEO_MODEL_ID || ARK_MODEL_IDS.video25,
  );
}

function normalizeAspectRatio(
  aspectRatio: string | undefined,
): `${number}:${number}` | undefined {
  if (!aspectRatio) return undefined;
  const match = aspectRatio.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return undefined;
  return `${match[1]}:${match[2]}` as `${number}:${number}`;
}

/**
 * Derive Seedream canvas size from resolution tier + aspect ratio.
 * 4K Studio tier clamps to 2K (Seedream max).
 */
export function normalizeImageSize(
  resolution: string | undefined,
  aspectRatio: `${number}:${number}` | string | undefined,
): string {
  return seedreamSizeForRequest(
    resolution,
    typeof aspectRatio === "string" ? aspectRatio : undefined,
  );
}

function contentPartForReference(reference: ReferenceInput): Array<
  | { type: "text"; text: string }
  | { type: "image"; image: URL }
  | { type: "file"; data: URL; mediaType: string }
> {
  if (reference.kind === "image") {
    return [{ type: "image", image: new URL(reference.url) }];
  }
  if (reference.kind === "video") {
    return [
      {
        type: "file",
        data: new URL(reference.url),
        mediaType: reference.mimeType?.split(";")[0]?.trim() || "video/mp4",
      },
    ];
  }
  return [
    {
      type: "file",
      data: new URL(reference.url),
      mediaType: normalizeAudioMimeType(reference.mimeType),
    },
  ];
}

function formatGatewayError(error: unknown): string {
  return formatArkError(error);
}

export { formatGatewayError };
