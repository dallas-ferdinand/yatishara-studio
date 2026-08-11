/**
 * BytePlus ModelArk client for Studio generation.
 * Chat/tools via OpenAI-compatible AI SDK; images + video via Ark REST.
 */
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

export const ARK_DEFAULT_BASE_URL =
  "https://ark.ap-southeast.bytepluses.com/api/v3";

export const ARK_MODEL_IDS = {
  image: "dola-seedream-5-0-pro-260628",
  video25: "dreamina-seedance-2-5-260628",
  video20: "dreamina-seedance-2-0-260128",
  text: "seed-2-0-lite-260428",
  textMini: "seed-2-0-mini-260428",
} as const;

const LEGACY_MODEL_MAP: Record<string, string> = {
  "openai/gpt-image-2": ARK_MODEL_IDS.image,
  "bytedance/seedance-2.5": ARK_MODEL_IDS.video25,
  "bytedance/seedance-2.0": ARK_MODEL_IDS.video20,
  "google/gemini-3.5-flash": ARK_MODEL_IDS.text,
  "google/gemini-2.5-flash-lite": ARK_MODEL_IDS.textMini,
  "google/gemini-2.5-flash": ARK_MODEL_IDS.text,
};

let cachedProvider: OpenAIProvider | null = null;

export function arkApiKey(): string {
  const key = process.env.ARK_API_KEY?.trim();
  if (!key) {
    throw new Error("ARK_API_KEY is not configured");
  }
  return key;
}

export function arkBaseUrl(): string {
  const base =
    process.env.ARK_BASE_URL?.trim() || ARK_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

export function resolveArkModelId(modelId: string | undefined | null): string {
  const raw = modelId?.trim();
  if (!raw) {
    throw new Error("Model id is required");
  }
  if (LEGACY_MODEL_MAP[raw]) return LEGACY_MODEL_MAP[raw];
  // Vercel-style prefixes → Ark ids when slug-like
  if (raw === "seedance-2.5" || raw.includes("seedance-2.5")) {
    return ARK_MODEL_IDS.video25;
  }
  if (raw === "seedance-2.0" || raw.includes("seedance-2.0")) {
    return ARK_MODEL_IDS.video20;
  }
  if (raw.includes("seedream") || raw.includes("gpt-image")) {
    return ARK_MODEL_IDS.image;
  }
  return raw;
}

export function arkProvider(): OpenAIProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = createOpenAI({
    apiKey: arkApiKey(),
    baseURL: arkBaseUrl(),
    name: "byteplus-ark",
  });
  return cachedProvider;
}

export function arkLanguageModel(modelId: string) {
  return arkProvider().chat(resolveArkModelId(modelId));
}

type ArkFetchInit = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

