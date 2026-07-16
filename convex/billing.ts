import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { signBunnyCdnUrl } from "./lib/bunny";
import { adminMutation, adminQuery, authedQuery } from "./lib/customFunctions";
import {
  IMAGE_CREDITS_BY_RESOLUTION,
  IMAGE_REFERENCE_SURCHARGE,
  PLATFORM_OVERHEAD_CREDITS_MEDIA,
  PLATFORM_OVERHEAD_CREDITS_TEXT,
  imageCreditCost,
  textCreditCost,
  videoCreditCost,
} from "./lib/generationPricing";
import { PAYWISE_CURRENCY } from "./lib/paywise";

const paymentMethod = v.union(v.literal("bank"), v.literal("card"), v.literal("paywise"));

const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("needs_review"),
  v.literal("checkout_failed"),
  v.literal("cancelled"),
  v.literal("receipt_uploaded"),
  v.literal("receipt_received"),
  v.literal("payment_completed"),
  v.literal("rejected"),
);

const sendPushForNotificationRef = makeFunctionReference<
  "action",
  { notificationId: Id<"notifications"> },
  number
>("notificationsActions:sendPushForNotification") as unknown as FunctionReference<
  "action",
  "internal",
  { notificationId: Id<"notifications"> },
  number
>;

const settlePaywiseCallbackRef = makeFunctionReference<
  "action",
  { paymentId: Id<"payments"> },
  { ok: boolean }
>("paywiseActions:settleFromCallback") as unknown as FunctionReference<
  "action",
  "internal",
  { paymentId: Id<"payments"> },
  { ok: boolean }
>;

const pricingReturn = v.object({
  creditPriceCents: v.number(),
  imageCredits1K: v.number(),
  imageCredits2K: v.number(),
  imageCredits4K: v.number(),
  imageReferenceSurcharge: v.number(),
  videoCredits480p: v.number(),
  videoCredits720p: v.number(),
  videoCredits1080p: v.number(),
  klingVideoCredits720p: v.number(),
  klingVideoCredits1080p: v.number(),
  platformOverheadCreditsMedia: v.number(),
  platformOverheadCreditsText: v.number(),
  textCredits: v.number(),
});

const creditPriceCents = 50;
/** Must match `TOP_UP_TIER_CREDITS[0]` in src/studio/lib/money.ts (Starter TT$50). */
const TOP_UP_MIN_CREDITS = 100;
const PAYWISE_INITIAL_CHECK_DELAY_MS = 30_000;
const PAYWISE_MAX_STATUS_CHECKS = 48;
const PAYWISE_REVIEW_CHECK_DELAY_MS = 24 * 60 * 60 * 1000;
const PAYWISE_RECONCILIATION_LEASE_MS = 90_000;

const paymentReturnFields = {
  _id: v.id("payments"),
  _creationTime: v.number(),
  userId: v.id("users"),
  method: paymentMethod,
  status: paymentStatus,
  amountCents: v.number(),
  creditsGranted: v.optional(v.number()),
  subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
  bankAccountId: v.optional(v.id("bankAccounts")),
  externalPaymentId: v.optional(v.string()),
  clientRequestId: v.optional(v.string()),
  checkoutUrl: v.optional(v.string()),
  providerRequestId: v.optional(v.string()),
  providerStatus: v.optional(v.string()),
  lastStatusCheckedAt: v.optional(v.number()),
  nextStatusCheckAt: v.optional(v.number()),
  statusCheckAttempts: v.optional(v.number()),
  reference: v.optional(v.string()),
  rejectionReason: v.optional(v.string()),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

const subscriptionPlanReturn = v.object({
  _id: v.id("subscriptionPlans"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  monthlyPriceCents: v.number(),
  originalMonthlyPriceCents: v.optional(v.number()),
  discountPercent: v.optional(v.number()),
  includedMonthlyCredits: v.number(),
  topUpCreditPriceCents: v.number(),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const getPricing = authedQuery({
  args: {},
  returns: pricingReturn,
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    return {
      creditPriceCents: settings?.creditPriceCents ?? creditPriceCents,
      imageCredits1K: imageCreditCost({ resolution: "1K", quality: "medium" }),
      imageCredits2K: imageCreditCost({ resolution: "2K", quality: "medium" }),
      imageCredits4K: imageCreditCost({ resolution: "4K", quality: "medium" }),
      imageReferenceSurcharge: IMAGE_REFERENCE_SURCHARGE,
      videoCredits480p: videoCreditCost({
        resolution: "854x480",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
      }),
      videoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
      }),
      videoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
      }),
      klingVideoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "kling-3.0-i2v",
        audioEnabled: false,
      }),
      klingVideoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "kling-3.0-i2v",
        audioEnabled: false,
      }),
      platformOverheadCreditsMedia: PLATFORM_OVERHEAD_CREDITS_MEDIA,
      platformOverheadCreditsText: PLATFORM_OVERHEAD_CREDITS_TEXT,
      textCredits: textCreditCost({}),
    };
  },
});

