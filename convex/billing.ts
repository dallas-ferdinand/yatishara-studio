import { v } from "convex/values";
import {
  makeFunctionReference,
  paginationOptsValidator,
  type FunctionReference,
} from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { signBunnyCdnUrl } from "./lib/bunny";
import { adminMutation, adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import {
  IMAGE_CREDITS_BY_RESOLUTION,
  IMAGE_REFERENCE_SURCHARGE,
  PLATFORM_OVERHEAD_CREDITS_MEDIA,
  PLATFORM_OVERHEAD_CREDITS_TEXT,
  imageCreditCost,
  textCreditCost,
  videoCreditCost,
} from "./lib/generationPricing";
import { purchaseCourseForUser } from "./lib/academyPurchase";
import { PAYWISE_CURRENCY } from "./lib/paywise";
import { wamPaidAmountMatchesProduct } from "./lib/wam";
import { createNotificationAndPush } from "./lib/notify";
import {
  CREDIT_GRANT_KINDS,
  nextCreditBalanceHigh,
  resolveCreditBalanceHigh,
} from "./lib/creditBalanceHigh";
import {
  STUDIO_PLAN_CATALOG,
  STUDIO_PLAN_SLUGS,
  creditsFromFaceCents,
  discountedChargeCents,
  isFirstSubscribeInvoice,
  isRenewalUnpaidInvoice,
  quoteStudioPlan,
} from "./lib/studioPlans";
import {
  activateSubscriptionFromPaidPayment,
  grantCredits,
  hasTopUpForPayment,
} from "./lib/studioBillingCore";

/** Last top-up / subscription / admin credit peak (balanceAfter). */
async function lastGrantBalanceAfterForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<number | null> {
  const rows = await ctx.db
    .query("creditTransactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(48);
  for (const row of rows) {
    if (row.amount > 0 && CREDIT_GRANT_KINDS.has(row.kind)) {
      return row.balanceAfter;
    }
  }
  return null;
}

const paymentMethod = v.union(
  v.literal("bank"),
  v.literal("card"),
  v.literal("paywise"),
  v.literal("wam"),
);

function isHostedCardMethod(method: string): boolean {
  return method === "wam" || method === "paywise";
}

async function expireAbandonedFirstSubscribeInvoices(
  ctx: MutationCtx,
  userId: Id<"users">,
  keepPaymentId?: Id<"payments">,
) {
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(50);
  const now = Date.now();
  for (const payment of payments) {
    if (keepPaymentId && payment._id === keepPaymentId) continue;
    if (payment.status !== "pending" && payment.status !== "checkout_failed") continue;
    if (!isHostedCardMethod(payment.method)) continue;
    if (isRenewalUnpaidInvoice(payment)) continue;
    await ctx.db.patch(payment._id, {
      status: "cancelled",
      rejectionReason: isFirstSubscribeInvoice(payment)
        ? "Expired. Subscribe again from Plans."
        : "Expired. Start a new checkout.",
      nextStatusCheckAt: undefined,
      updatedAt: now,
    });
  }
}

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

/** Must match `creditTransactionKind` in schema.ts. */
const creditTransactionKind = v.union(
  v.literal("top_up"),
  v.literal("reserved"),
  v.literal("spent"),
  v.literal("refunded"),
  v.literal("admin_adjustment"),
  v.literal("subscription_grant"),
  v.literal("marketplace_escrow_hold"),
  v.literal("marketplace_escrow_release"),
  v.literal("marketplace_escrow_refund"),
  v.literal("storage_charge"),
  v.literal("asset_purchase"),
  v.literal("course_purchase"),
);

const settlePaywiseCallbackRef = makeFunctionReference<
  "action",
  { paymentId: Id<"payments"> },
  { ok: boolean }
>("wamActions:settleFromWebhook") as unknown as FunctionReference<
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
/** Must match UI min in src/studio/lib/money.ts (100 credits = TT$50 at 0.50/credit). */
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
  billingInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
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
  academyCourseId: v.optional(v.id("academyCourses")),
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
  annualDiscountPercent: v.optional(v.number()),
  includedMonthlyCredits: v.number(),
  topUpCreditPriceCents: v.number(),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function canTopUpOnSubscription(
  status: Doc<"subscriptions">["status"] | undefined,
): boolean {
  return status === "active" || status === "past_due";
}

function serializeAccountSubscription(
  subscription: Doc<"subscriptions"> | null,
  plan: Doc<"subscriptionPlans"> | null,
) {
  if (!subscription) return null;
  return {
    status: subscription.status,
    interval: subscription.interval,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    planId: plan?._id,
    planName: plan?.name,
    planSlug: plan?.slug,
    includedMonthlyCredits: plan?.includedMonthlyCredits,
    monthlyPriceCents: plan?.monthlyPriceCents,
    originalMonthlyPriceCents: plan?.originalMonthlyPriceCents,
    discountPercent: plan?.discountPercent,
    annualDiscountPercent: plan?.annualDiscountPercent,
    canTopUp: canTopUpOnSubscription(subscription.status),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    cancelScheduledAt: subscription.cancelScheduledAt,
  };
}

async function loadUserSubscription(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  activeSubscriptionId?: Id<"subscriptions">,
) {
  const byId = activeSubscriptionId
    ? await ctx.db.get(activeSubscriptionId)
    : null;
  const active =
    byId ??
    (await ctx.db
      .query("subscriptions")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .first());
  const subscription =
    active ??
    (await ctx.db
      .query("subscriptions")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "past_due"),
      )
      .first());
  const plan = subscription ? await ctx.db.get(subscription.planId) : null;
  return { subscription: subscription ?? null, plan };
}

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
        videoModel: "seedance-2.5",
      }),
      videoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.5",
      }),
      videoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "seedance-2.5",
      }),
      klingVideoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
        audioEnabled: false,
      }),
      klingVideoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
        audioEnabled: false,
      }),
      platformOverheadCreditsMedia: PLATFORM_OVERHEAD_CREDITS_MEDIA,
      platformOverheadCreditsText: PLATFORM_OVERHEAD_CREDITS_TEXT,
      textCredits: textCreditCost({}),
    };
  },
});