async function arkFetch<T>(path: string, init: ArkFetchInit = {}): Promise<T> {
  const url = `${arkBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${arkApiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const errObj = json as {
      error?: { message?: string; code?: string };
      message?: string;
    } | null;
    const message =
      errObj?.error?.message ||
      errObj?.message ||
      text.slice(0, 400) ||
      `Ark HTTP ${response.status}`;
    throw new Error(`BytePlus Ark ${response.status}: ${message}`);
  }
  return json as T;
}

export type ArkImageResult = {
  data: Uint8Array;
  mediaType: string;
};

/**
 * Seedream 5.0 Pro via POST /images/generations.
 * size: "1K" | "2K" | "WxH". 4K Studio tier clamps to 2K.
 */
export async function generateArkImage(args: {
  modelId?: string;
  prompt: string;
  size?: string;
  referenceUrls?: string[];
  watermark?: boolean;
}): Promise<ArkImageResult[]> {
  const model = resolveArkModelId(
    args.modelId || process.env.GATEWAY_IMAGE_MODEL_ID || ARK_MODEL_IDS.image,
  );
  const refs = (args.referenceUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const body: Record<string, unknown> = {
    model,
    prompt: args.prompt,
    size: args.size || "2K",
    response_format: "b64_json",
    watermark: args.watermark ?? false,
  };
  if (refs.length === 1) {
    body.image = refs[0];
  } else if (refs.length > 1) {
    body.image = refs.slice(0, 10);
  }

  const result = await arkFetch<{
    data?: Array<{ b64_json?: string; url?: string }>;
  }>("/images/generations", { body });

  const items = result.data ?? [];
  if (!items.length) {
    throw new Error("Seedream returned no images");
  }

  const out: ArkImageResult[] = [];
  for (const item of items) {
    if (item.b64_json) {
      const binary = new Uint8Array(Buffer.from(item.b64_json, "base64"));
      out.push({ data: binary, mediaType: "image/png" });
      continue;
    }
    if (item.url) {
      const media = await downloadMedia(item.url);
      out.push(media);
      continue;
    }
  }
  if (!out.length) {
    throw new Error("Seedream returned empty image payloads");
  }
  return out;
}

export type ArkVideoContentItem =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      role?: "first_frame" | "last_frame" | "reference_image";
    }
  | {
      type: "video_url";
      video_url: { url: string };
      role?: "reference_video";
    }
  | {
      type: "audio_url";
      audio_url: { url: string };
      role?: "reference_audio";
    };

export type ArkVideoGenerateInput = {
  modelId?: string;
  prompt: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  generateAudio?: boolean;
  startFrameUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  pollTimeoutMs?: number;
};

export async function generateArkVideo(
  input: ArkVideoGenerateInput,
): Promise<ArkImageResult> {
  const model = resolveArkModelId(
    input.modelId || process.env.GATEWAY_VIDEO_MODEL_ID || ARK_MODEL_IDS.video25,
  );
  const content: ArkVideoContentItem[] = [
    { type: "text", text: input.prompt },
  ];

  const startFrame = input.startFrameUrl?.trim();
  if (startFrame) {
    content.push({
      type: "image_url",
      image_url: { url: startFrame },
      role: "first_frame",
    });
  }
  for (const url of input.referenceImageUrls ?? []) {
    const trimmed = url?.trim();
    if (!trimmed || trimmed === startFrame) continue;
    content.push({
      type: "image_url",
      image_url: { url: trimmed },
      role: "reference_image",
    });
  }
  for (const url of input.referenceVideoUrls ?? []) {
    const trimmed = url?.trim();
    if (!trimmed) continue;
    content.push({
      type: "video_url",
      video_url: { url: trimmed },
      role: "reference_video",
    });
  }
  for (const url of input.referenceAudioUrls ?? []) {
    const trimmed = url?.trim();
    if (!trimmed) continue;
    content.push({
      type: "audio_url",
      audio_url: { url: trimmed },
      role: "reference_audio",
    });
  }

  const body: Record<string, unknown> = {
    model,
    content,
    resolution: input.resolution || "720p",
    duration: input.duration ?? 5,
    generate_audio: input.generateAudio ?? true,
    watermark: false,
  };
  if (input.ratio) {
    body.ratio = input.ratio;
  }

  console.info("[ark-seedance] create task", {
    model,
    resolution: body.resolution,
    duration: body.duration,
    ratio: body.ratio ?? null,
    contentTypes: content.map((c) => c.type),
  });

  const created = await arkFetch<{ id?: string; task_id?: string }>(
    "/contents/generations/tasks",
    { body },
  );
  const taskId = created.id || created.task_id;
  if (!taskId) {
    throw new Error("Seedance did not return a task id");
  }

  const timeoutMs = input.pollTimeoutMs ?? 540_000;
  const started = Date.now();
  let delayMs = 2_500;

  while (Date.now() - started < timeoutMs) {
    await sleep(delayMs);
    delayMs = Math.min(8_000, Math.round(delayMs * 1.25));

    const status = await arkFetch<ArkVideoTaskStatus>(
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: "GET" },
    );

    const state = String(
      status.status || status.task_status || "",
    ).toLowerCase();
    if (
      state === "succeeded" ||
      state === "success" ||
      state === "completed" ||
      state === "done"
    ) {
      const videoUrl = extractVideoUrl(status);
      if (!videoUrl) {
        throw new Error("Seedance succeeded but returned no video URL");
      }
      return downloadMedia(videoUrl);
    }
    if (
      state === "failed" ||
      state === "error" ||
      state === "cancelled" ||
      state === "canceled"
    ) {
      const reason =
        status.error?.message ||
        status.message ||
        status.fail_reason ||
        state;
      throw new Error(`Seedance task failed: ${reason}`);
    }
  }

  throw new Error(
    `Seedance timed out after ${Math.round(timeoutMs / 1000)}s (task ${taskId})`,
  );
}

type ArkVideoTaskStatus = {
  id?: string;
  status?: string;
  task_status?: string;
  message?: string;
  fail_reason?: string;
  error?: { message?: string };
  content?: {
    video_url?: string;
    file_url?: string;
  };
  output?: {
    video_url?: string;
    url?: string;
  };
  result?: {
    video_url?: string;
    url?: string;
  };
  data?: {
    video_url?: string;
    url?: string;
  };
};

function extractVideoUrl(status: ArkVideoTaskStatus): string | undefined {
  return (
    status.content?.video_url ||
    status.content?.file_url ||
    status.output?.video_url ||
    status.output?.url ||
    status.result?.video_url ||
    status.result?.url ||
    status.data?.video_url ||
    status.data?.url ||
    undefined
  );
}

async function downloadMedia(url: string): Promise<ArkImageResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Ark media (${response.status})`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const mediaType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessMediaType(url);
  return { data: buffer, mediaType };
}

function guessMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".webm")) return "video/webm";
  return "video/mp4";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map Studio 1K/2K/4K (+ aspect) to Seedream size. 4K clamps to 2K. */
export function seedreamSizeForRequest(
  resolution: string | undefined,
  aspectRatio: string | undefined,
): string {
  const tier = (resolution ?? "2K").toUpperCase();
  // Seedream accepts 1K / 2K labels; pixel WxH also works.
  if (tier === "1K") {
    return seedreamPixelSize("1K", aspectRatio);
  }
  // 2K and clamped 4K
  return seedreamPixelSize("2K", aspectRatio);
}

function seedreamPixelSize(
  tier: "1K" | "2K",
  aspectRatio: string | undefined,
): string {
  const match = aspectRatio?.match(/^(\d+)\s*:\s*(\d+)$/);
  const rw = match ? Number(match[1]) : 1;
  const rh = match ? Number(match[2]) : 1;
  const longEdge = tier === "1K" ? 1536 : 2048;
  if (!rw || !rh || rw === rh) {
    return tier === "1K" ? "1536x1536" : "2048x2048";
  }
  let width: number;
  let height: number;
  if (rw > rh) {
    width = longEdge;
    height = Math.round((longEdge * rh) / rw);
  } else {
    height = longEdge;
    width = Math.round((longEdge * rw) / rh);
  }
  // Keep under 2.36MP for 1K billing when possible.
  if (tier === "1K") {
    const maxPixels = 2_360_000;
    while (width * height > maxPixels) {
      width = Math.max(16, Math.round(width * 0.98));
      height = Math.max(16, Math.round(height * 0.98));
    }
  }
  // Round to even
  width = width - (width % 2);
  height = height - (height % 2);
  return `${width}x${height}`;
}

export function formatArkError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 400);
  }
  return "BytePlus Ark request failed";
}