export const currentAccount = authedQuery({
  args: {},
  returns: v.object({
    creditBalance: v.number(),
    reservedCredits: v.number(),
    subscription: v.union(
      v.object({
        status: v.union(
          v.literal("active"),
          v.literal("past_due"),
          v.literal("cancelled"),
          v.literal("expired"),
        ),
        currentPeriodStart: v.number(),
        currentPeriodEnd: v.number(),
        planName: v.optional(v.string()),
        includedMonthlyCredits: v.optional(v.number()),
        monthlyPriceCents: v.optional(v.number()),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const subscription = account?.activeSubscriptionId
      ? await ctx.db.get(account.activeSubscriptionId)
      : await ctx.db
          .query("subscriptions")
          .withIndex("by_user_and_status", (q) => q.eq("userId", ctx.user._id).eq("status", "active"))
          .first();
    const plan = subscription ? await ctx.db.get(subscription.planId) : null;
    return {
      creditBalance: account?.creditBalance ?? 0,
      reservedCredits: account?.reservedCredits ?? 0,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            planName: plan?.name,
            includedMonthlyCredits: plan?.includedMonthlyCredits,
            monthlyPriceCents: plan?.monthlyPriceCents,
          }
        : null,
    };
  },
});

export const listMyPayments = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      ...paymentReturnFields,
      receiptUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(50);
    return await withReceiptUrls(ctx, payments);
  },
});

export const listSubscriptionPlans = query({
  args: {},
  returns: v.array(subscriptionPlanReturn),
  handler: async (ctx) => {
    return await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .take(20);
  },
});

export const getMyPayment = authedQuery({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.union(
    v.object({
      ...paymentReturnFields,
      receiptUrl: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== ctx.user._id) {
      return null;
    }
    const [withUrl] = await withReceiptUrls(ctx, [payment]);
    return withUrl ?? null;
  },
});

function validateTopUpAmount(
  amountCents: number,
  creditsRequested: number | undefined,
  unitPriceCents: number,
): { amountCents: number; creditsGranted: number } {
  const minAmountCents = TOP_UP_MIN_CREDITS * unitPriceCents;
  if (!Number.isSafeInteger(amountCents) || amountCents < minAmountCents) {
    throw new Error(`Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`);
  }
  const creditsFromAmount = Math.floor(amountCents / unitPriceCents);
  if (creditsFromAmount < TOP_UP_MIN_CREDITS) {
    throw new Error(`Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`);
  }
  const creditsGranted = creditsRequested ?? creditsFromAmount;
  if (!Number.isSafeInteger(creditsGranted) || creditsGranted <= 0) {
    throw new Error("Invalid credit amount");
  }
  if (creditsGranted > creditsFromAmount) {
    throw new Error("Requested credits exceed the amount paid");
  }
  return {
    amountCents,
    creditsGranted,
  };
}

function randomCallbackToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getCheckoutUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      phoneVerifiedAt: v.optional(v.number()),
      role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      role: user.role,
    };
  },
});

export const preparePaywiseCheckout = internalMutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.string(),
    amountCents: v.number(),
    creditsRequested: v.optional(v.number()),
    reference: v.optional(v.string()),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    amountCents: v.number(),
    creditsGranted: v.number(),
    callbackToken: v.string(),
    checkoutUrl: v.optional(v.string()),
    externalPaymentId: v.optional(v.string()),
    status: paymentStatus,
    alreadyReady: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const clientRequestId = args.clientRequestId.trim();
    if (!clientRequestId || clientRequestId.length > 128) {
      throw new Error("Invalid checkout request id");
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_client_request", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (existing) {
      if (existing.userId !== args.userId) {
        throw new Error("Checkout request already used");
      }
      if (existing.status === "checkout_failed") {
        throw new Error("This checkout attempt failed. Start a new top-up.");
      }
      if (
        existing.amountCents !== args.amountCents ||
        (args.creditsRequested !== undefined &&
          existing.creditsGranted !== args.creditsRequested)
      ) {
        throw new Error("Checkout request id was already used for a different top-up.");
      }
      if (!existing.callbackToken) {
        throw new Error("Existing checkout is missing its callback token.");
      }
      return {
        paymentId: existing._id,
        amountCents: existing.amountCents,
        creditsGranted: existing.creditsGranted ?? 0,
        callbackToken: existing.callbackToken,
        checkoutUrl: existing.checkoutUrl,
        externalPaymentId: existing.externalPaymentId,
        status: existing.status,
        alreadyReady: Boolean(existing.checkoutUrl && existing.externalPaymentId),
      };
    }

    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const unitPriceCents = pricing?.creditPriceCents ?? creditPriceCents;
    const { amountCents, creditsGranted } = validateTopUpAmount(
      args.amountCents,
      args.creditsRequested,
      unitPriceCents,
    );
    const now = Date.now();
    const callbackToken = randomCallbackToken();
    const paymentId = await ctx.db.insert("payments", {
      userId: args.userId,
      method: "paywise",
      status: "pending",
      amountCents,
      creditsGranted,
      clientRequestId,
      callbackToken,
      reference: args.reference,
      statusCheckAttempts: 0,
      nextStatusCheckAt: now + PAYWISE_INITIAL_CHECK_DELAY_MS,
      createdAt: now,
      updatedAt: now,
    });
    return {
      paymentId,
      amountCents,
      creditsGranted,
      callbackToken,
      checkoutUrl: undefined,
      externalPaymentId: undefined,
      status: "pending" as const,
      alreadyReady: false,
    };
  },
});