const accountSubscriptionReturn = v.union(
  v.object({
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    interval: v.optional(v.union(v.literal("month"), v.literal("year"))),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    planId: v.optional(v.id("subscriptionPlans")),
    planName: v.optional(v.string()),
    planSlug: v.optional(v.string()),
    includedMonthlyCredits: v.optional(v.number()),
    monthlyPriceCents: v.optional(v.number()),
    originalMonthlyPriceCents: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    annualDiscountPercent: v.optional(v.number()),
    canTopUp: v.boolean(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    cancelScheduledAt: v.optional(v.number()),
  }),
  v.null(),
);

export const currentAccount = authedQuery({
  args: {},
  returns: v.object({
    creditBalance: v.number(),
    creditBalanceHigh: v.number(),
    reservedCredits: v.number(),
    subscription: accountSubscriptionReturn,
  }),
  handler: async (ctx) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const { subscription, plan } = await loadUserSubscription(
      ctx,
      ctx.user._id,
      account?.activeSubscriptionId,
    );
    const creditBalance = account?.creditBalance ?? 0;
    const lastGrantBalanceAfter = account
      ? await lastGrantBalanceAfterForUser(ctx, ctx.user._id)
      : null;
    return {
      creditBalance,
      creditBalanceHigh: resolveCreditBalanceHigh({
        creditBalance,
        creditBalanceHigh: account?.creditBalanceHigh,
        lastGrantBalanceAfter,
      }),
      reservedCredits: account?.reservedCredits ?? 0,
      subscription: serializeAccountSubscription(subscription, plan),
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

/** Wam returnUrl uses identifier=invoiceId, not our Convex payment id. */
export const findMyPaymentForWamReturn = authedQuery({
  args: { identifier: v.string() },
  returns: v.union(
    v.object({
      paymentId: v.id("payments"),
      amountCents: v.number(),
      academyCourseId: v.optional(v.id("academyCourses")),
      billing: v.union(
        v.literal("plans"),
        v.literal("invoices"),
        v.literal("topup"),
        v.literal("academy"),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identifier = args.identifier.trim();
    if (!identifier) return null;
    const byExternalRows = await ctx.db
      .query("payments")
      .withIndex("by_external_payment", (q) => q.eq("externalPaymentId", identifier))
      .take(1);
    const byExternal = byExternalRows[0] ?? null;
    const recent = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(30);
    const row =
      byExternal && byExternal.userId === ctx.user._id
        ? byExternal
        : recent.find(
            (payment) =>
              String(payment._id) === identifier ||
              payment.externalPaymentId === identifier ||
              payment.providerRequestId === identifier,
          );
    if (!row) return null;
    const billing: "plans" | "invoices" | "topup" | "academy" = row.academyCourseId
      ? "academy"
      : row.subscriptionPlanId
        ? "plans"
        : "topup";
    return {
      paymentId: row._id,
      amountCents: row.amountCents,
      academyCourseId: row.academyCourseId,
      billing,
    };
  },
});

/** Abandoned first-subscribe checkouts are not payable. Renewal unpaid invoices keep Pay. */
export const expireMyAbandonedSubscribeInvoices = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await seedSubscriptionPlans(ctx);
    await expireAbandonedFirstSubscribeInvoices(ctx, ctx.user._id);
    return null;
  },
});

/** Every spend and grant on the account — the customer-facing usage ledger. */
export const listMyCreditTransactions = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("creditTransactions"),
        _creationTime: v.number(),
        kind: creditTransactionKind,
        amount: v.number(),
        balanceAfter: v.number(),
        reason: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((tx) => ({
        _id: tx._id,
        _creationTime: tx._creationTime,
        kind: tx.kind,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        reason: tx.reason,
        createdAt: tx.createdAt,
      })),
    };
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


// --- Studio HTTP/MCP ForApi (Wave 4) ---
// Intended routes (mount via studioApiAccountExtra / later http.ts — NOT wired yet):
//   GET /api/v1/account              already exists (creditBalance via studioApiInternal.getAccount)
//   GET /api/v1/account/payments     -> listMyPaymentsForApi       (scope: read)
//   GET /api/v1/account/payments/:id -> getMyPaymentForApi         (scope: read)
//   GET /api/v1/account/credits      -> listMyCreditTransactionsForApi (scope: read)
//   GET /api/v1/account/plans        -> listSubscriptionPlansForApi (scope: read)
//   GET /api/v1/account/pricing      -> getPricingForApi           (scope: read)
//   GET /api/v1/account/storage      -> storageBilling.getMyStorageForApi (scope: read)
// Subscription extras (optional enrichment of /account later):
//   currentAccountForApi — same shape as currentAccount (includes subscription)

const paymentWithReceiptReturn = v.object({
  ...paymentReturnFields,
  receiptUrl: v.optional(v.string()),
});

const creditTxPageReturn = v.object({
  page: v.array(
    v.object({
      _id: v.id("creditTransactions"),
      _creationTime: v.number(),
      kind: creditTransactionKind,
      amount: v.number(),
      balanceAfter: v.number(),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.string(), v.null())),
});

async function requireApiUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("User not found");
  return user;
}

export const getPricingForApi = internalQuery({
  args: { userId: v.id("users") },
  returns: pricingReturn,
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
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
        videoModel: "seedance-2.5",
      }),
      videoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.5",
      }),
      videoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "seedance-2.5",
      }),
      klingVideoCredits720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
        audioEnabled: false,
      }),
      klingVideoCredits1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: "seedance-2.0",
        audioEnabled: false,
      }),
      platformOverheadCreditsMedia: PLATFORM_OVERHEAD_CREDITS_MEDIA,
      platformOverheadCreditsText: PLATFORM_OVERHEAD_CREDITS_TEXT,
      textCredits: textCreditCost({}),
    };
  },
});

