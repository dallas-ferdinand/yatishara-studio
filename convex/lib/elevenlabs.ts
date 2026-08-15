/**
 * ElevenLabs API helpers (voice library, TTS v3, sound effects, music).
 * Call only from Node Convex actions — keys stay server-side.
 *
 * Multi-key: set ELEVENLABS_API_KEYS (JSON array or comma-separated) and/or
 * ELEVENLABS_API_KEY. Each billed request probes remaining credits and tries
 * key 1 → key 2 → …; errors only when every key is empty or fails quota.
 */

/** Self-serve Music API length: 3s–10min (matches ElevenLabs music_length_ms 3_000–600_000). */
export const ELEVEN_MUSIC_MIN_DURATION_SECONDS = 3;
export const ELEVEN_MUSIC_MAX_DURATION_SECONDS = 600;
export const ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS = 30;
/** Default MP3 for music_v2 (v1's mp3_44100_128 400s compose). */
export const ELEVEN_MUSIC_OUTPUT_FORMAT = "mp3_48000_192";

export function clampMusicDurationSeconds(durationSeconds?: number | null): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) {
    return ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS;
  }
  return Math.max(
    ELEVEN_MUSIC_MIN_DURATION_SECONDS,
    Math.min(ELEVEN_MUSIC_MAX_DURATION_SECONDS, Math.round(Number(durationSeconds))),
  );
}

/** `null` = Auto (omit `music_length_ms`; model picks length). */
export function resolveMusicLengthMs(
  durationSeconds?: number | null,
): number | null {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    Number(durationSeconds) <= 0
  ) {
    return null;
  }
  return clampMusicDurationSeconds(durationSeconds) * 1000;
}

export type ElevenMusicModelId = "music_v1" | "music_v2";

export function resolveMusicModelId(
  modelId?: string | null,
): ElevenMusicModelId {
  return modelId === "music_v1" ? "music_v1" : "music_v2";
}

const ELEVEN_API_BASE = "https://api.elevenlabs.io";

/** Parse ELEVENLABS_API_KEYS (+ legacy ELEVENLABS_API_KEY). Deduped, order preserved. */
export function parseConfiguredApiKeys(
  multiRaw?: string | null,
  singleRaw?: string | null,
): string[] {
  const keys: string[] = [];
  const multi = (multiRaw ?? "").trim();
  if (multi) {
    if (multi.startsWith("[")) {
      try {
        const parsed = JSON.parse(multi) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) keys.push(item.trim());
            else if (
              item &&
              typeof item === "object" &&
              typeof (item as { key?: string }).key === "string" &&
              (item as { key: string }).key.trim()
            ) {
              keys.push((item as { key: string }).key.trim());
            }
          }
        }
      } catch {
        // fall through to delimiter split
      }
    }
    if (keys.length === 0) {
      for (const part of multi.split(/[\n,]+/)) {
        const key = part.trim();
        if (key) keys.push(key);
      }
    }
  }
  const single = (singleRaw ?? "").trim();
  if (single) keys.unshift(single);
  return [...new Set(keys)];
}

function configuredApiKeys(): string[] {
  return parseConfiguredApiKeys(
    process.env.ELEVENLABS_API_KEYS,
    process.env.ELEVENLABS_API_KEY,
  );
}

async function remainingCharsForKey(key: string): Promise<number | null> {
  try {
    const response = await fetch(`${ELEVEN_API_BASE}/v1/user/subscription`, {
      headers: { "xi-api-key": key, Accept: "application/json" },
    });
    const text = await response.text();
    if (!response.ok) {
      // Scoped keys can TTS but refuse user_read — treat as unknown remaining.
      if (/missing_permissions|missing the permission/i.test(text)) return null;
      if (response.status === 401) return -1;
      return null;
    }
    const json = JSON.parse(text) as {
      character_count?: number;
      character_limit?: number;
    };
    const used = Number(json.character_count);
    const limit = Number(json.character_limit);
    if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
    return Math.max(0, limit - used);
  } catch {
    return null;
  }
}

/**
 * Pick keys with enough remaining credits for needChars, then unknown-scope keys.
 * Throws AUDIO_PROVIDER_QUOTA_USER_MESSAGE when none can cover the request.
 */
