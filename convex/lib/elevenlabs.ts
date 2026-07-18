/**
 * ElevenLabs API helpers (voice library, TTS v3, sound effects).
 * Call only from Node Convex actions — keeps ELEVENLABS_API_KEY server-side.
 */

const ELEVEN_API_BASE = "https://api.elevenlabs.io";

export type SharedVoiceSort =
  | "trending"
  | "created_date"
  | "cloned_by_count"
  | "usage_character_count_1y";

export type ExploreVoicesFilters = {
  search?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  /** Maps UI “Category” (Narration, etc.) → API use_cases */
  useCases?: string[];
  sort?: SharedVoiceSort;
  page?: number;
  pageSize?: number;
  minNoticePeriodDays?: number | null;
  includeCustomRates?: boolean | null;
  includeLiveModerated?: boolean | null;
};

export type SharedVoice = {
  voiceId: string;
  /** Empty / "account" for premade voices already on the ElevenLabs account. */
  publicOwnerId: string;
  name: string;
  description?: string;
  previewUrl?: string;
  imageUrl?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  category?: string;
  descriptive?: string;
  featured?: boolean;
  clonedByCount?: number;
};

export type ExploreVoicesResult = {
  voices: SharedVoice[];
  hasMore: boolean;
  totalCount: number;
};

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  return key;
}

/** Map Studio sort labels → ElevenLabs shared-voices sort. */
export function mapVoiceSort(sort?: string): SharedVoiceSort {
  switch (sort) {
    case "latest":
    case "created_date":
      return "created_date";
    case "most_users":
    case "cloned_by_count":
      return "cloned_by_count";
    case "character_usage":
    case "usage_character_count_1y":
      return "usage_character_count_1y";
    case "trending":
    default:
      return "trending";
  }
}

/** Map UI category chips → ElevenLabs use_cases values. */
export function mapCategoryToUseCase(category?: string): string | undefined {
  if (!category) return undefined;
  const key = category.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    narration: "narrative_story",
    conversational: "conversational",
    characters: "characters_animation",
    social_media: "social_media",
    entertainment: "entertainment_tv",
    advertisement: "advertisement",
    educational: "informative_educational",
  };
  return aliases[key] ?? key;
}

export function isAccountVoiceOwnerId(publicOwnerId?: string | null): boolean {
  const value = (publicOwnerId ?? "").trim().toLowerCase();
  return !value || value === "account" || value === "elevenlabs";
}

/**
 * Free ElevenLabs plans cannot TTS library/shared voices via API.
 * Set ELEVENLABS_LIBRARY_VOICES_ENABLED=true after upgrading the provider plan.
 */
export function libraryVoicesAvailable(): boolean {
  const raw = process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Clamp explore page size (API/MCP/UI). */
export function normalizeVoicePageSize(pageSize?: number): number {
  if (pageSize == null || !Number.isFinite(pageSize)) return 30;
  return Math.min(100, Math.max(1, Math.floor(pageSize)));
}

/** Slice a voice list for page/pageSize explore responses. */
export function sliceVoicePage<T>(
  items: T[],
  page: number | undefined,
  pageSize: number | undefined,
): { voices: T[]; hasMore: boolean; totalCount: number; page: number; pageSize: number } {
  const size = normalizeVoicePageSize(pageSize);
  const p = Math.max(0, Math.floor(page ?? 0));
  const start = p * size;
  return {
    voices: items.slice(start, start + size),
    hasMore: start + size < items.length,
    totalCount: items.length,
    page: p,
    pageSize: size,
  };
}

/**
 * On free plans only true premade voices work. Copied library / professional
 * voices still sit in /v1/voices but TTS returns paid_plan_required.
 */
export function voiceUsableOnCurrentPlan(category?: string | null): boolean {
  if (libraryVoicesAvailable()) return true;
  return (category ?? "").trim().toLowerCase() === "premade";
}

/** User-facing copy — never expose provider plan / ElevenLabs details. */
export const VOICE_UNAVAILABLE_USER_MESSAGE =
  "This voice is unavailable. We'll notify you when it's available.";

function buildSharedVoicesQuery(filters: ExploreVoicesFilters): string {
  const params = new URLSearchParams();
  params.set(
    "page_size",
    String(normalizeVoicePageSize(filters.pageSize)),
  );
  params.set("page", String(Math.max(0, filters.page ?? 0)));
  params.set("sort", mapVoiceSort(filters.sort));
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.language?.trim()) params.set("language", filters.language.trim());
  if (filters.accent?.trim()) params.set("accent", filters.accent.trim());
  if (filters.gender?.trim()) params.set("gender", filters.gender.trim());
  if (filters.age?.trim()) params.set("age", filters.age.trim());
  for (const useCase of filters.useCases ?? []) {
    const mapped = mapCategoryToUseCase(useCase);
    if (mapped) params.append("use_cases", mapped);
  }
  if (filters.minNoticePeriodDays != null) {
    params.set("min_notice_period_days", String(filters.minNoticePeriodDays));
  }
  if (filters.includeCustomRates != null) {
    params.set("include_custom_rates", String(filters.includeCustomRates));
  }
  if (filters.includeLiveModerated != null) {
    params.set("include_live_moderated", String(filters.includeLiveModerated));
  }
  return params.toString();
}

