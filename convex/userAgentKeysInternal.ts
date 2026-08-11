import { v } from "convex/values";
import { authedMutation } from "./lib/customFunctions";
import { internalQuery } from "./_generated/server";

const provider = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("zai"),
  v.literal("openrouter"),
);

export const upsertEncrypted = authedMutation({
  args: {
    provider,
    encryptedKey: v.string(),
    iv: v.string(),
    keyHint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userAgentKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: args.provider,
        encryptedKey: args.encryptedKey,
        iv: args.iv,
        keyHint: args.keyHint,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAgentKeys", {
        ownerId: ctx.user._id,
        provider: args.provider,
        encryptedKey: args.encryptedKey,
        iv: args.iv,
        keyHint: args.keyHint,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const getEncryptedForOwner = internalQuery({
  args: { ownerId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      provider: provider,
      encryptedKey: v.string(),
      iv: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userAgentKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (!row) return null;
    return {
      provider: row.provider,
      encryptedKey: row.encryptedKey,
      iv: row.iv,
    };
  },
});