export async function selectApiKeysForNeed(needChars: number): Promise<string[]> {
  const keys = configuredApiKeys();
  if (keys.length === 0) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  const need = Math.max(0, Math.floor(Number(needChars) || 0));
  if (need <= 0) return keys;

  const enough: Array<{ key: string; remaining: number }> = [];
  const unknown: string[] = [];
  for (const key of keys) {
    const remaining = await remainingCharsForKey(key);
    if (remaining == null) {
      unknown.push(key);
      continue;
    }
    if (remaining < 0) continue; // invalid
    if (remaining >= need) enough.push({ key, remaining });
  }
  enough.sort((a, b) => b.remaining - a.remaining);
  const ordered = [...enough.map((row) => row.key), ...unknown];
  if (ordered.length === 0) {
    throw new Error(AUDIO_PROVIDER_QUOTA_USER_MESSAGE);
  }
  return ordered;
}

/**
 * Run a billed ElevenLabs call with credit-aware key rotation.
 * Retries the next key on quota/exhaustion; other errors fail immediately.
 */
export async function withElevenLabsApiKey<T>(
  needChars: number,
  attempt: (apiKey: string) => Promise<T>,
): Promise<T> {
  const keys = await selectApiKeysForNeed(needChars);
  let lastError: unknown;
  for (const key of keys) {
    try {
      return await attempt(key);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        message === AUDIO_PROVIDER_QUOTA_USER_MESSAGE ||
        isElevenLabsProviderQuotaMessage(message)
      ) {
        continue;
      }
      throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(AUDIO_PROVIDER_QUOTA_USER_MESSAGE);
}

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
 * Paid Studio ElevenLabs key can TTS the shared voice library.
 * Set ELEVENLABS_LIBRARY_VOICES_ENABLED=false only to lock back to premade.
 */
export function libraryVoicesAvailable(): boolean {
  const raw = process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
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
 * When library access is off, only true premade voices work. Copied library /
 * professional voices still sit in /v1/voices but TTS returns paid_plan_required.
 */
export function voiceUsableOnCurrentPlan(category?: string | null): boolean {
  if (libraryVoicesAvailable()) return true;
  return (category ?? "").trim().toLowerCase() === "premade";
}

/** User-facing copy — never expose provider plan / ElevenLabs details. */
export const VOICE_UNAVAILABLE_USER_MESSAGE =
  "This voice is unavailable. We'll notify you when it's available.";

/**
 * ElevenLabs account quota / provider credits — not the customer's Studio TTD balance.
 * Must never be rewritten into "Not enough balance / You need $0 TTD".
 */
export const AUDIO_PROVIDER_QUOTA_USER_MESSAGE =
  "Audio generation is temporarily unavailable. Try again in a few minutes.";

function isElevenLabsProviderQuotaMessage(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /quota_exceeded|insufficient_credits|payment_required|credit_limit|out_of_credits/i.test(
      lower,
    )
  ) {
    return true;
  }
  // Provider API credits (never Studio TTD).
  if (
    /insufficient credits|not enough credits|credits? (remaining|left)|exceeds your quota|out of credits/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

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
            status?: string;
          }
        | Array<{ msg?: string }>;
      message?: string;
    };
    const detailValue = json.detail;
    let message = "";
    let code = "";
    if (typeof detailValue === "string") message = detailValue;
    else if (Array.isArray(detailValue)) {
      message = detailValue.map((item) => item.msg).filter(Boolean).join("; ");
    } else if (detailValue && typeof detailValue === "object") {
      message = String(detailValue.message ?? "");
      code = String(
        detailValue.status ?? detailValue.code ?? detailValue.type ?? "",
      );
      if (
        /paid_plan_required|payment_required/i.test(code) ||
        /free users cannot use library voices|paid.?plan|upgrade your subscription/i.test(
          message,
        )
      ) {
        // payment_required for library voices ≠ provider quota; keep voice copy.
        if (!/quota_exceeded|insufficient_credits|credit_limit/i.test(code)) {
          return VOICE_UNAVAILABLE_USER_MESSAGE;
        }
      }
    } else if (typeof json.message === "string") {
      message = json.message;
    }
    if (isElevenLabsProviderQuotaMessage(`${code} ${message}`) || status === 402) {
      return AUDIO_PROVIDER_QUOTA_USER_MESSAGE;
    }
    if (message.trim()) return message.trim().slice(0, 240);
  } catch {
    // fall through
  }
  if (isElevenLabsProviderQuotaMessage(trimmed) || status === 402) {
    return AUDIO_PROVIDER_QUOTA_USER_MESSAGE;
  }
  if (/paid_plan_required|library voices|payment_required/i.test(trimmed)) {
    return VOICE_UNAVAILABLE_USER_MESSAGE;
  }
  return `ElevenLabs request failed (${status})${trimmed ? `: ${trimmed.slice(0, 180)}` : ""}`;
}

