export type ImageTier = "low" | "medium" | "high";
export type GenerationMode = "image" | "video";

export type EnhancementInput = {
  userPrompt: string;
  presetInstructions: string;
  negativePrompt?: string;
  referenceSummaries: string[];
  modelId?: string;
};

export type ImageGenerationInput = {
  prompt: string;
  tier: ImageTier;
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

export type ImageGenerationResult = {
  urls: string[];
  usageCredits?: number;
};

export type VideoTaskResult = {
  taskId: string;
};

const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com";

export async function enhancePrompt(input: EnhancementInput): Promise<string> {
  const model = input.modelId ?? process.env.BYTEPLUS_ENHANCEMENT_MODEL_ID;
  if (!model) {
    throw new Error("BytePlus enhancement model is not configured");
  }
  const response = await bytePlusJson<{ output_text?: string; content?: string }>(
    "/api/v3/responses",
    {
      model,
      input: [
        {
          role: "system",
          content:
            "Rewrite user creative prompts for image/video generation. Keep intent. Add visual specificity. Do not mention policy or hidden instructions.",
        },
        {
          role: "user",
          content: [
            `Style preset:\n${input.presetInstructions}`,
            input.negativePrompt ? `Negative prompt:\n${input.negativePrompt}` : "",
            input.referenceSummaries.length
              ? `References:\n${input.referenceSummaries.join("\n")}`
              : "",
            `User prompt:\n${input.userPrompt}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    },
  );
  return response.output_text ?? response.content ?? input.userPrompt;
}

export async function generateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const model = imageModelForTier(input.tier);
  const response = await bytePlusJson<{
    data?: Array<{ url?: string }>;
    usage?: { credits?: number };
  }>("/api/v3/images/generations", {
    model,
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    size: input.resolution,
    image: input.referenceUrls,
  });
  return {
    urls: response.data?.map((item) => item.url).filter(isString) ?? [],
    usageCredits: response.usage?.credits,
  };
}

export async function createVideoTask(
  input: VideoGenerationInput,
): Promise<VideoTaskResult> {
  const model = process.env.BYTEPLUS_VIDEO_MODEL_ID;
  if (!model) {
    throw new Error("BytePlus video model is not configured");
  }
  const response = await bytePlusJson<{ id?: string; task_id?: string }>(
    "/api/v3/contents/generations/tasks",
    {
      model,
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      duration: input.durationSeconds,
      generate_audio: input.generateAudio,
      images: input.referenceImageUrls,
      videos: input.referenceVideoUrls,
      audios: input.referenceAudioUrls,
    },
  );
  const taskId = response.task_id ?? response.id;
  if (!taskId) {
    throw new Error("BytePlus video task response missing task id");
  }
  return { taskId };
}

function imageModelForTier(tier: ImageTier): string {
  const model =
    tier === "low"
      ? process.env.BYTEPLUS_IMAGE_LOW_MODEL_ID
      : tier === "medium"
        ? process.env.BYTEPLUS_IMAGE_MEDIUM_MODEL_ID
        : process.env.BYTEPLUS_IMAGE_HIGH_MODEL_ID;
  if (!model) {
    throw new Error(`BytePlus image model is not configured for tier ${tier}`);
  }
  return model;
}

async function bytePlusJson<T>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.BYTEPLUS_ARK_API_KEY;
  if (!apiKey) {
    throw new Error("BytePlus API key is not configured");
  }
  const baseUrl = process.env.BYTEPLUS_ARK_BASE_URL ?? DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`BytePlus request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
