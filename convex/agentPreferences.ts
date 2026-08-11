import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const getMine = authedQuery({
  args: {},
  returns: v.object({
    autoApprove: v.boolean(),
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("agentPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .unique();
    return {
      autoApprove: Boolean(row?.autoApprove),
      updatedAt: row?.updatedAt,
    };
  },
});

export const setMine = authedMutation({
  args: { autoApprove: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agentPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        autoApprove: args.autoApprove,
        updatedAt: now,
      });
      return null;
    }
    await ctx.db.insert("agentPreferences", {
      ownerId: ctx.user._id,
      autoApprove: args.autoApprove,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});
