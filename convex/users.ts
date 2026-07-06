import { v } from "convex/values";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import { userHasPassword } from "./passwordAuth";

export const current = authedQuery({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
    hasPassword: v.boolean(),
  }),
  handler: async (ctx) => {
    return {
      userId: ctx.user._id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
      hasPassword: await userHasPassword(ctx, ctx.user),
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

export const adminListCustomers = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      creditBalance: v.number(),
      reservedCredits: v.number(),
      activeSubscription: v.optional(
        v.object({
          status: v.union(
            v.literal("active"),
            v.literal("past_due"),
            v.literal("cancelled"),
            v.literal("expired"),
          ),
          planName: v.optional(v.string()),
          currentPeriodEnd: v.number(),
        }),
      ),
      paymentCount: v.number(),
      latestPaymentStatus: v.optional(
        v.union(
          v.literal("receipt_uploaded"),
          v.literal("receipt_received"),
          v.literal("payment_completed"),
          v.literal("rejected"),
        ),
      ),
    }),
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const rows = await Promise.all(
      users.map(async (user) => {
        const account = await ctx.db
          .query("billingAccounts")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique();
        const subscription = account?.activeSubscriptionId
          ? await ctx.db.get(account.activeSubscriptionId)
          : null;
        const plan = subscription ? await ctx.db.get(subscription.planId) : null;
        const payments = await ctx.db
          .query("payments")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        const latestPayment = payments.sort((a, b) => b.createdAt - a.createdAt)[0];
        return {
          _id: user._id,
          _creationTime: user._creationTime,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastSeenAt: user.lastSeenAt,
          creditBalance: account?.creditBalance ?? 0,
          reservedCredits: account?.reservedCredits ?? 0,
          activeSubscription: subscription
            ? {
                status: subscription.status,
                planName: plan?.name,
                currentPeriodEnd: subscription.currentPeriodEnd,
              }
            : undefined,
          paymentCount: payments.length,
          latestPaymentStatus: latestPayment?.status,
        };
      }),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEmail(value: string | undefined): string | undefined {
  return normalizeOptional(value)?.toLowerCase();
}
