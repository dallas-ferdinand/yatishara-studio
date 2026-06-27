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

export const updateAccountDetails = authedMutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
  }),
  handler: async (ctx, args) => {
    const name = normalizeOptional(args.name);
    const email = normalizeEmail(args.email);
    const phone = normalizeOptional(args.phone);

    if (email) {
      const existingEmail = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (existingEmail && existingEmail._id !== ctx.user._id) {
        throw new Error("Email already belongs to another account");
      }
    }

    if (phone) {
      const existingPhone = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      if (existingPhone && existingPhone._id !== ctx.user._id) {
        throw new Error("Phone already belongs to another account");
      }
    }

    await ctx.db.patch(ctx.user._id, {
      name,
      email,
      phone,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(ctx.user._id);
    if (!updated) {
      throw new Error("User not found");
    }
    return {
      userId: updated._id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
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

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEmail(value: string | undefined): string | undefined {
  return normalizeOptional(value)?.toLowerCase();
}
