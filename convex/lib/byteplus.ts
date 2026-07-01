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

export type ScriptGenerationInput = {
  userPrompt: string;
  referenceInputs: Array<{
    kind: "image" | "video" | "audio";
    url: string;
  }>;
};

export type ImageGenerationResult = {
  urls: string[];
  usageCredits?: number;
};

export type VideoTaskResult = {
  taskId: string;
};

export type VideoTaskStatusResult = {
  status: string;
  videoUrl?: string;
  error?: string;
};

type ResponseTextResult = {
  output_text?: string;
  content?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com";

export async function enhancePrompt(input: EnhancementInput): Promise<string> {
  const model = input.modelId ?? process.env.BYTEPLUS_ENHANCEMENT_MODEL_ID;
  if (!model) {
    throw new Error("BytePlus enhancement model is not configured");
  }
  const response = await bytePlusJson<ResponseTextResult>(
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
  return responseText(response) ?? input.userPrompt;
}

export async function generateScript(input: ScriptGenerationInput): Promise<string> {
  const model = process.env.BYTEPLUS_TEXT_MODEL_ID ?? process.env.BYTEPLUS_ENHANCEMENT_MODEL_ID;
  if (!model) {
    throw new Error("BytePlus text model is not configured");
  }
  const content = [
    {
      type: "input_text",
      text: `Create a video script for this request:\n\n${input.userPrompt}`,
    },
    ...input.referenceInputs.map((reference) => multimodalInputForReference(reference)),
  ];
  const response = await bytePlusJson<ResponseTextResult>(
    "/api/v3/responses",
    {
      model,
      input: [
        {
          role: "system",
          content:
            "You write concise production-ready video scripts in Markdown. Include a short title, concept, shot-by-shot scenes, voiceover/dialogue, visual notes, audio notes, and CTA when useful. Keep it practical and usable by a creator.",
        },
        {
          role: "user",
          content,
        },
      ],
    },
  );
  return responseText(response) ?? `# Script\n\n${input.userPrompt}`;
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
  const model = videoModelForEnvironment();
  if (!model) {
    throw new Error("BytePlus video model is not configured");
  }
  const isSeedance1 = isSeedance1Model(model);
  const response = await bytePlusJson<{ id?: string; task_id?: string }>(
    "/api/v3/contents/generations/tasks",
    {
      model,
      content: videoContentForInput(input, { textOnly: isSeedance1 }),
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      resolution: videoResolutionForModel(model, input.resolution),
      duration: input.durationSeconds,
      generate_audio: isSeedance1 ? false : input.generateAudio,
      images: isSeedance1 ? [] : input.referenceImageUrls,
      videos: isSeedance1 ? [] : input.referenceVideoUrls,
      audios: isSeedance1 ? [] : input.referenceAudioUrls,
    },
  );
  const taskId = response.task_id ?? response.id;
  if (!taskId) {
    throw new Error("BytePlus video task response missing task id");
  }
  return { taskId };
}

export async function retrieveVideoTask(taskId: string): Promise<VideoTaskStatusResult> {
  const response = await bytePlusGet<unknown>(
    `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
  );
  const status = stringField(response, "status") ?? "unknown";
  return {
    status,
    videoUrl: findVideoUrl(response),
    error: findErrorMessage(response),
  };
}

function videoContentForInput(
  input: VideoGenerationInput,
  options: { textOnly: boolean },
): Array<Record<string, unknown>> {
  if (options.textOnly) {
    return [{ type: "text", text: input.prompt }];
  }
  return [
    { type: "text", text: input.prompt },
    ...input.referenceImageUrls.map((url) => ({ type: "image_url", image_url: url })),
    ...input.referenceVideoUrls.map((url) => ({ type: "video_url", video_url: url })),
    ...input.referenceAudioUrls.map((url) => ({ type: "audio_url", audio_url: url })),
  ];
}

function videoResolutionForModel(model: string, resolution: string | undefined): string | undefined {
  if (!isSeedance1Model(model)) return resolution;
  if (resolution === "1080p" || resolution === "1920x1080") return "1080p";
  if (resolution === "720p" || resolution === "1280x720") return "720p";
  if (resolution === "480p" || resolution === "854x480" || resolution === "864x480") return "480p";
  return "720p";
}

function isSeedance1Model(model: string): boolean {
  return model.includes("seedance-1-");
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

function videoModelForEnvironment(): string | undefined {
  if (process.env.BYTEPLUS_DEV_MODE === "true") {
    return process.env.BYTEPLUS_VIDEO_DEV_MODEL_ID ?? process.env.BYTEPLUS_VIDEO_MODEL_ID;
  }
  return process.env.BYTEPLUS_VIDEO_MODEL_ID;
}

async function bytePlusJson<T>(path: string, body: unknown): Promise<T> {
  return await bytePlusRequest<T>(path, {
    method: "POST",
    body,
  });
}

async function bytePlusGet<T>(path: string): Promise<T> {
  return await bytePlusRequest<T>(path, {
    method: "GET",
  });
}

async function bytePlusRequest<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const apiKey = process.env.BYTEPLUS_ARK_API_KEY;
  if (!apiKey) {
    throw new Error("BytePlus API key is not configured");
  }
  const baseUrl = process.env.BYTEPLUS_ARK_BASE_URL ?? DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(formatBytePlusError(response.status, text, options.body));
  }
  return (await response.json()) as T;
}

function formatBytePlusError(status: number, text: string, body: unknown): string {
  const model = modelFromBody(body);
  const parsed = parseBytePlusError(text);
  const code = parsed?.code;
  const message = parsed?.message ?? text;
  const inactiveMatch = message.match(/has not activated the model\s+([^\s.]+)/i);
  const inactiveModel = inactiveMatch?.[1] ?? model;

  if (code === "ModelNotOpen" || inactiveMatch) {
    return [
      `BytePlus model is not activated${inactiveModel ? `: ${inactiveModel}` : ""}.`,
      "Activate this model in BytePlus Ark Console or update the matching BYTEPLUS_*_MODEL_ID environment variable to an activated model.",
    ].join(" ");
  }

  return `BytePlus request failed (${status})${model ? ` for ${model}` : ""}: ${message.slice(0, 300)}`;
}

function parseBytePlusError(text: string): { code?: string; message?: string } | null {
  try {
    const data = JSON.parse(text) as {
      error?: {
        code?: unknown;
        message?: unknown;
      };
    };
    return {
      code: typeof data.error?.code === "string" ? data.error.code : undefined,
      message: typeof data.error?.message === "string" ? data.error.message : undefined,
    };
  } catch {
    return null;
  }
}

function modelFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("model" in body)) return undefined;
  const model = (body as { model?: unknown }).model;
  return typeof model === "string" ? model : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) && /\.mp4(\?|$)/i.test(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["video_url", "videoUrl", "url"]) {
    const field = record[key];
    if (typeof field === "string" && /^https?:\/\//i.test(field)) {
      return field;
    }
  }
  for (const field of Object.values(record)) {
    const found = findVideoUrl(field);
    if (found) return found;
  }
  return undefined;
}

function findErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const message = record.message ?? record.error_message;
  if (typeof message === "string") return message;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    return findErrorMessage(error);
  }
  return undefined;
}

function responseText(response: ResponseTextResult): string | undefined {
  if (response.output_text) return response.output_text;
  if (response.content) return response.content;
  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(isString)
    .join("\n\n")
    .trim();
  return outputText || undefined;
}

function multimodalInputForReference(reference: {
  kind: "image" | "video" | "audio";
  url: string;
}): Record<string, unknown> {
  if (reference.kind === "image") {
    return {
      type: "input_image",
      image_url: reference.url,
    };
  }
  if (reference.kind === "video") {
    return {
      type: "input_video",
      video_url: reference.url,
    };
  }
  return {
    type: "input_text",
    text: `Audio reference URL: ${reference.url}`,
  };
}