export const currentAccountForApi = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    creditBalance: v.number(),
    creditBalanceHigh: v.number(),
    reservedCredits: v.number(),
    subscription: accountSubscriptionReturn,
  }),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const { subscription, plan } = await loadUserSubscription(
      ctx,
      args.userId,
      account?.activeSubscriptionId,
    );
    const creditBalance = account?.creditBalance ?? 0;
    const lastGrantBalanceAfter = await lastGrantBalanceAfterForUser(
      ctx,
      args.userId,
    );
    return {
      creditBalance,
      creditBalanceHigh: resolveCreditBalanceHigh({
        creditBalance,
        creditBalanceHigh: account?.creditBalanceHigh,
        lastGrantBalanceAfter,
      }),
      reservedCredits: account?.reservedCredits ?? 0,
      subscription: serializeAccountSubscription(subscription, plan),
    };
  },
});

export const listMyPaymentsForApi = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(paymentWithReceiptReturn),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    return await withReceiptUrls(ctx, payments);
  },
});

export const listMyCreditTransactionsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
  },
  returns: creditTxPageReturn,
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const page = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((tx) => ({
        _id: tx._id,
        _creationTime: tx._creationTime,
        kind: tx.kind,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        reason: tx.reason,
        createdAt: tx.createdAt,
      })),
    };
  },
});

export const listSubscriptionPlansForApi = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  returns: v.array(subscriptionPlanReturn),
  handler: async (ctx, args) => {
    if (args.userId) {
      await requireApiUser(ctx, args.userId);
    }
    return await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .take(20);
  },
});

