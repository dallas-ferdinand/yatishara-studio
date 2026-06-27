import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const current = authedQuery({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
  }),
  handler: async (ctx) => {
    return {
      userId: ctx.user._id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
    };
  },
});

export const ensureStudioDefaults = authedMutation({
  args: {},
  returns: v.object({
    rootFolderId: v.id("folders"),
    billingAccountId: v.id("billingAccounts"),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const existingRoot = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", undefined),
      )
      .first();

    const rootFolderId =
      existingRoot?._id ??
      (await ctx.db.insert("folders", {
        ownerId: ctx.user._id,
        parentId: undefined,
        name: "Studio",
        icon: "Folder",
        color: "#22c55e",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      }));

    const existingBilling = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();

    const billingAccountId =
      existingBilling?._id ??
      (await ctx.db.insert("billingAccounts", {
        userId: ctx.user._id,
        creditBalance: 0,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      }));

    return { rootFolderId, billingAccountId };
  },
});
