/**
 * ElevenLabs API helpers (voice library, TTS v3, sound effects, music).
 * Call only from Node Convex actions — keys stay server-side.
 *
 * Multi-key: set ELEVENLABS_API_KEYS (JSON array or comma-separated) and/or
 * ELEVENLABS_API_KEY. Each billed request probes remaining credits and tries
 * key 1 → key 2 → …; errors only when every key is empty or fails quota.
 */

/** Self-serve Music API length: 3s–5min (API allows up to 10min; we bill/cap at 5). */
export const ELEVEN_MUSIC_MIN_DURATION_SECONDS = 3;
export const ELEVEN_MUSIC_MAX_DURATION_SECONDS = 300;
export const ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS = 30;

export function clampMusicDurationSeconds(durationSeconds?: number | null): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) {
    return ELEVEN_MUSIC_DEFAULT_DURATION_SECONDS;
  }
  return Math.max(
    ELEVEN_MUSIC_MIN_DURATION_SECONDS,
    Math.min(ELEVEN_MUSIC_MAX_DURATION_SECONDS, Math.round(Number(durationSeconds))),
  );
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

/** Eleven Music compose — prompt mode (`music_v2`). */
export async function composeMusic(args: {
  prompt: string;
  durationSeconds?: number | null;
  forceInstrumental?: boolean;
}): Promise<{ data: Uint8Array; mediaType: string }> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("Describe the music to generate.");
  if (prompt.length > 4000) {
    throw new Error("Music prompt must be 4000 characters or less.");
  }
  const durationSeconds = clampMusicDurationSeconds(args.durationSeconds);
  const body: Record<string, unknown> = {
    prompt,
    model_id: "music_v2",
    music_length_ms: durationSeconds * 1000,
  };
  if (args.forceInstrumental != null) {
    body.force_instrumental = Boolean(args.forceInstrumental);
  }
  return withElevenLabsApiKey(1, async (apiKey) => {
    const response = await fetch(
      // v2 default is mp3_48000_192; 44100_128 is a v1 format and 400s compose.
      `${ELEVEN_API_BASE}/v1/music?output_format=mp3_48000_192`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
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