function throwIfElevenLabsFailed(status: number, detail: string): void {
  if (status >= 200 && status < 300) return;
  throw new Error(parseElevenLabsError(status, detail));
}

/** Premade / account voices that work for TTS without a paid library plan. */
export async function listAccountVoices(): Promise<SharedVoice[]> {
  return withElevenLabsApiKey(1, async (apiKey) => {
    const response = await fetch(`${ELEVEN_API_BASE}/v1/voices`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throwIfElevenLabsFailed(response.status, detail);
    }
    const json = (await response.json()) as {
      voices?: Array<Record<string, unknown>>;
    };
    return (json.voices ?? [])
      .map(normalizeAccountVoice)
      .filter((voice): voice is SharedVoice => Boolean(voice?.voiceId));
  });
}

export async function listSharedVoices(
  filters: ExploreVoicesFilters = {},
): Promise<ExploreVoicesResult> {
  return withElevenLabsApiKey(1, async (apiKey) => {
    const query = buildSharedVoicesQuery(filters);
    const response = await fetch(`${ELEVEN_API_BASE}/v1/shared-voices?${query}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throwIfElevenLabsFailed(response.status, detail);
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
  });
}

/** Add a shared library voice to the ElevenLabs account collection (required before TTS). */
export async function addSharedVoice(
  publicOwnerId: string,
  voiceId: string,
  newName?: string,
): Promise<void> {
  if (isAccountVoiceOwnerId(publicOwnerId)) return;
  await withElevenLabsApiKey(1, async (apiKey) => {
    const response = await fetch(
      `${ELEVEN_API_BASE}/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
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
      throwIfElevenLabsFailed(response.status, detail);
    }
  });
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
  return withElevenLabsApiKey(text.length, async (apiKey) => {
    const response = await fetch(
      `${ELEVEN_API_BASE}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
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
      throwIfElevenLabsFailed(response.status, detail);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { data: buffer, mediaType: "audio/mpeg" };
  });
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
  // SFX billing is not 1:1 with prompt chars — require any positive remaining.
  return withElevenLabsApiKey(1, async (apiKey) => {
    const response = await fetch(`${ELEVEN_API_BASE}/v1/sound-generation`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throwIfElevenLabsFailed(response.status, detail);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { data: buffer, mediaType: "audio/mpeg" };
  });
}

export type MusicContextAdherence = "low" | "medium" | "high";
export type MusicConditionStrength = "low" | "medium" | "high" | "xhigh";

export type MusicGenerationChunk = {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles?: string[];
  context_adherence?: MusicContextAdherence;
  conditioning_ref?: {
    song_id: string;
    range: { start_ms: number; end_ms: number };
  } | null;
  condition_strength?: MusicConditionStrength | null;
};

export type MusicAudioRefChunk = {
  song_id: string;
  range: { start_ms: number; end_ms: number };
};

export type MusicCompositionPlan = {
  chunks: Array<MusicGenerationChunk | MusicAudioRefChunk>;
};

export type ComposedMusicResult = {
  data: Uint8Array;
  mediaType: string;
  songId?: string;
  compositionPlan?: MusicCompositionPlan | Record<string, unknown>;
  songMetadata?: Record<string, unknown>;
};

function isAudioRefChunk(
  chunk: MusicGenerationChunk | MusicAudioRefChunk,
): chunk is MusicAudioRefChunk {
  return (
    typeof (chunk as MusicAudioRefChunk).song_id === "string" &&
    !(chunk as MusicGenerationChunk).text
  );
}

/** Append custom lyrics into the first generation chunk text (music_v2 plan). */
export function injectCustomLyricsIntoMusicPlan(
  plan: MusicCompositionPlan,
  lyrics: string,
): MusicCompositionPlan {
  const trimmed = lyrics.trim();
  if (!trimmed || !plan?.chunks?.length) return plan;
  let injected = false;
  const chunks = plan.chunks.map((chunk) => {
    if (injected || isAudioRefChunk(chunk) || !chunk.text?.trim()) return chunk;
    injected = true;
    const base = chunk.text.trimEnd();
    return {
      ...chunk,
      text: `${base}\n${trimmed}`,
    };
  });
  if (!injected) {
    chunks.unshift({
      text: `[Verse]\n${trimmed}`,
      duration_ms: 15_000,
      positive_styles: ["vocals", "clear lyrics", "great production quality"],
      negative_styles: [],
      context_adherence: "high",
    });
  }
  return { chunks };
}

/** Prompt-mode lyrics hint when not using a composition plan. */
export function appendCustomLyricsToMusicPrompt(
  prompt: string,
  lyrics: string,
): string {
  const base = prompt.trim();
  const trimmed = lyrics.trim();
  if (!trimmed) return base;
  if (!base) return `Lyrics:\n${trimmed}`;
  if (/lyrics\s*:/i.test(base)) return base;
  return `${base}\n\nLyrics:\n${trimmed}`;
}

/** Free (rate-limited) plan from prompt — then pass into compose. */
export async function createMusicCompositionPlan(args: {
  prompt: string;
  durationSeconds?: number | null;
  modelId?: ElevenMusicModelId | string | null;
}): Promise<MusicCompositionPlan> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("Describe the music to generate.");
  if (prompt.length > 4000) {
    throw new Error("Music prompt must be 4000 characters or less.");
  }
  const lengthMs = resolveMusicLengthMs(args.durationSeconds);
  const modelId = resolveMusicModelId(args.modelId);
  const planBody: Record<string, unknown> = {
    prompt,
    model_id: modelId,
  };
  if (lengthMs != null) planBody.music_length_ms = lengthMs;
  return withElevenLabsApiKey(1, async (apiKey) => {
    const response = await fetch(`${ELEVEN_API_BASE}/v1/music/plan`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(planBody),
    });
    const text = await response.text();
    if (!response.ok) throwIfElevenLabsFailed(response.status, text);
    const parsed = JSON.parse(text) as MusicCompositionPlan;
    if (!parsed?.chunks || !Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
      throw new Error("ElevenLabs returned an empty composition plan.");
    }
    return parsed;
  });
}

/**
 * Build an extend/inpaint plan: keep [0, keepMs) from songId, generate a new
 * trailing section from the prompt styles.
 */
export function buildMusicExtendPlan(args: {
  songId: string;
  keepMs: number;
  extendMs: number;
  prompt: string;
  positiveStyles?: string[];
}): MusicCompositionPlan {
  const songId = args.songId.trim();
  if (!songId) throw new Error("Select a stored music track to extend.");
  const keepMs = Math.max(50, Math.floor(args.keepMs));
  const extendMs = Math.max(
    3000,
    Math.min(120_000, Math.floor(args.extendMs)),
  );
  const text = args.prompt.trim() || "[Extension]\nContinue the track";
  const styles =
    args.positiveStyles && args.positiveStyles.length > 0
      ? args.positiveStyles
      : [
          "great production quality",
          "natural continuation",
          "consistent mix",
          "same genre",
          "same tempo feel",
          "same instrumentation family",
        ];
  return {
    chunks: [
      {
        song_id: songId,
        range: { start_ms: 0, end_ms: keepMs },
      },
      {
        text,
        duration_ms: extendMs,
        positive_styles: styles,
        negative_styles: [],
        context_adherence: "high",
        conditioning_ref: {
          song_id: songId,
          range: {
            start_ms: Math.max(0, keepMs - Math.min(keepMs, 15_000)),
            end_ms: keepMs,
          },
        },
        condition_strength: "high",
      },
    ],
  };
}

function parseMultipartMusicResponse(
  body: Uint8Array,
  contentType: string | null,
): { json: Record<string, unknown>; audio: Uint8Array; mediaType: string } {
  const ct = contentType ?? "";
  const boundaryMatch = /boundary="?([^";]+)"?/i.exec(ct);
  if (!boundaryMatch) {
    // Some gateways may return raw audio; treat whole body as mp3.
    return { json: {}, audio: body, mediaType: "audio/mpeg" };
  }
  const boundary = boundaryMatch[1]!;
  const marker = new TextEncoder().encode(`--${boundary}`);
  const parts: Uint8Array[] = [];
  let start = indexOfBytes(body, marker);
  while (start >= 0) {
    let next = indexOfBytes(body, marker, start + marker.length);
    const sliceEnd = next < 0 ? body.length : next;
    let part = body.subarray(start + marker.length, sliceEnd);
    if (part.length >= 2 && part[0] === 0x0d && part[1] === 0x0a) {
      part = part.subarray(2);
    }
    // Drop closing --
    if (part.length >= 2 && part[0] === 0x2d && part[1] === 0x2d) break;
    parts.push(part);
    start = next;
  }

  let json: Record<string, unknown> = {};
  let audio: Uint8Array | null = null;
  let mediaType = "audio/mpeg";
  const headerSep = new TextEncoder().encode("\r\n\r\n");
  for (const part of parts) {
    const sep = indexOfBytes(part, headerSep);
    if (sep < 0) continue;
    const headerText = new TextDecoder().decode(part.subarray(0, sep));
    let payload = part.subarray(sep + headerSep.length);
    // Trim trailing CRLF before next boundary remnant
    while (
      payload.length >= 2 &&
      payload[payload.length - 2] === 0x0d &&
      payload[payload.length - 1] === 0x0a
    ) {
      payload = payload.subarray(0, payload.length - 2);
    }
    if (/content-type:\s*application\/json/i.test(headerText)) {
      try {
        json = JSON.parse(new TextDecoder().decode(payload)) as Record<
          string,
          unknown
        >;
      } catch {
        json = {};
      }
    } else if (/content-type:\s*audio\//i.test(headerText)) {
      const mt = /content-type:\s*([^\r\n;]+)/i.exec(headerText);
      mediaType = mt?.[1]?.trim() || "audio/mpeg";
      audio = payload;
    }
  }
  if (!audio) throw new Error("ElevenLabs music response missing audio part.");
  return { json, audio, mediaType };
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) return from;
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

async function postMusicCompose(args: {
  apiKey: string;
  body: Record<string, unknown>;
  detailed: boolean;
}): Promise<ComposedMusicResult> {
  const path = args.detailed ? "/v1/music/detailed" : "/v1/music";
  const response = await fetch(
    `${ELEVEN_API_BASE}${path}?output_format=${ELEVEN_MUSIC_OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": args.apiKey,
        "Content-Type": "application/json",
        Accept: args.detailed ? "*/*" : "audio/mpeg",
      },
      body: JSON.stringify(args.body),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throwIfElevenLabsFailed(response.status, detail);
  }
  const songId = response.headers.get("song-id") ?? undefined;
  const contentType = response.headers.get("content-type");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (args.detailed || (contentType ?? "").includes("multipart/")) {
    const parsed = parseMultipartMusicResponse(buffer, contentType);
    const plan =
      (parsed.json.composition_plan as MusicCompositionPlan | undefined) ??
      undefined;
    const meta =
      (parsed.json.song_metadata as Record<string, unknown> | undefined) ??
      undefined;
    return {
      data: parsed.audio,
      mediaType: parsed.mediaType,
      songId,
      compositionPlan: plan,
      songMetadata: meta,
    };
  }
  return { data: buffer, mediaType: "audio/mpeg", songId };
}

/**
 * Eleven Music compose — prompt and/or composition plan (`music_v2`).
 * Prefer `composeMusicDetailed` when you need songId / plan back.
 */
function buildMusicComposeBody(args: {
  prompt?: string;
  compositionPlan?: MusicCompositionPlan;
  durationSeconds?: number | null;
  forceInstrumental?: boolean;
  storeForInpainting?: boolean;
  modelId?: ElevenMusicModelId | string | null;
  finetuneId?: string | null;
}): Record<string, unknown> {
  const prompt = args.prompt?.trim() ?? "";
  const plan = args.compositionPlan;
  if (!plan && !prompt) throw new Error("Describe the music to generate.");
  if (prompt && prompt.length > 4000) {
    throw new Error("Music prompt must be 4000 characters or less.");
  }
  if (plan && prompt) {
    throw new Error("Use either a prompt or a composition plan, not both.");
  }
  const body: Record<string, unknown> = {
    model_id: resolveMusicModelId(args.modelId),
  };
  if (args.storeForInpainting != null) {
    body.store_for_inpainting = Boolean(args.storeForInpainting);
  }
  const finetuneId = args.finetuneId?.trim();
  if (finetuneId) body.finetune_id = finetuneId;
  if (plan) {
    body.composition_plan = plan;
  } else {
    body.prompt = prompt;
    const lengthMs = resolveMusicLengthMs(args.durationSeconds);
    if (lengthMs != null) body.music_length_ms = lengthMs;
    if (args.forceInstrumental != null) {
      body.force_instrumental = Boolean(args.forceInstrumental);
    }
  }
  return body;
}

export async function composeMusic(args: {
  prompt?: string;
  compositionPlan?: MusicCompositionPlan;
  durationSeconds?: number | null;
  forceInstrumental?: boolean;
  modelId?: ElevenMusicModelId | string | null;
  finetuneId?: string | null;
}): Promise<ComposedMusicResult> {
  const body = buildMusicComposeBody(args);
  return withElevenLabsApiKey(1, async (apiKey) =>
    postMusicCompose({ apiKey, body, detailed: false }),
  );
}

/** Detailed compose — returns audio + composition plan + optional songId. */
export async function composeMusicDetailed(args: {
  prompt?: string;
  compositionPlan?: MusicCompositionPlan;
  durationSeconds?: number | null;
  forceInstrumental?: boolean;
  storeForInpainting?: boolean;
  modelId?: ElevenMusicModelId | string | null;
  finetuneId?: string | null;
}): Promise<ComposedMusicResult> {
  const body = buildMusicComposeBody({
    ...args,
    storeForInpainting: Boolean(args.storeForInpainting),
  });
  return withElevenLabsApiKey(1, async (apiKey) =>
    postMusicCompose({ apiKey, body, detailed: true }),
  );
}

/**
 * Prompt → (free) composition plan → detailed compose with that plan.
 * Default Studio music path for structured sections/styles.
 */
export async function composeMusicFromPromptWithPlan(args: {
  prompt: string;
  durationSeconds?: number | null;
  forceInstrumental?: boolean;
  storeForInpainting?: boolean;
  modelId?: ElevenMusicModelId | string | null;
  finetuneId?: string | null;
  customLyrics?: string | null;
}): Promise<ComposedMusicResult & { sourcePlan: MusicCompositionPlan }> {
  const plan = await createMusicCompositionPlan({
    prompt: args.prompt,
    durationSeconds: args.durationSeconds,
    modelId: args.modelId,
  });
  const withLyrics = args.customLyrics?.trim()
    ? injectCustomLyricsIntoMusicPlan(plan, args.customLyrics)
    : plan;
  // force_instrumental only applies to prompt mode — plan already encodes vocals/styles.
  void args.forceInstrumental;
  const result = await composeMusicDetailed({
    compositionPlan: withLyrics,
    storeForInpainting: args.storeForInpainting ?? true,
    modelId: args.modelId,
    finetuneId: args.finetuneId,
  });
  return {
    ...result,
    sourcePlan: withLyrics,
    compositionPlan: result.compositionPlan ?? withLyrics,
  };
}

/** Extend a stored song (inpainting plan). Enterprise-tier on some accounts. */
export async function extendStoredMusic(args: {
  songId: string;
  keepMs: number;
  extendMs: number;
  prompt: string;
  storeForInpainting?: boolean;
}): Promise<ComposedMusicResult> {
  const plan = buildMusicExtendPlan(args);
  return composeMusicDetailed({
    compositionPlan: plan,
    storeForInpainting: args.storeForInpainting ?? true,
  });
}

/** Stem separation — returns multipart/zip bytes depending on provider. */
export async function separateMusicStems(args: {
  fileBytes: Uint8Array;
  fileName?: string;
  mimeType?: string;
}): Promise<{ data: Uint8Array; mediaType: string }> {
  if (!args.fileBytes.byteLength) throw new Error("Audio file is empty.");
  return withElevenLabsApiKey(1, async (apiKey) => {
    const form = new FormData();
    const blob = new Blob([Buffer.from(args.fileBytes)], {
      type: args.mimeType || "audio/mpeg",
    });
    form.append("file", blob, args.fileName || "track.mp3");
    const response = await fetch(
      `${ELEVEN_API_BASE}/v1/music/stem-separation?output_format=${ELEVEN_MUSIC_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throwIfElevenLabsFailed(response.status, detail);
    }
    const mediaType = response.headers.get("content-type") || "application/zip";
    const data = new Uint8Array(await response.arrayBuffer());
    return { data, mediaType };
  });
}

export { isAudioRefChunk };
