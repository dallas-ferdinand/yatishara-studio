import { v } from "convex/values";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import { userHasPassword } from "./passwordAuth";
import { normalizePhone } from "./phonePasswordAuth";

function accountHasRequiredContacts(user: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}): boolean {
  const names = resolveNameParts(user);
  return Boolean(
    user.email?.trim() &&
      user.phone?.trim() &&
      names.firstName &&
      names.lastName,
  );
}

function resolveNameParts(user: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): { firstName?: string; lastName?: string } {
  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  if (firstName && lastName) {
    return { firstName, lastName };
  }
  const split = splitLegacyName(user.name);
  return {
    firstName: firstName || split.firstName,
    lastName: lastName || split.lastName,
  };
}

function splitLegacyName(name: string | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function composeDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export const current = authedQuery({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerifiedAt: v.optional(v.number()),
    accountComplete: v.boolean(),
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
    hasPassword: v.boolean(),
    /** Missing → true (Assistance on by default). */
    assistanceDefaultEnabled: v.boolean(),
    activeStyleSheetId: v.optional(v.id("elements")),
  }),
  handler: async (ctx) => {
    const names = resolveNameParts(ctx.user);
    return {
      userId: ctx.user._id,
      name: ctx.user.name || (names.firstName && names.lastName
        ? composeDisplayName(names.firstName, names.lastName)
        : undefined),
      firstName: names.firstName,
      lastName: names.lastName,
      email: ctx.user.email,
      phone: ctx.user.phone,
      phoneVerifiedAt: ctx.user.phoneVerifiedAt,
      accountComplete: accountHasRequiredContacts(ctx.user),
      role: ctx.user.role,
      hasPassword: await userHasPassword(ctx, ctx.user),
      assistanceDefaultEnabled: ctx.user.assistanceDefaultEnabled !== false,
      activeStyleSheetId: ctx.user.activeStyleSheetId,
    };
  },
});

export const setAssistanceDefault = authedMutation({
  args: {
    enabled: v.boolean(),
  },
  returns: v.object({
    assistanceDefaultEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.user._id, {
      assistanceDefaultEnabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { assistanceDefaultEnabled: args.enabled };
  },
});

export const updateAccountDetails = authedMutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
    phoneVerifiedAt: v.optional(v.number()),
    accountComplete: v.boolean(),
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
  }),
  handler: async (ctx, args) => {
    const firstName = requireNamePart(args.firstName, "First name");
    const lastName = requireNamePart(args.lastName, "Last name");
    const email = requireEmail(args.email);
    const phone = requirePhone(args.phone);
    const name = composeDisplayName(firstName, lastName);

    // Once set, contacts can only be changed — never cleared.
    if (ctx.user.email && !email) {
      throw new Error("Email is required and cannot be removed");
    }
    if (ctx.user.phone && !phone) {
      throw new Error("Phone is required and cannot be removed");
    }

    const existingEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existingEmail && existingEmail._id !== ctx.user._id) {
      throw new Error("Email already belongs to another account");
    }

    const existingPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (existingPhone && existingPhone._id !== ctx.user._id) {
      throw new Error("Phone already belongs to another account");
    }

    const phoneChanged = phone !== ctx.user.phone;
    const emailChanged = email !== ctx.user.email;
    await ctx.db.patch(ctx.user._id, {
      firstName,
      lastName,
      name,
      email,
      phone,
      emailVerified: emailChanged ? false : ctx.user.emailVerified,
      phoneVerifiedAt: phoneChanged ? undefined : ctx.user.phoneVerifiedAt,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(ctx.user._id);
    if (!updated || !updated.email || !updated.phone || !updated.firstName || !updated.lastName) {
      throw new Error("User not found");
    }
    return {
      userId: updated._id,
      name: updated.name,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      phoneVerifiedAt: updated.phoneVerifiedAt,
      accountComplete: accountHasRequiredContacts(updated),
      role: updated.role,
    };
  },
});

export const setActiveStyleSheet = authedMutation({
  args: {
    styleSheetElementId: v.union(v.id("elements"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.styleSheetElementId) {
      const element = await ctx.db.get("elements", args.styleSheetElementId);
      if (!element || element.ownerId !== ctx.user._id || element.deletedAt) {
        throw new Error("Style Sheet not found");
      }
      if (element.type !== "style_sheet") {
        throw new Error("Element is not a Style Sheet");
      }
    }
    await ctx.db.patch(ctx.user._id, {
      activeStyleSheetId: args.styleSheetElementId ?? undefined,
      updatedAt: Date.now(),
    });
    return null;
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
          v.literal("pending"),
          v.literal("needs_review"),
          v.literal("checkout_failed"),
          v.literal("cancelled"),
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

function requireNamePart(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function requireEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email is required");
  }
  return email;
}

function requirePhone(value: string): string {
  const phone = normalizePhone(value);
  if (!phone) {
    throw new Error("A valid phone / WhatsApp number is required");
  }
  return phone;
}