function normalizeSharedVoice(raw: Record<string, unknown>): SharedVoice {
  return {
    voiceId: String(raw.voice_id ?? ""),
    publicOwnerId: String(raw.public_owner_id ?? ""),
    name: String(raw.name ?? "Voice"),
    description: raw.description != null ? String(raw.description) : undefined,
    previewUrl: raw.preview_url != null ? String(raw.preview_url) : undefined,
    imageUrl: raw.image_url != null ? String(raw.image_url) : undefined,
    language: raw.language != null ? String(raw.language) : undefined,
    accent: raw.accent != null ? String(raw.accent) : undefined,
    gender: raw.gender != null ? String(raw.gender) : undefined,
    age: raw.age != null ? String(raw.age) : undefined,
    useCase: raw.use_case != null ? String(raw.use_case) : undefined,
    category: raw.category != null ? String(raw.category) : undefined,
    descriptive: raw.descriptive != null ? String(raw.descriptive) : undefined,
    featured: Boolean(raw.featured),
    clonedByCount:
      typeof raw.cloned_by_count === "number" ? raw.cloned_by_count : undefined,
  };
}

function normalizeAccountVoice(raw: Record<string, unknown>): SharedVoice | null {
  const voiceId = String(raw.voice_id ?? "").trim();
  if (!voiceId) return null;
  const labels = Array.isArray(raw.labels)
    ? null
    : (raw.labels as Record<string, unknown> | undefined);
  const previewUrl =
    typeof raw.preview_url === "string"
      ? raw.preview_url
      : Array.isArray(raw.samples) &&
          raw.samples[0] &&
          typeof (raw.samples[0] as { preview_url?: string }).preview_url === "string"
        ? (raw.samples[0] as { preview_url: string }).preview_url
        : undefined;
  return {
    voiceId,
    publicOwnerId: "account",
    name: String(raw.name ?? "Voice"),
    description:
      raw.description != null
        ? String(raw.description)
        : labels?.description != null
          ? String(labels.description)
          : undefined,
    previewUrl,
    imageUrl: undefined,
    language: labels?.language != null ? String(labels.language) : undefined,
    accent: labels?.accent != null ? String(labels.accent) : undefined,
    gender: labels?.gender != null ? String(labels.gender) : undefined,
    age: labels?.age != null ? String(labels.age) : undefined,
    useCase: labels?.use_case != null ? String(labels.use_case) : undefined,
    category: raw.category != null ? String(raw.category) : undefined,
    featured: raw.category === "premade",
  };
}

export function parseElevenLabsError(status: number, detail: string): string {
  const trimmed = detail.trim();
  try {
    const json = JSON.parse(trimmed) as {
      detail?:
        | string
        | {
            message?: string;
            code?: string;
            type?: string;
          }
        | Array<{ msg?: string }>;
      message?: string;
    };
    const detailValue = json.detail;
    let message = "";
    if (typeof detailValue === "string") message = detailValue;
    else if (Array.isArray(detailValue)) {
      message = detailValue.map((item) => item.msg).filter(Boolean).join("; ");
    } else if (detailValue && typeof detailValue === "object") {
      message = String(detailValue.message ?? "");
      const code = String(detailValue.code ?? detailValue.type ?? "");
      if (
        /paid_plan_required|payment_required/i.test(code) ||
        /free users cannot use library voices|paid.?plan|upgrade your subscription/i.test(
          message,
        )
      ) {
        return VOICE_UNAVAILABLE_USER_MESSAGE;
      }
    } else if (typeof json.message === "string") {
      message = json.message;
    }
    if (message.trim()) return message.trim().slice(0, 240);
  } catch {
    // fall through
  }
  if (/paid_plan_required|library voices|payment_required/i.test(trimmed)) {
    return VOICE_UNAVAILABLE_USER_MESSAGE;
  }
  return `ElevenLabs request failed (${status})${trimmed ? `: ${trimmed.slice(0, 180)}` : ""}`;
}

