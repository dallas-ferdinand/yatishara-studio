import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const provider = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("zai"),
  v.literal("openrouter"),
);

export const getMine = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      provider: provider,
      keyHint: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("userAgentKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .unique();
    if (!row) return null;
    return {
      provider: row.provider,
      keyHint: row.keyHint,
      updatedAt: row.updatedAt,
    };
  },
});

export const clearMine = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("userAgentKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