export const attachPaywiseCheckout = internalMutation({
  args: {
    paymentId: v.id("payments"),
    externalPaymentId: v.string(),
    checkoutUrl: v.string(),
    providerRequestId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.method !== "paywise") {
      throw new Error("Payment not found");
    }
    if (payment.status !== "pending") {
      return null;
    }
    const linked = await ctx.db
      .query("payments")
      .withIndex("by_external_payment", (q) => q.eq("externalPaymentId", args.externalPaymentId))
      .unique();
    if (linked && linked._id !== payment._id) {
      throw new Error("PayWise payment id is already linked to another checkout");
    }
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      externalPaymentId: args.externalPaymentId,
      checkoutUrl: args.checkoutUrl,
      providerRequestId: args.providerRequestId,
      providerStatus: args.providerStatus,
      nextStatusCheckAt: now + PAYWISE_INITIAL_CHECK_DELAY_MS,
      updatedAt: now,
    });
    return null;
  },
});

export const markPaywiseCheckoutFailed = internalMutation({
  args: {
    paymentId: v.id("payments"),
    reason: v.string(),
    providerRequestId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.method !== "paywise") {
      throw new Error("Payment not found");
    }
    if (payment.status !== "pending" || payment.externalPaymentId) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "checkout_failed",
      rejectionReason: args.reason.slice(0, 500),
      providerRequestId: args.providerRequestId ?? payment.providerRequestId,
      nextStatusCheckAt: undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const getPaywisePaymentInternal = internalQuery({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("payments"),
      userId: v.id("users"),
      method: paymentMethod,
      status: paymentStatus,
      amountCents: v.number(),
      creditsGranted: v.optional(v.number()),
      externalPaymentId: v.optional(v.string()),
      checkoutUrl: v.optional(v.string()),
      providerStatus: v.optional(v.string()),
      statusCheckAttempts: v.optional(v.number()),
      nextStatusCheckAt: v.optional(v.number()),
      lastStatusCheckedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    return {
      _id: payment._id,
      userId: payment.userId,
      method: payment.method,
      status: payment.status,
      amountCents: payment.amountCents,
      creditsGranted: payment.creditsGranted,
      externalPaymentId: payment.externalPaymentId,
      checkoutUrl: payment.checkoutUrl,
      providerStatus: payment.providerStatus,
      statusCheckAttempts: payment.statusCheckAttempts,
      nextStatusCheckAt: payment.nextStatusCheckAt,
      lastStatusCheckedAt: payment.lastStatusCheckedAt,
    };
  },
});

export const getPaywisePaymentForUser = internalQuery({
  args: {
    paymentId: v.id("payments"),
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("payments"),
      userId: v.id("users"),
      method: paymentMethod,
      status: paymentStatus,
      amountCents: v.number(),
      creditsGranted: v.optional(v.number()),
      externalPaymentId: v.optional(v.string()),
      checkoutUrl: v.optional(v.string()),
      lastStatusCheckedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== args.userId) return null;
    return {
      _id: payment._id,
      userId: payment.userId,
      method: payment.method,
      status: payment.status,
      amountCents: payment.amountCents,
      creditsGranted: payment.creditsGranted,
      externalPaymentId: payment.externalPaymentId,
      checkoutUrl: payment.checkoutUrl,
      lastStatusCheckedAt: payment.lastStatusCheckedAt,
    };
  },
});

export const claimDuePaywisePayments = internalMutation({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("payments"),
      externalPaymentId: v.string(),
      statusCheckAttempts: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit, 50));
    const pending = await ctx.db
      .query("payments")
      .withIndex("by_method_status_and_next_check", (q) =>
        q.eq("method", "paywise").eq("status", "pending").lte("nextStatusCheckAt", args.now),
      )
      .take(limit);
    const review =
      pending.length < limit
        ? await ctx.db
            .query("payments")
            .withIndex("by_method_status_and_next_check", (q) =>
              q
                .eq("method", "paywise")
                .eq("status", "needs_review")
                .lte("nextStatusCheckAt", args.now),
            )
            .take(limit - pending.length)
        : [];
    const claimed = [...pending, ...review].filter(
      (payment) =>
        Boolean(payment.externalPaymentId) &&
        (!payment.reconciliationLeaseUntil || payment.reconciliationLeaseUntil <= args.now),
    );
    const leaseUntil = args.now + PAYWISE_RECONCILIATION_LEASE_MS;
    for (const payment of claimed) {
      await ctx.db.patch(payment._id, {
        reconciliationLeaseUntil: leaseUntil,
        nextStatusCheckAt: leaseUntil,
        updatedAt: args.now,
      });
    }
    return claimed.map((payment) => ({
        _id: payment._id,
        externalPaymentId: payment.externalPaymentId!,
        statusCheckAttempts: payment.statusCheckAttempts ?? 0,
      }));
  },
});