/** Premade / account voices that work for TTS without a paid library plan. */
export async function listAccountVoices(): Promise<SharedVoice[]> {
  const response = await fetch(`${ELEVEN_API_BASE}/v1/voices`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseElevenLabsError(response.status, detail));
  }
  const json = (await response.json()) as {
    voices?: Array<Record<string, unknown>>;
  };
  return (json.voices ?? [])
    .map(normalizeAccountVoice)
    .filter((voice): voice is SharedVoice => Boolean(voice?.voiceId));
}

export async function listSharedVoices(
  filters: ExploreVoicesFilters = {},
): Promise<ExploreVoicesResult> {
  const query = buildSharedVoicesQuery(filters);
  const response = await fetch(`${ELEVEN_API_BASE}/v1/shared-voices?${query}`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseElevenLabsError(response.status, detail));
  }
  const json = (await response.json()) as {
    voices?: Array<Record<string, unknown>>;
    has_more?: boolean;
    total_count?: number;
  };
  return {
    voices: (json.voices ?? [])
      .map(normalizeSharedVoice)
      .filter((voice) => voice.voiceId && voice.publicOwnerId),
    hasMore: Boolean(json.has_more),
    totalCount: Number(json.total_count) || 0,
  };
}

/** Add a shared library voice to the ElevenLabs account collection (required before TTS). */
export async function addSharedVoice(
  publicOwnerId: string,
  voiceId: string,
  newName?: string,
): Promise<void> {
  if (isAccountVoiceOwnerId(publicOwnerId)) return;
  const response = await fetch(
    `${ELEVEN_API_BASE}/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        new_name: (newName?.trim() || `Studio ${voiceId.slice(0, 8)}`).slice(0, 100),
      }),
    },
  );
  // Already-added voices may 400/409 — treat as ok for idempotent saves.
  if (!response.ok && response.status !== 400 && response.status !== 409) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseElevenLabsError(response.status, detail));
  }
}

export async function textToSpeechV3(args: {
  voiceId: string;
  text: string;
}): Promise<{ data: Uint8Array; mediaType: string }> {
  const text = args.text.trim();
  if (!text) throw new Error("Enter text for the voiceover.");
  if (text.length > 3000) {
    throw new Error("Voiceover text must be 3000 characters or less for eleven_v3.");
  }
  const response = await fetch(
    `${ELEVEN_API_BASE}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v3",
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseElevenLabsError(response.status, detail));
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { data: buffer, mediaType: "audio/mpeg" };
}

export async function soundGeneration(args: {
  text: string;
  durationSeconds?: number | null;
  loop?: boolean;
  promptInfluence?: number;
}): Promise<{ data: Uint8Array; mediaType: string }> {
  const text = args.text.trim();
  if (!text) throw new Error("Describe the sound effect to generate.");
  const body: Record<string, unknown> = {
    text,
    model_id: "eleven_text_to_sound_v2",
  };
  if (args.durationSeconds != null && Number.isFinite(args.durationSeconds)) {
    body.duration_seconds = Math.max(0.5, Math.min(30, Number(args.durationSeconds)));
  }
  if (args.loop != null) body.loop = Boolean(args.loop);
  if (args.promptInfluence != null && Number.isFinite(args.promptInfluence)) {
    body.prompt_influence = Math.max(0, Math.min(1, Number(args.promptInfluence)));
  }
  const response = await fetch(`${ELEVEN_API_BASE}/v1/sound-generation`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseElevenLabsError(response.status, detail));
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { data: buffer, mediaType: "audio/mpeg" };
}
