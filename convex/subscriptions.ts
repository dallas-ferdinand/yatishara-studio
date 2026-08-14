import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { authedMutation } from "./lib/customFunctions";
import {
  activateSubscriptionFromPaidPayment,
  grantCredits,
} from "./lib/studioBillingCore";
import {
  SUBSCRIPTION_DUNNING_MS,
  addCalendarMonths,
  quoteStudioPlan,
  type StudioPlanInterval,
} from "./lib/studioPlans";

export const recordPaymentMethod = internalMutation({
  args: {
    customerReference: v.string(),
    paymentMethodId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.customerReference);
    if (!userId) return null;
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const live = rows.find(
      (row) => row.status === "active" || row.status === "past_due",
    );
    if (!live) return null;
    await ctx.db.patch(live._id, {
      wamPaymentMethodId: args.paymentMethodId,
      customerReference: args.customerReference,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getForWamEnsure = internalQuery({
  args: {
    customerReference: v.string(),
  },
  returns: v.union(
    v.object({
      subscriptionId: v.id("subscriptions"),
      userId: v.id("users"),
      planId: v.id("subscriptionPlans"),
      planName: v.string(),
      interval: v.union(v.literal("month"), v.literal("year")),
      chargeCents: v.number(),
      wamSubscriptionId: v.optional(v.string()),
      wamPaymentMethodId: v.optional(v.string()),
      customerEmail: v.optional(v.string()),
      customerName: v.string(),
      currentPeriodEnd: v.number(),
      termEnd: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.customerReference);
    if (!userId) return null;
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const live = rows.find(
      (row) => row.status === "active" || row.status === "past_due",
    );
    if (!live || live.wamSubscriptionId) return null;
    if (live.cancelAtPeriodEnd) return null;
    if (!live.interval) return null;
    const plan = await ctx.db.get(live.planId);
    const user = await ctx.db.get(userId);
    if (!plan || !user) return null;
    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const quote = quoteStudioPlan(
      {
        faceMonthlyCents: plan.originalMonthlyPriceCents ?? plan.monthlyPriceCents,
        monthlyDiscountPercent: plan.discountPercent ?? 0,
        annualDiscountPercent: plan.annualDiscountPercent ?? 0,
      },
      live.interval,
      pricing?.creditPriceCents ?? 50,
    );
    return {
      subscriptionId: live._id,
      userId,
      planId: plan._id,
      planName: plan.name,
      interval: live.interval,
      chargeCents: quote.chargeCents,
      wamSubscriptionId: live.wamSubscriptionId,
      wamPaymentMethodId: live.wamPaymentMethodId,
      customerEmail: user.email,
      customerName:
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.name ||
        "Studio customer",
      currentPeriodEnd: live.currentPeriodEnd,
      termEnd: live.termEnd,
    };
  },
});

export const attachWamSubscription = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    wamSubscriptionId: v.string(),
    wamPaymentMethodId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscriptionId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      wamSubscriptionId: args.wamSubscriptionId,
      wamPaymentMethodId: args.wamPaymentMethodId ?? row.wamPaymentMethodId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function findByWamSubscription(
  ctx: MutationCtx,
  wamSubscriptionId: string,
) {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_wam_subscription", (q) =>
      q.eq("wamSubscriptionId", wamSubscriptionId),
    )
    .unique();
}

async function upsertSubscriptionInvoice(
  ctx: MutationCtx,
  args: {
    subscription: Doc<"subscriptions">;
    amountCents: number;
    creditsGranted: number;
    clientRequestId: string;
    externalPaymentId?: string;
    status: "pending" | "payment_completed" | "rejected";
    reference: string;
  },
): Promise<Id<"payments">> {
  const existing = await ctx.db
    .query("payments")
    .withIndex("by_client_request", (q) => q.eq("clientRequestId", args.clientRequestId))
    .unique();
  const now = Date.now();
  if (existing) {
    if (existing.status !== "payment_completed") {
      await ctx.db.patch(existing._id, {
        status: args.status,
        amountCents: args.amountCents,
        creditsGranted: args.creditsGranted,
        externalPaymentId: args.externalPaymentId ?? existing.externalPaymentId,
        reference: args.reference,
        updatedAt: now,
      });
    }
    return existing._id;
  }
  return await ctx.db.insert("payments", {
    userId: args.subscription.userId,
    method: "wam",
    status: args.status,
    amountCents: args.amountCents,
    creditsGranted: args.creditsGranted,
    subscriptionPlanId: args.subscription.planId,
    billingInterval: args.subscription.interval,
    clientRequestId: args.clientRequestId,
    externalPaymentId: args.externalPaymentId,
    reference: args.reference,
    createdAt: now,
    updatedAt: now,
  });
}

export const applyWamEvent = internalMutation({
  args: {
    type: v.string(),
    subscriptionId: v.string(),
    customerReference: v.string(),
    amountCents: v.number(),
    interval: v.optional(v.union(v.literal("month"), v.literal("year"))),
    nextBillingDate: v.optional(v.string()),
    paymentAttemptId: v.optional(v.string()),
    success: v.optional(v.boolean()),
  },
  returns: v.object({
    granted: v.boolean(),
    cancelled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const live = await findByWamSubscription(ctx, args.subscriptionId);
    if (!live) {
      return { granted: false, cancelled: false };
    }
    const plan = await ctx.db.get(live.planId);
    if (!plan) return { granted: false, cancelled: false };

    if (args.type === "subscription.cancelled" || args.type === "subscription.completed") {
      await ctx.db.patch(live._id, {
        status: "cancelled",
        pastDueSince: undefined,
        updatedAt: now,
      });
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", live.userId))
        .unique();
      if (account?.activeSubscriptionId === live._id) {
        await ctx.db.patch(account._id, {
          activeSubscriptionId: undefined,
          updatedAt: now,
        });
      }
      return { granted: false, cancelled: true };
    }

    if (args.type === "subscription.payment.failed") {
      const periodKey = `${live.wamSubscriptionId}:${live.currentPeriodEnd}`;
      await upsertSubscriptionInvoice(ctx, {
        subscription: live,
        amountCents: args.amountCents || plan.monthlyPriceCents,
        creditsGranted: plan.includedMonthlyCredits,
        clientRequestId: `sub-fail:${periodKey}`,
        externalPaymentId: args.paymentAttemptId,
        status: "pending",
        reference: `${plan.name} renewal unpaid`,
      });
      await ctx.db.patch(live._id, {
        status: "past_due",
        pastDueSince: live.pastDueSince ?? now,
        updatedAt: now,
      });
      return { granted: false, cancelled: false };
    }

    if (args.type !== "subscription.payment.succeeded") {
      return { granted: false, cancelled: false };
    }

    const interval: StudioPlanInterval = live.interval ?? args.interval ?? "month";
    const periodKey = `${args.subscriptionId}:${args.paymentAttemptId || args.nextBillingDate || now}`;
    const paymentId = await upsertSubscriptionInvoice(ctx, {
      subscription: live,
      amountCents: args.amountCents,
      creditsGranted: plan.includedMonthlyCredits,
      clientRequestId: `sub-paid:${periodKey}`,
      externalPaymentId: args.paymentAttemptId,
      status: "payment_completed",
      reference: `${plan.name} ${interval === "year" ? "annual" : "monthly"}`,
    });
    const already = await ctx.db
      .query("creditTransactions")
      .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
      .collect();
    const grantedAlready = already.some(
      (tx) => tx.kind === "subscription_grant" || tx.kind === "top_up",
    );
    const grantedThisPeriod =
      grantedAlready ||
      (typeof live.lastGrantAt === "number" && now - live.lastGrantAt < 2 * 24 * 60 * 60 * 1000);
    if (!grantedThisPeriod) {
      await grantCredits(ctx, {
        userId: live.userId,
        amount: plan.includedMonthlyCredits,
        paymentId,
        reason: `${plan.name} subscription renewal`,
        kind: "subscription_grant",
      });
    }
    const periodEnd = addCalendarMonths(now, 1);
    const termEnd =
      interval === "year" ? addCalendarMonths(now, 12) : periodEnd;
    await ctx.db.patch(live._id, {
      status: "active",
      interval,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      termEnd,
      monthsGrantedThisTerm: 1,
      lastGrantAt: now,
      pastDueSince: undefined,
      updatedAt: now,
    });
    await activateSubscriptionFromPaidPayment(
      ctx,
      {
        ...(await ctx.db.get(paymentId))!,
        billingInterval: interval,
        subscriptionPlanId: plan._id,
      },
      now,
    );
    return { granted: !grantedThisPeriod, cancelled: false };
  },
});

export const grantDueAnnualCredits = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ granted: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "active").lte("currentPeriodEnd", now),
      )
      .take(80);
    let granted = 0;
    for (const live of rows) {
      if (live.interval !== "year") continue;
      const monthsGranted = live.monthsGrantedThisTerm ?? 0;
      if (monthsGranted >= 12) continue;
      const plan = await ctx.db.get(live.planId);
      if (!plan) continue;
      await grantCredits(ctx, {
        userId: live.userId,
        amount: plan.includedMonthlyCredits,
        reason: `${plan.name} monthly balance`,
        kind: "subscription_grant",
      });
      const nextPeriodEnd = addCalendarMonths(live.currentPeriodEnd, 1);
      await ctx.db.patch(live._id, {
        monthsGrantedThisTerm: monthsGranted + 1,
        lastGrantAt: now,
        currentPeriodStart: live.currentPeriodEnd,
        currentPeriodEnd: nextPeriodEnd,
        updatedAt: now,
      });
      granted += 1;
    }
    return { granted };
  },
});