export const recordPaywiseStatusCheckFailure = internalMutation({
  args: {
    paymentId: v.id("payments"),
    expectedExternalPaymentId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (
      !payment ||
      payment.method !== "paywise" ||
      payment.externalPaymentId !== args.expectedExternalPaymentId ||
      (payment.status !== "pending" && payment.status !== "needs_review")
    ) {
      return null;
    }
    const now = Date.now();
    const attempts = (payment.statusCheckAttempts ?? 0) + 1;
    const exhausted = attempts >= PAYWISE_MAX_STATUS_CHECKS;
    const nextDelay = exhausted
      ? PAYWISE_REVIEW_CHECK_DELAY_MS
      : Math.min(60 * 60 * 1000, PAYWISE_INITIAL_CHECK_DELAY_MS * 2 ** Math.min(attempts, 6));
    await ctx.db.patch(payment._id, {
      status: exhausted ? "needs_review" : payment.status,
      statusCheckAttempts: attempts,
      lastStatusCheckedAt: now,
      nextStatusCheckAt: now + nextDelay,
      reconciliationLeaseUntil: undefined,
      rejectionReason: exhausted
        ? "Automatic PayWise verification needs review"
        : args.reason.slice(0, 500),
      updatedAt: now,
    });
    return null;
  },
});

function callbackTokensMatch(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return mismatch === 0;
}

export const enqueuePaywiseCallback = internalMutation({
  args: {
    paymentId: v.string(),
    token: v.string(),
    endpoint: v.union(v.literal("notify"), v.literal("callback")),
    method: v.string(),
    requestId: v.optional(v.string()),
    bodySha256: v.optional(v.string()),
    receivedAt: v.number(),
  },
  returns: v.object({
    accepted: v.boolean(),
    paymentId: v.optional(v.id("payments")),
  }),
  handler: async (ctx, args) => {
    const paymentId = ctx.db.normalizeId("payments", args.paymentId);
    if (!paymentId) return { accepted: false };
    const payment = await ctx.db.get(paymentId);
    if (!payment || payment.method !== "paywise") return { accepted: false };
    const accepted = Boolean(
      payment.callbackToken && callbackTokensMatch(payment.callbackToken, args.token),
    );
    await ctx.db.insert("paywiseCallbackEvents", {
      paymentId,
      endpoint: args.endpoint,
      method: args.method.slice(0, 20),
      requestId: args.requestId?.slice(0, 200),
      bodySha256: args.bodySha256,
      accepted,
      failureReason: accepted ? undefined : "invalid_callback_token",
      receivedAt: args.receivedAt,
    });
    if (!accepted) return { accepted: false, paymentId };
    await ctx.scheduler.runAfter(0, settlePaywiseCallbackRef, { paymentId });
    return { accepted: true, paymentId };
  },
});

