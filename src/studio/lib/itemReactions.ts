/** Client-side mirror of convex/lib/itemReactions (emoji allowlist for Files). */

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

export function isAllowedReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}
