export type MentionCandidate = {
  id: string;
  tag: string;
  kind: "element" | "asset";
  label: string;
  thumbnailUrl?: string;
  mediaKind?: "image" | "video" | "audio";
};

/** Commas after `@chip,` are separators, not part of the tag. */
export function stripTrailingAtCommas(value: string): string {
  return String(value ?? "").replace(/,+$/g, "");
}

/** `@query` at end of text before caret. Ignores email-style `name@host`. */
export function composerAtQuery(
  textBeforeCaret: string,
): { query: string; from: number } | null {
  const text = String(textBeforeCaret ?? "");
  const trimmed = stripTrailingAtCommas(text);
  const match = trimmed.match(/@([A-Za-z0-9._-]*)$/);
  if (!match || match.index == null) return null;
  const from = match.index;
  if (from > 0 && /[A-Za-z0-9]/.test(trimmed.charAt(from - 1))) return null;
  return { query: match[1] ?? "", from };
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  const list = q
    ? candidates.filter(
        (item) =>
          item.tag.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q),
      )
    : candidates;
  return list.slice(0, 12);
}