export const getMyPaymentForApi = internalQuery({
  args: {
    userId: v.id("users"),
    paymentId: v.id("payments"),
  },
  returns: v.union(paymentWithReceiptReturn, v.null()),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== args.userId) {
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

/** Crockford-ish — no 0/O/1/I ambiguity. */
const PUBLIC_PAY_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function generatePublicPayCode(len = 10): string {
  const n = Math.min(16, Math.max(8, Number(len) || 10));
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += PUBLIC_PAY_CODE_ALPHABET[bytes[i]! % PUBLIC_PAY_CODE_ALPHABET.length]!;
  }
  return out;
}

function normalizePublicPayCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function studioPayShortUrl(code: string): string {
  const base = (process.env.SITE_URL || "https://studio.yatishara.com").replace(
    /\/+$/,
    "",
  );
  return `${base}/pay/${code}`;
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
    academyCourseId: v.optional(v.id("academyCourses")),
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
    academyCourseId: v.optional(v.id("academyCourses")),
  }),
  handler: async (ctx, args) => {
    const clientRequestId = args.clientRequestId.trim();
    if (!clientRequestId || clientRequestId.length > 128) {
      throw new Error("Invalid checkout request id");
    }
    if (args.academyCourseId) {
      const course = await ctx.db.get("academyCourses", args.academyCourseId);
      if (!course || course.status !== "published") {
        throw new Error("Course is not available");
      }
    }
    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const unitPriceCents = pricing?.creditPriceCents ?? creditPriceCents;

    let amountCents: number;
    let creditsGranted: number;
    if (args.academyCourseId) {
      ({ amountCents, creditsGranted } = validateTopUpAmount(
        args.amountCents,
        args.creditsRequested,
        unitPriceCents,
      ));
    } else {
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique();
      const { subscription, plan } = await loadUserSubscription(
        ctx,
        args.userId,
        account?.activeSubscriptionId,
      );
      if (!canTopUpOnSubscription(subscription?.status) || !plan) {
        throw new Error("Subscribe to a plan before topping up.");
      }
      const faceCents = args.amountCents;
      const minAmountCents = TOP_UP_MIN_CREDITS * unitPriceCents;
      if (!Number.isSafeInteger(faceCents) || faceCents < minAmountCents) {
        throw new Error(
          `Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`,
        );
      }
      const discountPercent =
        subscription?.interval === "year"
          ? (plan.annualDiscountPercent ?? 0)
          : (plan.discountPercent ?? 0);
      amountCents = discountedChargeCents(faceCents, discountPercent);
      creditsGranted = creditsFromFaceCents(faceCents, unitPriceCents);
      if (creditsGranted < TOP_UP_MIN_CREDITS) {
        throw new Error(
          `Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`,
        );
      }
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
        existing.amountCents !== amountCents ||
        existing.creditsGranted !== creditsGranted ||
        (args.academyCourseId &&
          existing.academyCourseId !== args.academyCourseId)
      ) {
        throw new Error("Checkout request id was already used for a different top-up.");
      }
      if (!existing.callbackToken) {
        throw new Error("Existing checkout is missing its callback token.");
      }
      await expireAbandonedFirstSubscribeInvoices(ctx, args.userId, existing._id);
      return {
        paymentId: existing._id,
        amountCents: existing.amountCents,
        creditsGranted: existing.creditsGranted ?? 0,
        callbackToken: existing.callbackToken,
        checkoutUrl: existing.checkoutUrl,
        externalPaymentId: existing.externalPaymentId,
        status: existing.status,
        alreadyReady: Boolean(existing.checkoutUrl && existing.externalPaymentId),
        academyCourseId: existing.academyCourseId,
      };
    }

    await expireAbandonedFirstSubscribeInvoices(ctx, args.userId);
    const now = Date.now();
    const callbackToken = randomCallbackToken();
    const paymentId = await ctx.db.insert("payments", {
      userId: args.userId,
      method: "wam",
      status: "pending",
      amountCents,
      creditsGranted,
      clientRequestId,
      callbackToken,
      reference: args.reference,
      academyCourseId: args.academyCourseId,
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
      academyCourseId: args.academyCourseId,
    };
  },
});

/** @deprecated Use preparePaywiseCheckout (now creates method=wam). */
export const prepareWamCheckout = preparePaywiseCheckout;