export const cancelUnpaidSubscriptions = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    cancelled: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_past_due", (q) => q.eq("status", "past_due"))
      .take(80);
    const cancelled: string[] = [];
    for (const live of rows) {
      if (!live.pastDueSince || now - live.pastDueSince < SUBSCRIPTION_DUNNING_MS) {
        continue;
      }
      await ctx.db.patch(live._id, {
        status: "cancelled",
        updatedAt: now,
      });
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", live.userId))
        .unique();
      if (account?.activeSubscriptionId === live._id) {
        await ctx.db.patch(account._id, {
          activeSubscriptionId: undefined,
          updatedAt: now,
        });
      }
      if (live.wamSubscriptionId) cancelled.push(live.wamSubscriptionId);
    }
    const dueCancels = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "active").lte("currentPeriodEnd", now),
      )
      .take(80);
    for (const live of dueCancels) {
      if (!live.cancelAtPeriodEnd) continue;
      await ctx.db.patch(live._id, {
        status: "cancelled",
        cancelAtPeriodEnd: false,
        updatedAt: now,
      });
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", live.userId))
        .unique();
      if (account?.activeSubscriptionId === live._id) {
        await ctx.db.patch(account._id, {
          activeSubscriptionId: undefined,
          updatedAt: now,
        });
      }
    }
    return { cancelled };
  },
});

