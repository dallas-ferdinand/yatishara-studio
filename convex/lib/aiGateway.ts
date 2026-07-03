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

export type GenerationMode = "image" | "video";

export type EnhancementInput = CreativeDirectionContext & {
  modelId?: string;
};

export type ImageGenerationInput = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceUrls: string[];
};

export type VideoGenerationInput = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  generateAudio: boolean;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
};

export type ScriptGenerationInput = {
  userPrompt: string;
  presetName?: string;
  presetInstructions: string;
  scriptInstructions?: string;
  storytellingEnabled?: boolean;
  negativePrompt?: string;
  attachedScriptMarkdown?: string[];
  referenceInputs: ReferenceInput[];
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
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    hasVideoReference: input.hasVideoReference,
    hasImageReference: input.hasImageReference,
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
  const context: CreativeDirectionContext = {
    userPrompt: input.userPrompt,
    presetName: input.presetName,
    presetInstructions: input.presetInstructions,
    scriptInstructions: input.scriptInstructions,
    storytellingEnabled: input.storytellingEnabled,
    negativePrompt: input.negativePrompt,
    outputKind: "script",
    attachedScriptMarkdown: input.attachedScriptMarkdown,
    hasAudioReference,
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
  const result = await generateImageSdk({
    model: gateway.imageModel(model),
    prompt: input.referenceUrls.length
      ? {
          text: input.prompt,
          images: input.referenceUrls,
        }
      : input.prompt,
    aspectRatio: normalizeAspectRatio(input.aspectRatio),
    size: normalizeSize(input.resolution),
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
  const model = requiredEnv("GATEWAY_VIDEO_MODEL_ID");
  const referenceUrls = [
    ...input.referenceImageUrls,
    ...input.referenceVideoUrls,
    ...input.referenceAudioUrls,
  ];
  const result = await experimental_generateVideo({
    model: gateway.videoModel(model),
    prompt: input.prompt,
    aspectRatio: normalizeAspectRatio(input.aspectRatio),
    resolution: normalizeSize(input.resolution),
    duration: input.durationSeconds,
    generateAudio: input.generateAudio,
    inputReferences: referenceUrls.length ? referenceUrls : undefined,
    providerOptions: {
      bytedance: {
        pollTimeoutMs: VIDEO_POLL_TIMEOUT_MS,
      },
    },
  });
  return {
    data: result.video.uint8Array,
    mediaType: result.video.mediaType || "video/mp4",
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

function normalizeSize(
  resolution: string | undefined,
): `${number}x${number}` | undefined {
  if (!resolution) return undefined;
  if (/^\d+x\d+$/i.test(resolution)) {
    return resolution.toLowerCase() as `${number}x${number}`;
  }
  const map: Record<string, `${number}x${number}`> = {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "3k": "3072x3072",
    "4k": "4096x4096",
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
