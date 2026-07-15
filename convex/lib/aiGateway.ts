import {
  experimental_generateVideo,
  generateImage as generateImageSdk,
  generateText,
} from "ai";
import { gateway } from "@ai-sdk/gateway";
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
  isKlingGatewayModel,
  isOmniFlashGatewayModel,
  isSeedanceGatewayModel,
} from "./videoModels";
import { normalizeImageQuality } from "./generationPricing";

export type GenerationMode = "image" | "video";

export type EnhancementInput = CreativeDirectionContext & {
  modelId?: string;
};

export type ImageGenerationInput = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  /** GPT Image 2 quality: low | medium | high */
  quality?: string;
  referenceUrls: string[];
};

export type VideoGenerationInput = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  generateAudio: boolean;
  /** Gateway model id, e.g. bytedance/seedance-2.0 or klingai/kling-v3.0-i2v */
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
  return requiredEnv("GATEWAY_TEXT_MODEL_ID");
}

export async function enhancePrompt(input: EnhancementInput): Promise<string> {
  const model = input.modelId ?? textModelId();
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
    hasVideoReference: input.hasVideoReference,
    hasImageReference: input.hasImageReference,
    hasRawImageReference: input.hasRawImageReference,
    hasElementReference: input.hasElementReference,
    attachedScriptMarkdown: input.attachedScriptMarkdown,
    referenceSummaries: input.referenceSummaries,
  };
  const result = await generateText({
    model: gateway.languageModel(model),
    system: buildCreativeSystemPrompt(context),
    prompt: buildCreativeUserPrompt(context),
  });
  const enhanced = result.text.trim();
  return enhanced || context.userPrompt;
}

export type ElementSheetInput = {
  elementType: ElementSheetType;
  name: string;
  existingNotes?: string;
  referenceInputs: ReferenceInput[];
};