async function liveSubscriptionForUser(ctx: MutationCtx, userId: Id<"users">) {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const byId = account?.activeSubscriptionId
    ? await ctx.db.get(account.activeSubscriptionId)
    : null;
  if (byId && (byId.status === "active" || byId.status === "past_due")) {
    return byId;
  }
  return (
    (await ctx.db
      .query("subscriptions")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .first()) ??
    (await ctx.db
      .query("subscriptions")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "past_due"),
      )
      .first())
  );
}

export const cancelMyPlan = authedMutation({
  args: {},
  returns: v.object({
    mode: v.union(v.literal("immediate"), v.literal("period_end")),
    wamSubscriptionId: v.optional(v.string()),
    accessUntil: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const live = await liveSubscriptionForUser(ctx, ctx.user._id);
    if (!live) {
      throw new Error("No plan to cancel.");
    }
    const now = Date.now();
    const unpaid =
      live.status === "past_due" || now >= live.currentPeriodEnd;
    if (unpaid) {
      await ctx.db.patch(live._id, {
        status: "cancelled",
        cancelAtPeriodEnd: false,
        cancelScheduledAt: undefined,
        pastDueSince: undefined,
        wamSubscriptionId: undefined,
        updatedAt: now,
      });
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
        .unique();
      if (account?.activeSubscriptionId === live._id) {
        await ctx.db.patch(account._id, {
          activeSubscriptionId: undefined,
          updatedAt: now,
        });
      }
      return {
        mode: "immediate" as const,
        wamSubscriptionId: live.wamSubscriptionId,
      };
    }
    const wamSubscriptionId = live.wamSubscriptionId;
    await ctx.db.patch(live._id, {
      cancelAtPeriodEnd: true,
      cancelScheduledAt: live.currentPeriodEnd,
      wamSubscriptionId: undefined,
      updatedAt: now,
    });
    return {
      mode: "period_end" as const,
      wamSubscriptionId,
      accessUntil: live.currentPeriodEnd,
    };
  },
});

export const resumeMyPlan = authedMutation({
  args: {},
  returns: v.object({
    wamSubscriptionId: v.optional(v.string()),
    needsWamResume: v.boolean(),
  }),
  handler: async (ctx) => {
    const live = await liveSubscriptionForUser(ctx, ctx.user._id);
    if (!live) {
      throw new Error("No plan to resume.");
    }
    if (!live.cancelAtPeriodEnd) {
      throw new Error("This plan is not scheduled to cancel.");
    }
    if (Date.now() >= live.currentPeriodEnd) {
      throw new Error("The plan already ended. Start a new subscription.");
    }
    await ctx.db.patch(live._id, {
      cancelAtPeriodEnd: false,
      cancelScheduledAt: undefined,
      updatedAt: Date.now(),
    });
    return {
      wamSubscriptionId: live.wamSubscriptionId,
      needsWamResume: !live.wamSubscriptionId,
    };
  },
});

/** QA/ops: immediately drop a live plan so the user can subscribe again. */
export const internalForceCancelByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.object({
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    previousStatus: v.string(),
    wamSubscriptionId: v.optional(v.string()),
    alreadyCancelled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new Error("Invalid email");
    }
    const user =
      (await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique()) ??
      (email === args.email.trim()
        ? null
        : await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", args.email.trim()))
            .unique());
    if (!user) {
      throw new Error(`No user found for ${email}`);
    }
    const now = Date.now();
    const live = await liveSubscriptionForUser(ctx, user._id);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.name ||
      email;
    if (!live) {
      if (account?.activeSubscriptionId) {
        await ctx.db.patch(account._id, {
          activeSubscriptionId: undefined,
          updatedAt: now,
        });
      }
      return {
        userId: user._id,
        name,
        email,
        previousStatus: "none",
        alreadyCancelled: true,
      };
    }
    const wamSubscriptionId = live.wamSubscriptionId;
    await ctx.db.patch(live._id, {
      status: "cancelled",
      cancelAtPeriodEnd: false,
      cancelScheduledAt: undefined,
      pastDueSince: undefined,
      wamSubscriptionId: undefined,
      updatedAt: now,
    });
    if (account?.activeSubscriptionId === live._id) {
      await ctx.db.patch(account._id, {
        activeSubscriptionId: undefined,
        updatedAt: now,
      });
    }
    return {
      userId: user._id,
      name,
      email,
      previousStatus: live.status,
      wamSubscriptionId,
      alreadyCancelled: false,
    };
  },
});