export const applyPaywiseStatusCheck = internalMutation({
  args: {
    paymentId: v.id("payments"),
    expectedExternalPaymentId: v.string(),
    providerPaymentDetailsId: v.string(),
    providerStatus: v.string(),
    normalizedStatus: v.union(
      v.literal("paid"),
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("cancelled"),
      v.literal("unknown"),
    ),
    providerAmountCents: v.number(),
    providerCurrency: v.string(),
    providerRequestId: v.optional(v.string()),
  },
  returns: v.object({
    status: paymentStatus,
    granted: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    status:
      | "pending"
      | "needs_review"
      | "checkout_failed"
      | "cancelled"
      | "receipt_uploaded"
      | "receipt_received"
      | "payment_completed"
      | "rejected";
    granted: boolean;
    reason?: string;
  }> => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.method !== "paywise") {
      throw new Error("Payment not found");
    }
    const now = Date.now();
    if (payment.status === "payment_completed") {
      return { status: payment.status, granted: false, reason: "already_completed" };
    }
    if (payment.status === "checkout_failed") {
      return { status: payment.status, granted: false, reason: "already_terminal" };
    }
    if (payment.externalPaymentId !== args.expectedExternalPaymentId) {
      throw new Error("PayWise payment id mismatch");
    }
    if (args.providerPaymentDetailsId !== payment.externalPaymentId) {
      throw new Error("PayWise status response payment id mismatch");
    }

    const attempts = (payment.statusCheckAttempts ?? 0) + 1;
    const providerStatus = args.providerStatus.slice(0, 120);
    const basePatch = {
      providerStatus,
      providerRequestId: args.providerRequestId ?? payment.providerRequestId,
      lastStatusCheckedAt: now,
      statusCheckAttempts: attempts,
      reconciliationLeaseUntil: undefined,
      updatedAt: now,
    };

    if (args.normalizedStatus === "paid") {
      if (args.providerCurrency.toUpperCase() !== PAYWISE_CURRENCY) {
        await ctx.db.patch(payment._id, {
          ...basePatch,
          nextStatusCheckAt: now + PAYWISE_REVIEW_CHECK_DELAY_MS,
          rejectionReason: `Currency mismatch: expected ${PAYWISE_CURRENCY}`,
          status: "needs_review",
        });
        await notifyPaymentStatus(ctx, {
          userId: payment.userId,
          paymentId: payment._id,
          status: "needs_review",
          rejectionReason: `Currency mismatch: expected ${PAYWISE_CURRENCY}`,
        });
        return { status: "needs_review" as const, granted: false, reason: "currency_mismatch" };
      }
      if (args.providerAmountCents !== payment.amountCents) {
        await ctx.db.patch(payment._id, {
          ...basePatch,
          nextStatusCheckAt: now + PAYWISE_REVIEW_CHECK_DELAY_MS,
          rejectionReason: "Paid amount did not match the top-up amount",
          status: "needs_review",
        });
        await notifyPaymentStatus(ctx, {
          userId: payment.userId,
          paymentId: payment._id,
          status: "needs_review",
          rejectionReason: "Paid amount did not match the top-up amount",
        });
        return { status: "needs_review" as const, granted: false, reason: "amount_mismatch" };
      }

      const alreadyGranted = await hasTopUpForPayment(ctx, payment._id);
      if (!alreadyGranted && (!payment.creditsGranted || payment.creditsGranted <= 0)) {
        await ctx.db.patch(payment._id, {
          ...basePatch,
          status: "needs_review",
          nextStatusCheckAt: now + PAYWISE_REVIEW_CHECK_DELAY_MS,
          rejectionReason: "Payment has no valid credit grant amount",
        });
        return { status: "needs_review" as const, granted: false, reason: "invalid_credit_grant" };
      }
      if (!alreadyGranted && payment.creditsGranted) {
        await grantCredits(ctx, {
          userId: payment.userId,
          amount: payment.creditsGranted,
          paymentId: payment._id,
          reason: "PayWise top-up completed",
        });
      }
      await ctx.db.patch(payment._id, {
        ...basePatch,
        status: "payment_completed",
        nextStatusCheckAt: undefined,
        rejectionReason: undefined,
      });
      if (!alreadyGranted) {
        await notifyPaymentStatus(ctx, {
          userId: payment.userId,
          paymentId: payment._id,
          status: "payment_completed",
        });
      }
      return { status: "payment_completed" as const, granted: !alreadyGranted };
    }

    if (args.normalizedStatus === "rejected" || args.normalizedStatus === "cancelled") {
      const status = args.normalizedStatus === "cancelled" ? "cancelled" : "rejected";
      await ctx.db.patch(payment._id, {
        ...basePatch,
        status,
        nextStatusCheckAt: undefined,
        rejectionReason:
          status === "cancelled" ? "Payment was cancelled" : "Payment was declined",
      });
      await notifyPaymentStatus(ctx, {
        userId: payment.userId,
        paymentId: payment._id,
        status,
        rejectionReason:
          status === "cancelled" ? "Payment was cancelled" : "Payment was declined",
      });
      return { status, granted: false };
    }

    if (args.normalizedStatus === "unknown") {
      const nextDelay = Math.min(60 * 60 * 1000, PAYWISE_INITIAL_CHECK_DELAY_MS * 2 ** Math.min(attempts, 6));
      await ctx.db.patch(payment._id, {
        ...basePatch,
        nextStatusCheckAt:
          now + (attempts >= PAYWISE_MAX_STATUS_CHECKS ? PAYWISE_REVIEW_CHECK_DELAY_MS : nextDelay),
        rejectionReason:
          attempts >= PAYWISE_MAX_STATUS_CHECKS
            ? "Unrecognized PayWise status after repeated checks"
            : payment.rejectionReason,
        status: attempts >= PAYWISE_MAX_STATUS_CHECKS ? "needs_review" : payment.status,
      });
      if (attempts >= PAYWISE_MAX_STATUS_CHECKS) {
        await notifyPaymentStatus(ctx, {
          userId: payment.userId,
          paymentId: payment._id,
          status: "needs_review",
          rejectionReason: "Unrecognized PayWise status after repeated checks",
        });
        return { status: "needs_review" as const, granted: false, reason: "unknown_status_timeout" };
      }
      return { status: payment.status, granted: false, reason: "unknown_status" };
    }

    const nextDelay = Math.min(30 * 60 * 1000, PAYWISE_INITIAL_CHECK_DELAY_MS * 2 ** Math.min(attempts - 1, 5));
    await ctx.db.patch(payment._id, {
      ...basePatch,
      nextStatusCheckAt:
        now + (attempts >= PAYWISE_MAX_STATUS_CHECKS ? PAYWISE_REVIEW_CHECK_DELAY_MS : nextDelay),
      status: attempts >= PAYWISE_MAX_STATUS_CHECKS ? "needs_review" : "pending",
      rejectionReason:
        attempts >= PAYWISE_MAX_STATUS_CHECKS
          ? "Payment timed out waiting for PayWise confirmation"
          : payment.rejectionReason,
    });
    if (attempts >= PAYWISE_MAX_STATUS_CHECKS) {
      await notifyPaymentStatus(ctx, {
        userId: payment.userId,
        paymentId: payment._id,
        status: "needs_review",
        rejectionReason: "Payment timed out waiting for PayWise confirmation",
      });
      return { status: "needs_review" as const, granted: false, reason: "timeout" };
    }
    return { status: "pending" as const, granted: false };
  },
});