export async function generateElementSheet(input: ElementSheetInput): Promise<string> {
  const result = await generateText({
    model: gateway.languageModel(textModelId()),
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
  const sheet = result.text.trim();
  if (sheet) return sheet;
  const fallbackTitle = input.name.trim() || "Element";
  return `# ${fallbackTitle}\n\n${input.existingNotes?.trim() ?? "No sheet generated."}`;
}

export async function generateScript(input: ScriptGenerationInput): Promise<string> {
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
    model: gateway.languageModel(textModelId()),
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
  return result.text.trim() || `# Script\n\n${input.userPrompt}`;
}

export async function generateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const model = requiredEnv("GATEWAY_IMAGE_MODEL_ID");
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  // GPT Image 2 (and similar) encode canvas shape in `size` (WxH). Mapping
  // resolution tiers to square dimensions was ignoring the selected ratio.
  const size = normalizeImageSize(input.resolution, aspectRatio);
  const quality = normalizeImageQuality(input.quality);
  const result = await generateImageSdk({
    model: gateway.imageModel(model),
    prompt: input.referenceUrls.length
      ? {
          text: input.prompt,
          images: input.referenceUrls,
        }
      : input.prompt,
    aspectRatio,
    size,
    providerOptions: {
      openai: { quality },
    },
  });
  return {
    images: result.images.map((image) => ({
      data: image.uint8Array,
      mediaType: image.mediaType || "image/png",
    })),
  };
}

export async function generateVideo(
  input: VideoGenerationInput,
): Promise<GeneratedMedia> {
  const model = input.modelId?.trim() || requiredEnv("GATEWAY_VIDEO_MODEL_ID");
  if (isOmniFlashGatewayModel(model)) {
    return generateOmniFlashVideo(input, model);
  }

  const seedance = isSeedanceGatewayModel(model);
  const kling = isKlingGatewayModel(model);
  const startFrameUrl = input.startFrameUrl?.trim();
  const referenceImageUrls = seedance ? input.referenceImageUrls : [];
  const referenceVideoUrls = seedance ? input.referenceVideoUrls : [];
  const referenceAudioUrls = seedance ? input.referenceAudioUrls : [];
  const hasStartFrame = Boolean(startFrameUrl);
  const hasReferenceImages = referenceImageUrls.length > 0;
  const hasReferenceVideos = referenceVideoUrls.length > 0;
  const hasReferenceAudio = referenceAudioUrls.length > 0;
  const useProviderReferenceImages = seedance && hasStartFrame && hasReferenceImages;

  // frameImages and inputReferences cannot be combined (AI SDK). With a start frame,
  // prop/location refs go through providerOptions.bytedance.referenceImages (Seedance only).
  const legacyInputReferences =
    seedance &&
    !hasStartFrame &&
    (hasReferenceImages || hasReferenceVideos || hasReferenceAudio)
      ? [...referenceImageUrls, ...referenceVideoUrls, ...referenceAudioUrls]
      : undefined;
  const multimodalProviderRefs =
    seedance && hasStartFrame && (hasReferenceVideos || hasReferenceAudio);

  const result = await experimental_generateVideo({
    model: gateway.videoModel(model),
    prompt: input.prompt,
    aspectRatio: normalizeAspectRatio(input.aspectRatio),
    resolution: normalizeSize(input.resolution),
    duration: input.durationSeconds,
    generateAudio: input.generateAudio,
    frameImages: hasStartFrame
      ? [{ image: startFrameUrl!, frameType: "first_frame" as const }]
      : undefined,
    inputReferences: legacyInputReferences,
    providerOptions: seedance
      ? {
          bytedance: {
            pollTimeoutMs: VIDEO_POLL_TIMEOUT_MS,
            ...(useProviderReferenceImages
              ? { referenceImages: referenceImageUrls }
              : !hasStartFrame && hasReferenceImages
                ? { referenceImages: referenceImageUrls }
                : {}),
            ...(multimodalProviderRefs && hasReferenceVideos
              ? { referenceVideos: referenceVideoUrls }
              : {}),
            ...(multimodalProviderRefs && hasReferenceAudio
              ? { referenceAudio: referenceAudioUrls }
              : {}),
          },
        }
      : kling
        ? {
            klingai: {
              mode: "pro",
            },
          }
        : undefined,
  });
  return {
    data: result.video.uint8Array,
    mediaType: result.video.mediaType || "video/mp4",
  };
}

/**
 * Gemini Omni Flash Preview — video via Interactions API (language model + video modality),
 * not experimental_generateVideo.
 */
async function generateOmniFlashVideo(
  input: VideoGenerationInput,
  modelId: string,
): Promise<GeneratedMedia> {
  const duration = Math.max(
    4,
    Math.min(10, Math.ceil(Number(input.durationSeconds) || 4)),
  );
  const aspect = normalizeAspectRatio(input.aspectRatio);
  const promptLines = [
    input.prompt.trim(),
    `Generate a ${duration}-second video${aspect ? ` in ${aspect} aspect ratio` : ""}${
      input.generateAudio ? " with synchronized audio" : ""
    }.`,
  ];

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image"; image: URL }
    | { type: "file"; data: URL; mediaType: string };

  const content: ContentPart[] = [{ type: "text", text: promptLines.join("\n\n") }];

  const startFrameUrl = input.startFrameUrl?.trim();
  if (startFrameUrl) {
    content.push({ type: "image", image: new URL(startFrameUrl) });
  }
  for (const url of input.referenceImageUrls ?? []) {
    if (!url?.trim()) continue;
    content.push({ type: "image", image: new URL(url.trim()) });
  }
  for (const url of input.referenceVideoUrls ?? []) {
    if (!url?.trim()) continue;
    content.push({
      type: "file",
      data: new URL(url.trim()),
      mediaType: "video/mp4",
    });
  }
  for (const url of input.referenceAudioUrls ?? []) {
    if (!url?.trim()) continue;
    content.push({
      type: "file",
      data: new URL(url.trim()),
      mediaType: normalizeAudioMimeType(undefined) || "audio/mpeg",
    });
  }

  const result = await generateText({
    model: gateway.languageModel(modelId),
    messages: [{ role: "user", content }],
    providerOptions: {
      google: {
        responseModalities: ["video"],
        store: false,
      },
    },
  });

  const video = result.files?.find((file) =>
    String(file.mediaType || "").startsWith("video/"),
  );
  if (!video) {
    throw new Error(
      "Omni Flash did not return a video. Try a simpler prompt or shorter duration (max 10s).",
    );
  }
  return {
    data: video.uint8Array,
    mediaType: video.mediaType || "video/mp4",
  };
}

export function imageModelForRequest(): string {
  return requiredEnv("GATEWAY_IMAGE_MODEL_ID");
}

export function videoModelForRequest(): string {
  return requiredEnv("GATEWAY_VIDEO_MODEL_ID");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function normalizeAspectRatio(
  aspectRatio: string | undefined,
): `${number}:${number}` | undefined {
  if (!aspectRatio) return undefined;
  const match = aspectRatio.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return undefined;
  return `${match[1]}:${match[2]}` as `${number}:${number}`;
}

/** GPT Image 2 size constraints (OpenAI image generation guide). */
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_PIXELS = 8_294_400;
const IMAGE_MIN_PIXELS = 655_360;
const IMAGE_EDGE_STEP = 16;

/** Long-edge targets per studio resolution tier. */
const IMAGE_TIER_LONG_EDGE: Record<string, number> = {
  "1k": 1536,
  "2k": 2048,
  "3k": 3072,
  "4k": 3840,
};

function roundToImageEdge(value: number): number {
  return Math.max(
    IMAGE_EDGE_STEP,
    Math.round(value / IMAGE_EDGE_STEP) * IMAGE_EDGE_STEP,
  );
}

function clampImageDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  let w = Math.min(roundToImageEdge(width), IMAGE_MAX_EDGE);
  let h = Math.min(roundToImageEdge(height), IMAGE_MAX_EDGE);

  let pixels = w * h;
  if (pixels > IMAGE_MAX_PIXELS) {
    const scale = Math.sqrt(IMAGE_MAX_PIXELS / pixels);
    w = roundToImageEdge(w * scale);
    h = roundToImageEdge(h * scale);
    while (w * h > IMAGE_MAX_PIXELS) {
      if (w >= h) w = Math.max(IMAGE_EDGE_STEP, w - IMAGE_EDGE_STEP);
      else h = Math.max(IMAGE_EDGE_STEP, h - IMAGE_EDGE_STEP);
    }
  } else if (pixels < IMAGE_MIN_PIXELS) {
    const scale = Math.sqrt(IMAGE_MIN_PIXELS / pixels);
    w = Math.min(IMAGE_MAX_EDGE, roundToImageEdge(w * scale));
    h = Math.min(IMAGE_MAX_EDGE, roundToImageEdge(h * scale));
    while (w * h < IMAGE_MIN_PIXELS) {
      if (w <= h && w < IMAGE_MAX_EDGE) w += IMAGE_EDGE_STEP;
      else if (h < IMAGE_MAX_EDGE) h += IMAGE_EDGE_STEP;
      else break;
    }
  }

  return { width: w, height: h };
}

/**
 * Derive GPT Image canvas size from resolution tier + aspect ratio.
 * OpenAI image models use WxH `size` for output shape — square tier
 * mappings (e.g. 2K → 2048x2048) override any separate aspectRatio.
 */
export function normalizeImageSize(
  resolution: string | undefined,
  aspectRatio: `${number}:${number}` | string | undefined,
): `${number}x${number}` | undefined {
  if (resolution && /^\d+x\d+$/i.test(resolution)) {
    return resolution.toLowerCase() as `${number}x${number}`;
  }

  const ratio =
    normalizeAspectRatio(
      typeof aspectRatio === "string" ? aspectRatio : undefined,
    ) ?? ("1:1" as `${number}:${number}`);
  const [ratioW, ratioH] = ratio.split(":").map(Number);
  if (!ratioW || !ratioH) {
    return normalizeSize(resolution);
  }

  const tierKey = (resolution ?? "2k").toLowerCase();
  const longEdge =
    IMAGE_TIER_LONG_EDGE[tierKey] ?? IMAGE_TIER_LONG_EDGE["2k"];

  let width: number;
  let height: number;
  if (ratioW === ratioH) {
    // Match OpenAI popular squares; 4K square is clamped by max pixels (2880²).
    const squareEdge =
      tierKey === "1k" ? 1024 : tierKey === "4k" ? 2880 : longEdge;
    width = squareEdge;
    height = squareEdge;
  } else if (ratioW > ratioH) {
    width = longEdge;
    height = (longEdge * ratioH) / ratioW;
  } else {
    height = longEdge;
    width = (longEdge * ratioW) / ratioH;
  }

  const clamped = clampImageDimensions(width, height);
  return `${clamped.width}x${clamped.height}`;
}

function normalizeSize(
  resolution: string | undefined,
): `${number}x${number}` | undefined {
  if (!resolution) return undefined;
  if (/^\d+x\d+$/i.test(resolution)) {
    return resolution.toLowerCase() as `${number}x${number}`;
  }
  // Video / legacy labels. Image gens must use normalizeImageSize so
  // aspect ratio is applied (1K/2K/4K alone must not force a square).
  const map: Record<string, `${number}x${number}`> = {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "3k": "3072x3072",
    "4k": "3840x2160",
    "480p": "854x480",
    "720p": "1280x720",
    "1080p": "1920x1080",
    "1920x1080": "1920x1080",
    "1280x720": "1280x720",
    "854x480": "854x480",
    "864x480": "854x480",
  };
  return map[resolution.toLowerCase()] ?? map[resolution];
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
  if (error instanceof Error) {
    return error.message.slice(0, 400);
  }
  return "AI Gateway request failed";
}

export { formatGatewayError };