export const prepareSubscribeCheckout = internalMutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.string(),
    planId: v.id("subscriptionPlans"),
    interval: v.union(v.literal("month"), v.literal("year")),
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
    const plan = await ctx.db.get(args.planId);
    if (!plan || !plan.enabled) {
      throw new Error("That plan is not available");
    }
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const { subscription } = await loadUserSubscription(
      ctx,
      args.userId,
      account?.activeSubscriptionId,
    );
    if (
      subscription &&
      canTopUpOnSubscription(subscription.status) &&
      subscription.planId === args.planId &&
      (subscription.interval ?? "month") === args.interval
    ) {
      throw new Error("You're already on this plan.");
    }
    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const unitPriceCents = pricing?.creditPriceCents ?? creditPriceCents;
    const quote = quoteStudioPlan(
      {
        faceMonthlyCents: plan.originalMonthlyPriceCents ?? plan.monthlyPriceCents,
        monthlyDiscountPercent: plan.discountPercent ?? 0,
        annualDiscountPercent: plan.annualDiscountPercent ?? 0,
      },
      args.interval,
      unitPriceCents,
    );
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_client_request", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (existing) {
      if (existing.userId !== args.userId) {
        throw new Error("Checkout request already used");
      }
      if (existing.status === "checkout_failed") {
        throw new Error("This checkout attempt failed. Start a new checkout.");
      }
      if (
        existing.subscriptionPlanId !== args.planId ||
        existing.billingInterval !== args.interval ||
        existing.amountCents !== quote.chargeCents
      ) {
        throw new Error("Checkout request id was already used for a different plan.");
      }
      if (!existing.callbackToken) {
        throw new Error("Existing checkout is missing its callback token.");
      }
      await expireAbandonedFirstSubscribeInvoices(ctx, args.userId, existing._id);
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
    await expireAbandonedFirstSubscribeInvoices(ctx, args.userId);
    const now = Date.now();
    const paymentId = await ctx.db.insert("payments", {
      userId: args.userId,
      method: "wam",
      status: "pending",
      amountCents: quote.chargeCents,
      creditsGranted: quote.monthlyCredits,
      subscriptionPlanId: plan._id,
      billingInterval: args.interval,
      clientRequestId,
      callbackToken: randomCallbackToken(),
      reference: `${plan.name} ${args.interval === "year" ? "annual" : "monthly"}`,
      statusCheckAttempts: 0,
      nextStatusCheckAt: now + PAYWISE_INITIAL_CHECK_DELAY_MS,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(paymentId);
    return {
      paymentId,
      amountCents: quote.chargeCents,
      creditsGranted: quote.monthlyCredits,
      callbackToken: created?.callbackToken ?? "",
      checkoutUrl: undefined,
      externalPaymentId: undefined,
      status: "pending" as const,
      alreadyReady: false,
    };
  },
});

