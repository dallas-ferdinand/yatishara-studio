/** Pure helpers for hashtag / keyword normalization and identity scoring. */

export const MAX_HASHTAGS_PER_POST = 20;
export const MAX_KEYWORDS_PER_POST = 12;
export const MAX_MENTIONS_PER_POST = 12;
export const HASHTAG_MIN_LEN = 2;
export const HASHTAG_MAX_LEN = 32;
export const KEYWORD_MAX_LEN = 32;

const TAG_RE = /^[a-z0-9_]{2,32}$/;
const MENTION_RE = /^[a-z][a-z0-9._]{2,29}$/;

const KEYWORD_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "too",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

/** Strip #, lowercase, validate `[a-z0-9_]{2,32}`. Returns null if invalid. */
export function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").toLowerCase();
  if (!TAG_RE.test(tag)) return null;
  return tag;
}

/** Display form keeps original casing when valid; otherwise uses normalized. */
export function displayHashtag(raw: string, normalized: string): string {
  const stripped = raw.trim().replace(/^#+/, "");
  if (stripped.toLowerCase() === normalized && /^[A-Za-z0-9_]+$/.test(stripped)) {
    return stripped;
  }
  return normalized;
}

export function normalizeHashtagList(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = normalizeHashtag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_HASHTAGS_PER_POST) break;
  }
  return out;
}

/** Keywords: lowercase alphanumeric + underscore/hyphen, length-capped. */
export function normalizeKeyword(raw: string): string | null {
  const kw = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, KEYWORD_MAX_LEN);
  if (kw.length < 2) return null;
  if (KEYWORD_STOPWORDS.has(kw)) return null;
  return kw;
}

export function normalizeKeywordList(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const kw = normalizeKeyword(item);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= MAX_KEYWORDS_PER_POST) break;
  }
  return out;
}

export function normalizeMentionUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!MENTION_RE.test(username)) return null;
  return username;
}

/** Pull `#tags` from caption text. */
export function extractHashtagsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const found = Array.from(caption.matchAll(/#([a-zA-Z0-9_]{2,32})/g)).map(
    (match) => match[1] ?? "",
  );
  return normalizeHashtagList(found);
}

/** Pull `@usernames` from caption text. */
export function extractMentionsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of caption.matchAll(/(?:^|[^\w.])@([a-zA-Z][a-zA-Z0-9._]{2,29})\b/g)) {
    const username = normalizeMentionUsername(match[1] ?? "");
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= MAX_MENTIONS_PER_POST) break;
  }
  return out;
}

/**
 * Keywords auto-pulled from description body (not hashtags / mentions).
 * Keeps order of first appearance.
 */
export function extractKeywordsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const cleaned = caption
    .replace(/#[a-zA-Z0-9_]{2,32}/g, " ")
    .replace(/@[a-zA-Z][a-zA-Z0-9._]{2,29}/g, " ");
  const tokens = cleaned.split(/[^a-zA-Z0-9_-]+/).filter(Boolean);
  return normalizeKeywordList(tokens);
}

/**
 * Log-scaled creator identity score for repeated use of a tag.
 * postCount 1 → ~10, 2 → ~16, 4 → ~23, 8 → ~30, …
 */
export function creatorConsistencyScore(postCount: number, now: number, updatedAt: number): number {
  const count = Math.max(0, postCount);
  const base = Math.log2(1 + count) * 12;
  const ageDays = Math.max(0, (now - updatedAt) / (1000 * 60 * 60 * 24));
  const recency = Math.max(0, 14 - ageDays) * 0.4;
  return Math.round((base + recency) * 100) / 100;
}

export const AFFINITY_WEIGHTS = {
  like: 2,
  save: 3,
  share: 2,
  view: 0.3,
} as const;

export type AffinityEvent = keyof typeof AFFINITY_WEIGHTS;

/** Cap so tag signals cannot drown the follow boost (5000). */
export const TAG_SIGNAL_CAP = 1200;
export const AFFINITY_SIGNAL_CAP = 800;
export const CONSISTENCY_SIGNAL_CAP = 400;
export const KEYWORD_SIGNAL_CAP = 200;
