/** Owner emoji stickers on file-manager items (folders, assets, docs, edits, elements). */

export const REACTION_EMOJIS = [
  "❤️",
  "👍",
  "👎",
  "🔥",
  "😂",
  "😮",
  "😢",
  "😡",
  "🎉",
  "✅",
  "⭐",
  "👀",
  "👏",
  "💯",
  "🙏",
  "🚀",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Strip emoji presentation selectors so ❤️ / ❤ match the same allowlist entry. */
function emojiKey(value: string): string {
  return String(value).trim().replace(/\uFE0F/g, "");
}

const ALLOWED = new Set<string>(REACTION_EMOJIS.map(emojiKey));
const CANONICAL = new Map<string, ReactionEmoji>(
  REACTION_EMOJIS.map((emoji) => [emojiKey(emoji), emoji]),
);

export function isAllowedReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return ALLOWED.has(emojiKey(emoji));
}

/** Returns cleared `undefined` or a validated emoji; throws on unknown. */
export function normalizeReactionEmoji(
  emoji: string | null,
): ReactionEmoji | undefined {
  if (emoji === null) return undefined;
  const canonical = CANONICAL.get(emojiKey(String(emoji)));
  if (!canonical) {
    throw new Error("That reaction is not available");
  }
  return canonical;
}