export const prepareInvoicePay = internalMutation({
  args: {
    userId: v.id("users"),
    paymentId: v.id("payments"),
    clientRequestId: v.string(),
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
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== args.userId) {
      throw new Error("Invoice not found");
    }
    if (payment.status === "payment_completed") {
      throw new Error("This invoice is already paid.");
    }
    if (!isRenewalUnpaidInvoice(payment)) {
      throw new Error(
        isFirstSubscribeInvoice(payment)
          ? "This checkout expired. Subscribe again from Plans."
          : "This checkout expired. Start a new checkout.",
      );
    }
    if (
      payment.status === "pending" &&
      payment.checkoutUrl &&
      payment.externalPaymentId &&
      payment.callbackToken
    ) {
      return {
        paymentId: payment._id,
        amountCents: payment.amountCents,
        creditsGranted: payment.creditsGranted ?? 0,
        callbackToken: payment.callbackToken,
        checkoutUrl: payment.checkoutUrl,
        externalPaymentId: payment.externalPaymentId,
        status: payment.status,
        alreadyReady: true,
      };
    }
    if (!payment.subscriptionPlanId || !payment.billingInterval) {
      throw new Error("This invoice cannot be paid from here.");
    }
    const plan = await ctx.db.get(payment.subscriptionPlanId);
    if (!plan || !plan.enabled) {
      throw new Error("That plan is not available");
    }
    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const unitPriceCents = pricing?.creditPriceCents ?? creditPriceCents;
    const quote = quoteStudioPlan(
      {
        faceMonthlyCents: plan.originalMonthlyPriceCents ?? plan.monthlyPriceCents,
        monthlyDiscountPercent: plan.discountPercent ?? 0,
        annualDiscountPercent: plan.annualDiscountPercent ?? 0,
      },
      payment.billingInterval,
      unitPriceCents,
    );
    const clientRequestId = args.clientRequestId.trim();
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_client_request", (q) => q.eq("clientRequestId", clientRequestId))
      .unique();
    if (existing) {
      if (existing.userId !== args.userId) {
        throw new Error("Checkout request already used");
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
    const now = Date.now();
    const paymentId = await ctx.db.insert("payments", {
      userId: args.userId,
      method: "wam",
      status: "pending",
      amountCents: quote.chargeCents,
      creditsGranted: quote.monthlyCredits,
      subscriptionPlanId: plan._id,
      billingInterval: payment.billingInterval,
      clientRequestId,
      callbackToken: randomCallbackToken(),
      reference: `${plan.name} ${payment.billingInterval === "year" ? "annual" : "monthly"}`,
      statusCheckAttempts: 0,
      nextStatusCheckAt: now + PAYWISE_INITIAL_CHECK_DELAY_MS,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(paymentId);
    return {
      paymentId,
      amountCents: quote.chargeCents,
      creditsGranted: quote.monthlyCredits,
      callbackToken: created?.callbackToken ?? "",
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
    if (!payment || !isHostedCardMethod(payment.method)) {
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
      throw new Error("Payment id is already linked to another checkout");
    }
    const now = Date.now();
    let publicPayCode = payment.publicPayCode
      ? normalizePublicPayCode(payment.publicPayCode)
      : "";
    if (!publicPayCode) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generatePublicPayCode(10);
        const clash = await ctx.db
          .query("payments")
          .withIndex("by_public_pay_code", (q) =>
            q.eq("publicPayCode", candidate),
          )
          .unique();
        if (!clash) {
          publicPayCode = candidate;
          break;
        }
      }
      if (!publicPayCode) {
        throw new Error("Could not allocate a public pay code");
      }
    }
    await ctx.db.patch(payment._id, {
      externalPaymentId: args.externalPaymentId,
      checkoutUrl: args.checkoutUrl,
      publicPayCode,
      providerRequestId: args.providerRequestId,
      providerStatus: args.providerStatus,
      nextStatusCheckAt: now + PAYWISE_INITIAL_CHECK_DELAY_MS,
      updatedAt: now,
    });
    return null;
  },
});

export const attachWamCheckout = attachPaywiseCheckout;

/** Ensure an existing checkout has a short public pay code (idempotent). */
export const ensurePublicPayCode = internalMutation({
  args: { paymentId: v.id("payments") },
  returns: v.object({
    publicPayCode: v.string(),
    shortUrl: v.string(),
    checkoutUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || !isHostedCardMethod(payment.method)) {
      throw new Error("Payment not found");
    }
    let code = payment.publicPayCode
      ? normalizePublicPayCode(payment.publicPayCode)
      : "";
    if (!code) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generatePublicPayCode(10);
        const clash = await ctx.db
          .query("payments")
          .withIndex("by_public_pay_code", (q) =>
            q.eq("publicPayCode", candidate),
          )
          .unique();
        if (!clash) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("Could not allocate a public pay code");
      await ctx.db.patch(payment._id, {
        publicPayCode: code,
        updatedAt: Date.now(),
      });
    }
    return {
      publicPayCode: code,
      shortUrl: studioPayShortUrl(code),
      checkoutUrl: payment.checkoutUrl,
    };
  },
});

/**
 * Public lookup for studio.yatishara.com/pay/<code> → hosted PayWise checkout.
 * Returns only what the redirect needs (no payer PII).
 */
export const resolvePublicPayLink = query({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      checkoutUrl: v.string(),
      status: paymentStatus,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const code = normalizePublicPayCode(args.code);
    if (!/^[a-z0-9]{8,16}$/.test(code)) return null;
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_public_pay_code", (q) => q.eq("publicPayCode", code))
      .unique();
    if (!payment?.checkoutUrl) return null;
    return {
      checkoutUrl: payment.checkoutUrl,
      status: payment.status,
    };
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
    if (!payment || !isHostedCardMethod(payment.method)) {
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
      subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
      billingInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
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
      subscriptionPlanId: payment.subscriptionPlanId,
      billingInterval: payment.billingInterval,
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
      academyCourseId: v.optional(v.id("academyCourses")),
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
      academyCourseId: payment.academyCourseId,
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
    const takeByMethod = async (method: "wam" | "paywise", status: "pending" | "needs_review", n: number) => {
      if (n <= 0) return [];
      return await ctx.db
        .query("payments")
        .withIndex("by_method_status_and_next_check", (q) =>
          q.eq("method", method).eq("status", status).lte("nextStatusCheckAt", args.now),
        )
        .take(n);
    };
    const pendingWam = await takeByMethod("wam", "pending", limit);
    const pendingLegacy =
      pendingWam.length < limit
        ? await takeByMethod("paywise", "pending", limit - pendingWam.length)
        : [];
    const pending = [...pendingWam, ...pendingLegacy];
    let remaining = limit - pending.length;
    const reviewWam = await takeByMethod("wam", "needs_review", remaining);
    remaining = limit - pending.length - reviewWam.length;
    const reviewLegacy =
      remaining > 0 ? await takeByMethod("paywise", "needs_review", remaining) : [];
    const review = [...reviewWam, ...reviewLegacy];
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
      !isHostedCardMethod(payment.method) ||
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
    if (!payment || !isHostedCardMethod(payment.method)) return { accepted: false };
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
    amountCents: v.optional(v.number()),
    creditsGranted: v.optional(v.number()),
    academyCourseId: v.optional(v.id("academyCourses")),
    academyUnlocked: v.optional(v.boolean()),
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
    amountCents?: number;
    creditsGranted?: number;
    academyCourseId?: Id<"academyCourses">;
    academyUnlocked?: boolean;
  }> => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || !isHostedCardMethod(payment.method)) {
      throw new Error("Payment not found");
    }
    const now = Date.now();
    if (payment.status === "payment_completed") {
      const academyUnlock = await maybeUnlockAcademyCourseAfterTopUp(ctx, payment);
      return {
        status: payment.status,
        granted: false,
        reason: "already_completed",
        amountCents: payment.amountCents,
        creditsGranted: payment.creditsGranted,
        academyCourseId: academyUnlock.academyCourseId ?? payment.academyCourseId,
        academyUnlocked: academyUnlock.academyUnlocked,
      };
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
      if (!wamPaidAmountMatchesProduct(args.providerAmountCents, payment.amountCents)) {
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
        const isSubscribe = Boolean(payment.subscriptionPlanId && payment.billingInterval);
        await grantCredits(ctx, {
          userId: payment.userId,
          amount: payment.creditsGranted,
          paymentId: payment._id,
          reason: isSubscribe
            ? "Wam subscription paid"
            : "Wam top-up completed",
          kind: isSubscribe ? "subscription_grant" : "top_up",
        });
        if (isSubscribe) {
          await activateSubscriptionFromPaidPayment(ctx, payment, now);
        }
      }
      const academyUnlock = await maybeUnlockAcademyCourseAfterTopUp(ctx, payment);
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
          academyUnlocked: academyUnlock.academyUnlocked,
        });
      }
      return {
        status: "payment_completed" as const,
        granted: !alreadyGranted,
        amountCents: payment.amountCents,
        creditsGranted: payment.creditsGranted,
        academyCourseId: academyUnlock.academyCourseId,
        academyUnlocked: academyUnlock.academyUnlocked,
      };
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
        .take(500);
      return await withAdminPaymentDetails(ctx, payments);
    }
    return await withAdminPaymentDetails(
      ctx,
      await ctx.db.query("payments").order("desc").take(500),
    );
  },
});

