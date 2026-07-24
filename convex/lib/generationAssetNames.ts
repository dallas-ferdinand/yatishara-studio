const REFERENCES_MARKER = "\n\nReferences:\n";
const AUTHORITATIVE_HEADER = /^AUTHORITATIVE\s+REVIEWED\s+REQUIREMENTS/i;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "into",
  "make",
  "create",
  "generate",
  "please",
  "want",
  "need",
  "me",
  "my",
  "a",
]);

/** Drop the locked-requirements preamble so filenames use the creative body. */
export function stripAuthoritativePromptHeader(prompt: string): string {
  const raw = String(prompt ?? "");
  const trimmed = raw.trimStart();
  if (!AUTHORITATIVE_HEADER.test(trimmed)) return raw;
  const bodyStart = trimmed.search(/\n\n(?!\s*[-•*]|\s*[A-Za-z][^:\n]{0,40}:)/);
  if (bodyStart >= 0) {
    return trimmed.slice(bodyStart + 2).trimStart();
  }
  const lines = trimmed.split("\n");
  const start = lines.findIndex(
    (line, index) =>
      index > 2 &&
      line.trim().length > 0 &&
      !line.trim().startsWith("-") &&
      !/^[A-Za-z][^:\n]{0,40}:\s*$/.test(line.trim()) &&
      !AUTHORITATIVE_HEADER.test(line),
  );
  return start > 0 ? lines.slice(start).join("\n").trimStart() : trimmed;
}

/** Strip composer refs / placeholders so filenames stay readable. */
export function promptSnippetForName(
  prompt?: string,
  maxLen = 42,
  preferredSubject?: string,
): string {
  const preferred = String(preferredSubject ?? "").trim();
  if (preferred) {
    const fromSubject = promptSnippetForName(preferred, maxLen);
    if (fromSubject) return fromSubject;
  }
  const raw = stripAuthoritativePromptHeader(String(prompt ?? ""));
  const splitIdx = raw.indexOf(REFERENCES_MARKER);
  const body = (splitIdx === -1 ? raw : raw.slice(0, splitIdx))
    .replace(/\uFFFC/g, " ")
    .replace(/@([^\s@|]+)/g, " ")
    .replace(/[|*_`#>[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return "";

  const words = body
    .split(" ")
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ""))
    .filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= 8) break;
    if (STOPWORDS.has(word.toLowerCase()) && kept.length > 0) continue;
    kept.push(word);
  }
  const joined = (kept.length ? kept : words).join(" ").trim();
  if (joined.length <= maxLen) return joined;
  const clipped = joined.slice(0, maxLen);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 16 ? clipped.slice(0, lastSpace) : clipped).trim();
}

export function shortUniqueToken(uniqueId: string, length = 6): string {
  const cleaned = String(uniqueId ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-Math.max(4, length));
  return cleaned || String(Date.now()).slice(-6);
}

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (word.length <= 2 && word === word.toUpperCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatSnippet(snippet: string): string {
  return snippet
    .split(" ")
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

/** Prefer "Jessica" over "Jessica - Playful, Bright, Warm". */
function voiceShortLabel(voiceName?: string): string {
  const raw = String(voiceName ?? "").trim();
  if (!raw) return "";
  const dash = raw.indexOf(" - ");
  return (dash > 0 ? raw.slice(0, dash) : raw).slice(0, 28);
}

export type GenerationAssetKind = "image" | "video" | "audio" | "sfx" | "music";

/**
 * Human-readable unique asset name for explorer + storage filename.
 * Always includes a short job token so repeats never collide.
 */
export function generationAssetFileName(args: {
  kind: GenerationAssetKind;
  prompt?: string;
  /** Prefer brief subject over the full AUTHORITATIVE prompt when naming. */
  subject?: string;
  voiceName?: string;
  /** 1-based when a job returns multiple images */
  index?: number;
  uniqueId: string;
  extension: string;
}): string {
  const ext = String(args.extension || "bin").replace(/^\./, "").toLowerCase() || "bin";
  const token = shortUniqueToken(args.uniqueId);
  const snippet = formatSnippet(
    promptSnippetForName(args.prompt, 42, args.subject),
  );
  const indexSuffix =
    typeof args.index === "number" && args.index > 1 ? ` ${args.index}` : "";

  let base: string;
  if (args.kind === "sfx") {
    base = snippet ? `SFX — ${snippet}` : "Sound effect";
  } else if (args.kind === "music") {
    base = snippet ? `Music — ${snippet}` : "Music";
  } else if (args.kind === "audio") {
    const voice = voiceShortLabel(args.voiceName);
    if (voice && snippet) base = `${voice} — ${snippet}`;
    else if (voice) base = `${voice} voiceover`;
    else if (snippet) base = `Voiceover — ${snippet}`;
    else base = "Voiceover";
  } else if (args.kind === "video") {
    base = snippet ? snippet : "Video";
  } else {
    base = snippet ? snippet : "Image";
  }

  const name = `${base}${indexSuffix} · ${token}.${ext}`;
  return name.slice(0, 120);
}
