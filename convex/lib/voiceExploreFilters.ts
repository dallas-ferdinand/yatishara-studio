/**
 * Pure voice filter matching for explore / mine lists.
 * Keep free of Node/env so client + Convex actions can share it.
 */

export type VoiceExploreFilterable = {
  name?: string;
  description?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  category?: string;
};

export type VoiceExploreFilters = {
  search?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  /** UI category chip (narration, conversational, …) or EL use_case. */
  category?: string;
};

function norm(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const LANGUAGE_ALIASES: Record<string, string[]> = {
  en: ["en", "english"],
  es: ["es", "spanish", "espanol", "español"],
  fr: ["fr", "french", "francais", "français"],
  de: ["de", "german", "deutsch"],
  pt: ["pt", "portuguese", "portugues", "português"],
  zh: ["zh", "chinese", "mandarin", "zh cn", "zh tw"],
  ja: ["ja", "japanese"],
  hi: ["hi", "hindi"],
};

const CATEGORY_TO_USE_CASE: Record<string, string> = {
  narration: "narrative story",
  narrative_story: "narrative story",
  conversational: "conversational",
  characters: "characters animation",
  characters_animation: "characters animation",
  social_media: "social media",
  entertainment: "entertainment tv",
  entertainment_tv: "entertainment tv",
  advertisement: "advertisement",
  educational: "informative educational",
  informative_educational: "informative educational",
};

function languageMatches(haveRaw: string | undefined, wantRaw: string): boolean {
  const want = norm(wantRaw);
  const have = norm(haveRaw);
  if (!want) return true;
  if (!have) return false;
  const aliases = LANGUAGE_ALIASES[want] ?? [want];
  return aliases.some(
    (alias) => have === alias || have.startsWith(alias) || alias.startsWith(have),
  );
}

function tokenMatches(haveRaw: string | undefined, wantRaw: string): boolean {
  const want = norm(wantRaw);
  const have = norm(haveRaw);
  if (!want) return true;
  if (!have) return false;
  // Exact only — substring would make "female" match filter "male".
  if (have === want) return true;
  const haveTokens = new Set(have.split(" ").filter(Boolean));
  return want.split(" ").filter(Boolean).every((tok) => haveTokens.has(tok));
}

function categoryMatches(voice: VoiceExploreFilterable, categoryRaw: string): boolean {
  const wantKey = norm(categoryRaw).replace(/ /g, "_");
  const wantUse = CATEGORY_TO_USE_CASE[wantKey] ?? norm(categoryRaw);
  const haveUse = norm(voice.useCase);
  const haveCat = norm(voice.category);
  if (!wantUse && !wantKey) return true;
  if (haveUse && (haveUse === wantUse || haveUse.includes(wantUse) || wantUse.includes(haveUse))) {
    return true;
  }
  if (haveCat && (haveCat === wantKey || haveCat.includes(wantKey))) {
    return true;
  }
  return false;
}

/** True when voice satisfies active explore filters (missing label fails a set filter). */
export function voiceMatchesExploreFilters(
  voice: VoiceExploreFilterable,
  filters: VoiceExploreFilters,
): boolean {
  const q = norm(filters.search);
  if (q) {
    const hay = `${voice.name ?? ""} ${voice.description ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.language?.trim() && !languageMatches(voice.language, filters.language)) {
    return false;
  }
  if (filters.accent?.trim() && !tokenMatches(voice.accent, filters.accent)) {
    return false;
  }
  if (filters.gender?.trim() && !tokenMatches(voice.gender, filters.gender)) {
    return false;
  }
  if (filters.age?.trim() && !tokenMatches(voice.age, filters.age)) {
    return false;
  }
  if (filters.category?.trim() && !categoryMatches(voice, filters.category)) {
    return false;
  }
  return true;
}

export function hasActiveVoiceAttributeFilters(filters: VoiceExploreFilters): boolean {
  return Boolean(
    filters.language?.trim() ||
      filters.accent?.trim() ||
      filters.gender?.trim() ||
      filters.age?.trim() ||
      filters.category?.trim(),
  );
}