export const adminListPayments = adminQuery({
  args: {
    status: v.optional(paymentStatus),
  },
  returns: v.array(
    v.object({
      ...paymentReturnFields,
      receiptUrl: v.optional(v.string()),
      customer: v.optional(
        v.object({
          name: v.optional(v.string()),
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
          role: v.union(v.literal("user"), v.literal("admin"), v.literal("super_admin")),
        }),
      ),
      subscriptionPlanName: v.optional(v.string()),
      bankAccountLabel: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      const status = args.status;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(200);
      return await withAdminPaymentDetails(ctx, payments);
    }
    return await withAdminPaymentDetails(
      ctx,
      await ctx.db.query("payments").order("desc").take(200),
    );
  },
});

export const adminSetPricing = adminMutation({
  args: {
    creditPriceCents: v.number(),
    imageCredits: v.number(),
    videoCredits: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const [label, value] of Object.entries(args)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`);
      }
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const data = {
      key: "default",
      creditPriceCents: args.creditPriceCents,
      imageCredits: IMAGE_CREDITS_BY_RESOLUTION["2K"],
      videoCredits: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
      }),
      updatedBy: ctx.user._id,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("pricingSettings", data);
    }
    await audit(ctx, "pricing_updated");
    return null;
  },
});

export const adminSeedLaunchPricing = adminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const data = {
      key: "default",
      creditPriceCents,
      imageCredits: IMAGE_CREDITS_BY_RESOLUTION["2K"],
      videoCredits: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
      }),
      updatedBy: ctx.user._id,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("pricingSettings", data);
    }
    await audit(ctx, "pricing_seeded");
    return null;
  },
});

export const adminSeedSubscriptionPlans = adminMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const seeded = await seedSubscriptionPlans(ctx);
    await audit(ctx, "subscription_plans_seeded");
    return seeded;
  },
});

export const adminReviewPayment = adminMutation({
  args: {
    paymentId: v.id("payments"),
    status: v.union(
      v.literal("receipt_received"),
      v.literal("payment_completed"),
      v.literal("rejected"),
    ),
    rejectionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }
    if (payment.method !== "bank" && payment.method !== "card") {
      throw new Error("Only legacy bank or card payments can be reviewed manually. PayWise settles automatically.");
    }
    if (payment.status === "payment_completed" && args.status !== "payment_completed") {
      throw new Error("A completed payment cannot be moved to another status.");
    }
    if (payment.status === args.status) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: args.status,
      rejectionReason: args.rejectionReason,
      reviewedBy: ctx.user._id,
      reviewedAt: now,
      updatedAt: now,
    });
    if (args.status === "payment_completed") {
      const alreadyGranted = await hasTopUpForPayment(ctx, payment._id);
      if (!alreadyGranted) {
        if (payment.subscriptionPlanId) {
          const plan = await ctx.db.get("subscriptionPlans", payment.subscriptionPlanId);
          if (plan) {
            const periodEnd = now + 30 * 24 * 60 * 60 * 1000;
            const existingSubscription = await ctx.db
              .query("subscriptions")
              .withIndex("by_user_and_status", (q) =>
                q.eq("userId", payment.userId).eq("status", "active"),
              )
              .first();
            const subscriptionId =
              existingSubscription?._id ??
              (await ctx.db.insert("subscriptions", {
                userId: payment.userId,
                planId: plan._id,
                status: "active",
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                createdAt: now,
                updatedAt: now,
              }));
            if (existingSubscription) {
              await ctx.db.patch(existingSubscription._id, {
                planId: plan._id,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                updatedAt: now,
              });
            }
            const account = await ctx.db
              .query("billingAccounts")
              .withIndex("by_user", (q) => q.eq("userId", payment.userId))
              .unique();
            if (account) {
              await ctx.db.patch(account._id, {
                activeSubscriptionId: subscriptionId,
                updatedAt: now,
              });
            } else {
              await ctx.db.insert("billingAccounts", {
                userId: payment.userId,
                creditBalance: 0,
                reservedCredits: 0,
                activeSubscriptionId: subscriptionId,
                createdAt: now,
                updatedAt: now,
              });
            }
            await grantCredits(ctx, {
              userId: payment.userId,
              amount: plan.includedMonthlyCredits,
              paymentId: payment._id,
              reason: `${plan.name} subscription activated`,
              adminId: ctx.user._id,
              kind: "subscription_grant",
            });
          }
        } else if (payment.creditsGranted) {
          await grantCredits(ctx, {
            userId: payment.userId,
            amount: payment.creditsGranted,
            paymentId: payment._id,
            reason: "Payment completed",
            adminId: ctx.user._id,
          });
        }
      }
    }
    await notifyPaymentStatus(ctx, {
      userId: payment.userId,
      paymentId: payment._id,
      status: args.status,
      rejectionReason: args.rejectionReason,
    });
    await audit(ctx, `payment_${args.status}`, payment.userId, payment._id);
    return null;
  },
});

export const adminAdjustCredits = adminMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await grantCredits(ctx, {
      userId: args.userId,
      amount: args.amount,
      reason: args.reason,
      adminId: ctx.user._id,
    });
    await audit(ctx, "credits_adjusted", args.userId);
    return null;
  },
});

/** Internal ops: grant/adjust credits for a phone user (digits only, with optional +). */
export const internalAdjustCreditsByPhone = internalMutation({
  args: {
    phone: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    phone: v.string(),
    amount: v.number(),
    creditBalance: v.number(),
  }),
  handler: async (ctx, args) => {
    const phone = args.phone.replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) {
      throw new Error("Invalid phone");
    }
    if (!Number.isSafeInteger(args.amount) || args.amount === 0) {
      throw new Error("Credit amount must be a non-zero integer");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) {
      throw new Error(`No user found for phone ${phone}`);
    }
    await grantCredits(ctx, {
      userId: user._id,
      amount: args.amount,
      reason: args.reason,
      kind: "admin_adjustment",
    });
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return {
      userId: user._id,
      phone,
      amount: args.amount,
      creditBalance: account?.creditBalance ?? 0,
    };
  },
});

/**
 * One-shot/internal admin wipe: clears payments, receipts, credit ledger,
 * payment notifications, and related audit rows for a single phone user,
 * then zeros credit + reserved balances. Does not touch other users.
 */
export const internalWipeUserBillingByPhone = internalMutation({
  args: {
    phone: v.string(),
    confirm: v.literal("WIPE_BILLING"),
  },
  returns: v.object({
    userId: v.id("users"),
    phone: v.string(),
    deletedPayments: v.number(),
    deletedReceipts: v.number(),
    deletedCreditTransactions: v.number(),
    deletedPaymentNotifications: v.number(),
    deletedAuditEvents: v.number(),
    deletedSubscriptions: v.number(),
    previousCreditBalance: v.number(),
    previousReservedCredits: v.number(),
    creditBalance: v.number(),
    reservedCredits: v.number(),
  }),
  handler: async (ctx, args) => {
    const phone = args.phone.replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) {
      throw new Error("Invalid phone");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) {
      throw new Error(`No user found for phone ${phone}`);
    }

    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const previousCreditBalance = account?.creditBalance ?? 0;
    const previousReservedCredits = account?.reservedCredits ?? 0;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const receipts = await ctx.db
      .query("paymentReceipts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const txs = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const paymentNotifications = notifications.filter(
      (n) => n.kind === "payment_status" || n.paymentId !== undefined,
    );
    const audits = await ctx.db
      .query("adminAuditEvents")
      .withIndex("by_target_user", (q) => q.eq("targetUserId", user._id))
      .collect();

    for (const row of receipts) {
      await ctx.db.delete(row._id);
    }
    for (const row of txs) {
      await ctx.db.delete(row._id);
    }
    for (const row of payments) {
      await ctx.db.delete(row._id);
    }
    for (const row of paymentNotifications) {
      await ctx.db.delete(row._id);
    }
    for (const row of audits) {
      await ctx.db.delete(row._id);
    }
    for (const row of subscriptions) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    if (account) {
      await ctx.db.patch(account._id, {
        creditBalance: 0,
        reservedCredits: 0,
        activeSubscriptionId: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("billingAccounts", {
        userId: user._id,
        creditBalance: 0,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      userId: user._id,
      phone,
      deletedPayments: payments.length,
      deletedReceipts: receipts.length,
      deletedCreditTransactions: txs.length,
      deletedPaymentNotifications: paymentNotifications.length,
      deletedAuditEvents: audits.length,
      deletedSubscriptions: subscriptions.length,
      previousCreditBalance,
      previousReservedCredits,
      creditBalance: 0,
      reservedCredits: 0,
    };
  },
});

function projectPayment(payment: Doc<"payments">) {
  return {
    _id: payment._id,
    _creationTime: payment._creationTime,
    userId: payment.userId,
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    creditsGranted: payment.creditsGranted,
    subscriptionPlanId: payment.subscriptionPlanId,
    bankAccountId: payment.bankAccountId,
    externalPaymentId: payment.externalPaymentId,
    clientRequestId: payment.clientRequestId,
    checkoutUrl: payment.checkoutUrl,
    providerRequestId: payment.providerRequestId,
    providerStatus: payment.providerStatus,
    lastStatusCheckedAt: payment.lastStatusCheckedAt,
    nextStatusCheckAt: payment.nextStatusCheckAt,
    statusCheckAttempts: payment.statusCheckAttempts,
    reference: payment.reference,
    rejectionReason: payment.rejectionReason,
    reviewedBy: payment.reviewedBy,
    reviewedAt: payment.reviewedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

async function withReceiptUrls(
  ctx: QueryCtx,
  payments: Doc<"payments">[],
) {
  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  return await Promise.all(
    payments.map(async (payment) => {
      const receipt = await ctx.db
        .query("paymentReceipts")
        .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
        .first();
      return {
        ...projectPayment(payment),
        receiptUrl: receipt?.bunnyPath
          ? await signBunnyCdnUrl(receipt.bunnyPath, expiresUnix)
          : undefined,
      };
    }),
  );
}

async function withAdminPaymentDetails<T extends Doc<"payments">>(
  ctx: QueryCtx,
  payments: T[],
) {
  const withReceipts = await withReceiptUrls(ctx, payments);
  return await Promise.all(
    withReceipts.map(async (payment) => {
      const user = await ctx.db.get(payment.userId);
      const plan = payment.subscriptionPlanId
        ? await ctx.db.get(payment.subscriptionPlanId)
        : null;
      const bank = payment.bankAccountId
        ? await ctx.db.get(payment.bankAccountId)
        : null;
      return {
        ...payment,
        customer: user
          ? {
              name: user.name,
              email: user.email,
              phone: user.phone,
              role: user.role,
            }
          : undefined,
        subscriptionPlanName: plan?.name,
        bankAccountLabel: bank?.label,
      };
    }),
  );
}

async function seedSubscriptionPlans(ctx: MutationCtx): Promise<number> {
  const now = Date.now();
  const pricing = await ctx.db
    .query("pricingSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  const planCreditPriceCents = pricing?.creditPriceCents ?? creditPriceCents;
  const plans = [
    {
      name: "Starter",
      slug: "starter",
      includedMonthlyCredits: 500,
      discountPercent: 0,
      sortOrder: 0,
    },
    {
      name: "Studio",
      slug: "studio",
      includedMonthlyCredits: 1000,
      discountPercent: 0,
      sortOrder: 1,
    },
    {
      name: "Production",
      slug: "production",
      includedMonthlyCredits: 2000,
      discountPercent: 3,
      sortOrder: 2,
    },
    {
      name: "Scale",
      slug: "scale",
      includedMonthlyCredits: 4000,
      discountPercent: 5,
      sortOrder: 3,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      includedMonthlyCredits: 8000,
      discountPercent: 8,
      sortOrder: 4,
    },
  ];
  for (const plan of plans) {
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", plan.slug))
      .unique();
    const originalMonthlyPriceCents = Math.round(plan.includedMonthlyCredits * planCreditPriceCents);
    const monthlyPriceCents = Math.round(originalMonthlyPriceCents * (100 - plan.discountPercent) / 100);
    const data = {
      name: plan.name,
      slug: plan.slug,
      monthlyPriceCents,
      originalMonthlyPriceCents,
      discountPercent: plan.discountPercent,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      topUpCreditPriceCents: planCreditPriceCents,
      enabled: true,
      sortOrder: plan.sortOrder,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("subscriptionPlans", {
        ...data,
        createdAt: now,
      });
    }
  }
  return plans.length;
}

async function hasTopUpForPayment(ctx: MutationCtx | QueryCtx, paymentId: Id<"payments">) {
  const existingTx = await ctx.db
    .query("creditTransactions")
    .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
    .collect();
  return existingTx.some((tx) => tx.kind === "top_up" || tx.kind === "subscription_grant");
}

async function notifyPaymentStatus(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    paymentId: Id<"payments">;
    status: Doc<"payments">["status"];
    rejectionReason?: string;
  },
) {
  const now = Date.now();
  const body =
    args.status === "payment_completed"
      ? "Your payment was confirmed and your balance was topped up."
      : args.status === "rejected"
        ? args.rejectionReason ?? "Your payment was rejected."
        : args.status === "cancelled"
          ? "Your payment was cancelled."
          : args.status === "receipt_received"
            ? "Your receipt was received and is being reviewed."
            : "Your payment status was updated.";
  const notificationId = await ctx.db.insert("notifications", {
    userId: args.userId,
    kind: "payment_status",
    title: "Payment status updated",
    body,
    paymentId: args.paymentId,
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
    notificationId,
  });
}

async function grantCredits(
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
  await ctx.db.patch(accountId, {
    creditBalance: balanceAfter,
    updatedAt: now,
  });
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
}

async function audit(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  kind: string,
  targetUserId?: Id<"users">,
  paymentId?: Id<"payments">,
) {
  await ctx.db.insert("adminAuditEvents", {
    adminId: ctx.user._id,
    kind,
    targetUserId,
    paymentId,
    createdAt: Date.now(),
  });
}