/** Recent ledger rows for one customer (admin customer sidebar). */
export const adminListCreditTransactions = adminQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("creditTransactions"),
      kind: creditTransactionKind,
      amount: v.number(),
      balanceAfter: v.number(),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(40);
    return rows.map((tx) => ({
      _id: tx._id,
      kind: tx.kind,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      reason: tx.reason,
      createdAt: tx.createdAt,
    }));
  },
});

/** Recent admin actions — write-only table until now; Tools tab shows the tail. */
export const adminListAuditEvents = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("adminAuditEvents"),
      kind: v.string(),
      adminId: v.id("users"),
      adminLabel: v.optional(v.string()),
      targetUserId: v.optional(v.id("users")),
      targetLabel: v.optional(v.string()),
      paymentId: v.optional(v.id("payments")),
      details: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("adminAuditEvents").order("desc").take(80);
    const out = [];
    for (const event of rows) {
      const admin = await ctx.db.get("users", event.adminId);
      const target = event.targetUserId
        ? await ctx.db.get("users", event.targetUserId)
        : null;
      out.push({
        _id: event._id,
        kind: event.kind,
        adminId: event.adminId,
        adminLabel: admin?.name ?? admin?.email ?? admin?.phone,
        targetUserId: event.targetUserId,
        targetLabel: target?.name ?? target?.email ?? target?.phone,
        paymentId: event.paymentId,
        details: event.details,
        createdAt: event.createdAt,
      });
    }
    return out;
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
        videoModel: "seedance-2.5",
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
        videoModel: "seedance-2.5",
      }),
      updatedBy: ctx.user._id,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("pricingSettings", data);
    }
    await seedSubscriptionPlans(ctx);
    await audit(ctx, "pricing_seeded");
    return null;
  },
});

