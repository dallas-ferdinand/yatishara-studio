import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  ensureMessagesFolder,
  ensurePurchasedAssetsFolder,
  ensureSharedWithMeFolder,
} from "./folders";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import { ensureProfileForUser } from "./lib/profileEnsure";
import { toNameCase } from "./lib/profileIdentity";
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
  const firstName = nameCasePart(user.firstName);
  const lastName = nameCasePart(user.lastName);
  if (firstName && lastName) {
    return { firstName, lastName };
  }
  const split = splitLegacyName(user.name);
  return {
    firstName: firstName || split.firstName,
    lastName: lastName || split.lastName,
  };
}

function nameCasePart(value: string | undefined): string | undefined {
  const cased = value ? toNameCase(value) : "";
  return cased || undefined;
}

function splitLegacyName(name: string | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = name ? toNameCase(name) : "";
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
    defaultStudioTab: v.union(
      v.literal("composer"),
      v.literal("feed"),
      v.literal("network"),
      v.literal("messages"),
      v.null(),
    ),
    studioIntentChosen: v.boolean(),
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
      defaultStudioTab: ctx.user.defaultStudioTab ?? null,
      studioIntentChosen: ctx.user.studioIntentChosenAt != null,
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

const defaultStudioTabValidator = v.union(
  v.literal("composer"),
  v.literal("feed"),
  v.literal("network"),
  v.literal("messages"),
);

export const setDefaultStudioTab = authedMutation({
  args: {
    tab: defaultStudioTabValidator,
    /** When true, also marks signup intent as chosen (first-run chooser / silent backfill). */
    markIntentChosen: v.optional(v.boolean()),
  },
  returns: v.object({
    defaultStudioTab: defaultStudioTabValidator,
    studioIntentChosen: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const markIntent =
      Boolean(args.markIntentChosen) || ctx.user.studioIntentChosenAt == null;
    await ctx.db.patch(ctx.user._id, {
      defaultStudioTab: args.tab,
      updatedAt: now,
      ...(markIntent
        ? { studioIntentChosenAt: ctx.user.studioIntentChosenAt ?? now }
        : {}),
    });
    return {
      defaultStudioTab: args.tab,
      studioIntentChosen: true,
    };
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
    await ensureProfileForUser(ctx, updated._id);
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

/**
 * Studio tab online signal for DMs — set on connect/visibility only.
 * No interval heartbeat. Queries treat `studioOnlineAt` older than ~3 min as offline.
 */
export const setStudioOnline = authedMutation({
  args: { online: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const prevOnline = ctx.user.studioOnline === true;
    const prevAt = ctx.user.studioOnlineAt ?? 0;
    if (args.online) {
      // Throttle online pings from rapid visibility toggles.
      if (prevOnline && now - prevAt < 15_000) return null;
      await ctx.db.patch(ctx.user._id, {
        studioOnline: true,
        studioOnlineAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (!prevOnline) return null;
    await ctx.db.patch(ctx.user._id, {
      studioOnline: false,
      studioOnlineAt: now,
      updatedAt: now,
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
    const topFolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", undefined),
      )
      .collect();
    // Prefer a normal workspace root — never treat system folders as the Studio root.
    const existingRoot = topFolders.find(
      (folder) =>
        !folder.deletedAt &&
        folder.systemKind !== "messages" &&
        folder.systemKind !== "purchased_assets" &&
        folder.systemKind !== "public_assets" &&
        folder.systemKind !== "shared_with_me",
    );

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

    await ensureMessagesFolder(ctx, ctx.user._id, rootFolderId);
    await ensurePurchasedAssetsFolder(ctx, ctx.user._id, rootFolderId);
    await ensureSharedWithMeFolder(ctx, ctx.user._id, rootFolderId);

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
    // Cap admin customer enrichment — full historical N+1 was unbounded.
    const users = await ctx.db.query("users").order("desc").take(250);
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
        const recentPayments = await ctx.db
          .query("payments")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(50);
        const latestPayment = [...recentPayments].sort((a, b) => b.createdAt - a.createdAt)[0];
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
          paymentCount: recentPayments.length,
          latestPaymentStatus: latestPayment?.status,
        };
      }),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

function requireNamePart(value: string, label: string): string {
  const cased = toNameCase(value);
  if (!cased || cased.length > 80) {
    throw new Error(`${label} is required`);
  }
  return cased;
}

const NAME_NORMALIZE_BATCH = 50;

/** One-time / ops: rewrite stored account names in proper name case. */
export const normalizeStoredAccountNames = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({
      cursor: args.cursor ?? null,
      numItems: NAME_NORMALIZE_BATCH,
    });
    let updated = 0;
    for (const user of page.page) {
      const firstName = nameCasePart(user.firstName);
      const lastName = nameCasePart(user.lastName);
      const name =
        firstName && lastName
          ? composeDisplayName(firstName, lastName)
          : nameCasePart(user.name);
      const patch: {
        firstName?: string;
        lastName?: string;
        name?: string;
        updatedAt: number;
      } = { updatedAt: Date.now() };
      let changed = false;
      if (firstName && firstName !== user.firstName) {
        patch.firstName = firstName;
        changed = true;
      }
      if (lastName && lastName !== user.lastName) {
        patch.lastName = lastName;
        changed = true;
      }
      if (name && name !== user.name) {
        patch.name = name;
        changed = true;
      }
      if (!changed) continue;
      await ctx.db.patch(user._id, patch);
      updated += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.users.normalizeStoredAccountNames, {
        cursor: page.continueCursor,
      });
    }
    return updated;
  },
});

/** Ops: set a person's account name (support fixes, missing signup names). */
export const setAccountNameForUser = internalMutation({
  args: {
    userId: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
  },
  returns: v.object({
    firstName: v.string(),
    lastName: v.string(),
    name: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const firstName = requireNamePart(args.firstName, "First name");
    const lastName = requireNamePart(args.lastName, "Last name");
    const name = composeDisplayName(firstName, lastName);
    await ctx.db.patch(user._id, {
      firstName,
      lastName,
      name,
      updatedAt: Date.now(),
    });
    return { firstName, lastName, name };
  },
});

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
