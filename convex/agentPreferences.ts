import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const getForOwner = internalQuery({
  args: { ownerId: v.id("users") },
  returns: v.object({ autoApprove: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    return { autoApprove: Boolean(row?.autoApprove) };
  },
});

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
    } else {
      await ctx.db.insert("agentPreferences", {
        ownerId: ctx.user._id,
        autoApprove: args.autoApprove,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (args.autoApprove) {
      await ctx.runMutation(internal.agentApprovals.approvePendingForOwner, {
        ownerId: ctx.user._id,
      });
    }
    return null;
  },
});

/** Flush leftover approval cards so the composer is not stuck. */
export const flushPendingIfYolo = authedMutation({
  args: { threadId: v.optional(v.id("agentThreads")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await ctx.runMutation(internal.agentApprovals.approvePendingForOwner, {
      ownerId: ctx.user._id,
      threadId: args.threadId,
    });
  },
});
