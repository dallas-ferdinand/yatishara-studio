import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  nextCreditBalanceHigh,
} from "./creditBalanceHigh";
import { settleOutstandingStorage } from "./storageBilling";
import { addCalendarMonths, type StudioPlanInterval } from "./studioPlans";

export async function hasTopUpForPayment(
  ctx: MutationCtx | QueryCtx,
  paymentId: Id<"payments">,
) {
  const existingTx = await ctx.db
    .query("creditTransactions")
    .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
    .collect();
  return existingTx.some((tx) => tx.kind === "top_up" || tx.kind === "subscription_grant");
}

export async function grantCredits(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    amount: number;
    paymentId?: Id<"payments">;
    reason: string;
    adminId?: Id<"users">;
    kind?: "top_up" | "subscription_grant" | "admin_adjustment";
  },
) {
  if (!Number.isSafeInteger(args.amount) || args.amount === 0) {
    throw new Error("Credit amount must be a non-zero integer");
  }
  if (args.paymentId && args.amount < 0) {
    throw new Error("Payment credit grants must be positive");
  }
  if (args.paymentId) {
    const alreadyGranted = await hasTopUpForPayment(ctx, args.paymentId);
    if (alreadyGranted) {
      return;
    }
  }
  const now = Date.now();
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();
  const accountId =
    existing?._id ??
    (await ctx.db.insert("billingAccounts", {
      userId: args.userId,
      creditBalance: 0,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    }));
  const account = existing ?? (await ctx.db.get("billingAccounts", accountId));
  if (!account) {
    throw new Error("Billing account not found");
  }
  const balanceAfter = account.creditBalance + args.amount;
  if (balanceAfter < 0) {
    throw new Error("Credit adjustment cannot make the balance negative");
  }
  const patch: {
    creditBalance: number;
    updatedAt: number;
    creditBalanceHigh?: number;
  } = {
    creditBalance: balanceAfter,
    updatedAt: now,
  };
  if (args.amount > 0) {
    patch.creditBalanceHigh = nextCreditBalanceHigh({
      previousHigh: account.creditBalanceHigh,
      balanceAfter,
      mode: "reset",
    });
  }
  await ctx.db.patch(accountId, patch);
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    billingAccountId: accountId,
    kind: args.kind ?? (args.paymentId ? "top_up" : "admin_adjustment"),
    amount: args.amount,
    balanceAfter,
    paymentId: args.paymentId,
    reason: args.reason,
    adminId: args.adminId,
    createdAt: now,
  });
  if (args.amount > 0) {
    await settleOutstandingStorage(ctx, args.userId);
  }
}

async function linkActiveSubscription(
  ctx: MutationCtx,
  userId: Id<"users">,
  subscriptionId: Id<"subscriptions">,
  now: number,
) {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (account) {
    await ctx.db.patch(account._id, {
      activeSubscriptionId: subscriptionId,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("billingAccounts", {
    userId,
    creditBalance: 0,
    reservedCredits: 0,
    activeSubscriptionId: subscriptionId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function activateSubscriptionFromPaidPayment(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  now: number,
): Promise<Id<"subscriptions"> | null> {
  if (!payment.subscriptionPlanId || !payment.billingInterval) return null;
  const plan = await ctx.db.get(payment.subscriptionPlanId);
  if (!plan) return null;
  const interval: StudioPlanInterval = payment.billingInterval;
  const periodEnd = addCalendarMonths(now, 1);
  const termEnd = interval === "year" ? addCalendarMonths(now, 12) : periodEnd;
  const existingActive = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", payment.userId).eq("status", "active"),
    )
    .first();
  const existingPastDue = existingActive
    ? null
    : await ctx.db
        .query("subscriptions")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", payment.userId).eq("status", "past_due"),
        )
        .first();
  const existing = existingActive ?? existingPastDue;
  const patch = {
    planId: plan._id,
    status: "active" as const,
    interval,
    customerReference: String(payment.userId),
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    termEnd,
    monthsGrantedThisTerm: 1,
    lastGrantAt: now,
    pastDueSince: undefined,
    sourcePaymentId: payment._id,
    updatedAt: now,
  };
  const subscriptionId =
    existing?._id ??
    (await ctx.db.insert("subscriptions", {
      userId: payment.userId,
      createdAt: now,
      ...patch,
    }));
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  }
  await linkActiveSubscription(ctx, payment.userId, subscriptionId, now);
  return subscriptionId;
}
