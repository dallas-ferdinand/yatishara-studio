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

const ALLOWED = new Set<string>(REACTION_EMOJIS);

export function isAllowedReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return ALLOWED.has(emoji);
}

/** Returns cleared `undefined` or a validated emoji; throws on unknown. */
export function normalizeReactionEmoji(
  emoji: string | null,
): ReactionEmoji | undefined {
  if (emoji === null) return undefined;
  const trimmed = String(emoji).trim();
  if (!isAllowedReactionEmoji(trimmed)) {
    throw new Error("That reaction is not available");
  }
  return trimmed;
}
