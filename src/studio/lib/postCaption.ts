/** Client-side caption parsing for post compose (mirrors convex/lib/hashtagNormalize). */

const MAX_HASHTAGS = 20;
const MAX_KEYWORDS = 12;
const MAX_MENTIONS = 12;

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

function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").toLowerCase();
  if (!TAG_RE.test(tag)) return null;
  return tag;
}

function normalizeKeyword(raw: string): string | null {
  const kw = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 32);
  if (kw.length < 2) return null;
  if (KEYWORD_STOPWORDS.has(kw)) return null;
  return kw;
}

function normalizeMention(raw: string): string | null {
  const username = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!MENTION_RE.test(username)) return null;
  return username;
}

export function extractHashtagsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of caption.matchAll(/#([a-zA-Z0-9_]{2,32})/g)) {
    const tag = normalizeHashtag(match[1] ?? "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

export function extractMentionsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of caption.matchAll(/(?:^|[^\w.])@([a-zA-Z][a-zA-Z0-9._]{2,29})\b/g)) {
    const username = normalizeMention(match[1] ?? "");
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
}

export function extractKeywordsFromCaption(caption: string | undefined): string[] {
  if (!caption) return [];
  const cleaned = caption
    .replace(/#[a-zA-Z0-9_]{2,32}/g, " ")
    .replace(/@[a-zA-Z][a-zA-Z0-9._]{2,29}/g, " ");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of cleaned.split(/[^a-zA-Z0-9_-]+/).filter(Boolean)) {
    const kw = normalizeKeyword(token);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