export const ensureStudioPlans = authedMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return await seedSubscriptionPlans(ctx);
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
    const reason = args.reason.trim();
    if (!reason) throw new Error("Reason is required");
    await grantCredits(ctx, {
      userId: args.userId,
      amount: args.amount,
      reason,
      adminId: ctx.user._id,
      kind: "admin_adjustment",
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

/** Internal ops: set absolute credit balance for a phone user. */
export const internalSetCreditsByPhone = internalMutation({
  args: {
    phone: v.string(),
    creditBalance: v.number(),
    reason: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    phone: v.string(),
    previousCreditBalance: v.number(),
    creditBalance: v.number(),
    amount: v.number(),
  }),
  handler: async (ctx, args) => {
    const phone = args.phone.replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) {
      throw new Error("Invalid phone");
    }
    if (!Number.isFinite(args.creditBalance) || args.creditBalance < 0) {
      throw new Error("creditBalance must be a non-negative number");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) {
      throw new Error(`No user found for phone ${phone}`);
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const previousCreditBalance = existing?.creditBalance ?? 0;
    const creditBalance = Math.round(args.creditBalance * 100) / 100;
    const amount = Math.round((creditBalance - previousCreditBalance) * 100) / 100;
    const accountId =
      existing?._id ??
      (await ctx.db.insert("billingAccounts", {
        userId: user._id,
        creditBalance: 0,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      }));
    if (amount === 0 && existing) {
      return {
        userId: user._id,
        phone,
        previousCreditBalance,
        creditBalance: previousCreditBalance,
        amount: 0,
      };
    }
    const patch: {
      creditBalance: number;
      updatedAt: number;
      creditBalanceHigh?: number;
    } = {
      creditBalance,
      updatedAt: now,
    };
    if (amount > 0) {
      patch.creditBalanceHigh = nextCreditBalanceHigh({
        previousHigh: existing?.creditBalanceHigh,
        balanceAfter: creditBalance,
        mode: "reset",
      });
    }
    await ctx.db.patch(accountId, patch);
    await ctx.db.insert("creditTransactions", {
      userId: user._id,
      billingAccountId: accountId,
      kind: "admin_adjustment",
      amount,
      balanceAfter: creditBalance,
      reason: args.reason,
      createdAt: now,
    });
    return {
      userId: user._id,
      phone,
      previousCreditBalance,
      creditBalance,
      amount,
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
        creditBalanceHigh: 0,
        reservedCredits: 0,
        activeSubscriptionId: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("billingAccounts", {
        userId: user._id,
        creditBalance: 0,
        creditBalanceHigh: 0,
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
  const keep = new Set<string>(STUDIO_PLAN_SLUGS);
  const existingPlans = await ctx.db.query("subscriptionPlans").take(40);
  for (const row of existingPlans) {
    if (!keep.has(row.slug) && row.enabled) {
      await ctx.db.patch(row._id, { enabled: false, updatedAt: now });
    }
  }
  for (const plan of STUDIO_PLAN_CATALOG) {
    const quote = quoteStudioPlan(plan, "month", planCreditPriceCents);
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", plan.slug))
      .unique();
    const data = {
      name: plan.name,
      slug: plan.slug,
      monthlyPriceCents: quote.chargeCents,
      originalMonthlyPriceCents: plan.faceMonthlyCents,
      discountPercent: plan.monthlyDiscountPercent,
      annualDiscountPercent: plan.annualDiscountPercent,
      includedMonthlyCredits: quote.monthlyCredits,
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
  return STUDIO_PLAN_CATALOG.length;
}

async function maybeUnlockAcademyCourseAfterTopUp(
  ctx: MutationCtx,
  payment: Doc<"payments">,
): Promise<{
  academyCourseId?: Id<"academyCourses">;
  academyUnlocked: boolean;
}> {
  if (!payment.academyCourseId) {
    return { academyUnlocked: false };
  }
  try {
    await purchaseCourseForUser(ctx, payment.userId, payment.academyCourseId);
    return {
      academyCourseId: payment.academyCourseId,
      academyUnlocked: true,
    };
  } catch {
    // Credits already granted — learner can still buy from Academy checkout.
    return {
      academyCourseId: payment.academyCourseId,
      academyUnlocked: false,
    };
  }
}

/** Retry course unlock after top-up credits land (return sync / late callback). */
export const finalizeAcademyAfterPaywise = internalMutation({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.object({
    academyCourseId: v.optional(v.id("academyCourses")),
    academyUnlocked: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || !isHostedCardMethod(payment.method)) {
      return { academyUnlocked: false };
    }
    if (payment.status !== "payment_completed") {
      return {
        academyCourseId: payment.academyCourseId,
        academyUnlocked: false,
      };
    }
    return await maybeUnlockAcademyCourseAfterTopUp(ctx, payment);
  },
});

async function notifyPaymentStatus(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    paymentId: Id<"payments">;
    status: Doc<"payments">["status"];
    rejectionReason?: string;
    academyUnlocked?: boolean;
  },
) {
  const title =
    args.status === "payment_completed"
      ? args.academyUnlocked
        ? "Course unlocked"
        : "Payment confirmed"
      : args.status === "rejected"
        ? "Payment rejected"
        : args.status === "cancelled"
          ? "Payment cancelled"
          : args.status === "receipt_received"
            ? "Receipt received"
            : "Payment update";
  const body =
    args.status === "payment_completed"
      ? args.academyUnlocked
        ? "Your top-up went through and the course is unlocked."
        : "Your balance was topped up. You’re ready to create."
      : args.status === "rejected"
        ? args.rejectionReason ?? "Your payment was rejected."
        : args.status === "cancelled"
          ? "Your payment was cancelled."
          : args.status === "receipt_received"
            ? "We’re reviewing your receipt now."
            : "Your payment status was updated.";
  await createNotificationAndPush(ctx, {
    userId: args.userId,
    kind: "payment_status",
    title,
    body,
    paymentId: args.paymentId,
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
