"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  PaywiseError,
  createPaymentRequest,
  getPaymentStatus,
  splitDisplayName,
  toPaywiseMobile,
} from "./lib/paywise";

type CheckoutUser = {
  _id: Id<"users">;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneVerifiedAt?: number;
  role: "user" | "admin" | "super_admin";
};

type PreparedCheckout = {
  paymentId: Id<"payments">;
  amountCents: number;
  creditsGranted: number;
  callbackToken: string;
  checkoutUrl?: string;
  externalPaymentId?: string;
  status: string;
  alreadyReady: boolean;
};

type PaywisePaymentRow = {
  _id: Id<"payments">;
  userId: Id<"users">;
  method: "bank" | "card" | "paywise";
  status: string;
  amountCents: number;
  creditsGranted?: number;
  externalPaymentId?: string;
  checkoutUrl?: string;
  providerStatus?: string;
  statusCheckAttempts?: number;
  nextStatusCheckAt?: number;
  lastStatusCheckedAt?: number;
};

type StatusApplyResult = {
  status: string;
  granted: boolean;
  reason?: string;
};

const getCheckoutUserRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  CheckoutUser | null
>("billing:getCheckoutUser") as unknown as FunctionReference<"query", "internal", { userId: Id<"users"> }, CheckoutUser | null>;

const preparePaywiseCheckoutRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    clientRequestId: string;
    amountCents: number;
    creditsRequested?: number;
    reference?: string;
  },
  PreparedCheckout
>("billing:preparePaywiseCheckout") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    userId: Id<"users">;
    clientRequestId: string;
    amountCents: number;
    creditsRequested?: number;
    reference?: string;
  },
  PreparedCheckout
>;

const attachPaywiseCheckoutRef = makeFunctionReference<
  "mutation",
  {
    paymentId: Id<"payments">;
    externalPaymentId: string;
    checkoutUrl: string;
    providerRequestId?: string;
    providerStatus?: string;
  },
  null
>("billing:attachPaywiseCheckout") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    paymentId: Id<"payments">;
    externalPaymentId: string;
    checkoutUrl: string;
    providerRequestId?: string;
    providerStatus?: string;
  },
  null
>;

const markPaywiseCheckoutFailedRef = makeFunctionReference<
  "mutation",
  {
    paymentId: Id<"payments">;
    reason: string;
    providerRequestId?: string;
  },
  null
>("billing:markPaywiseCheckoutFailed") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    paymentId: Id<"payments">;
    reason: string;
    providerRequestId?: string;
  },
  null
>;

const getPaywisePaymentForUserRef = makeFunctionReference<
  "query",
  { paymentId: Id<"payments">; userId: Id<"users"> },
  PaywisePaymentRow | null
>("billing:getPaywisePaymentForUser") as unknown as FunctionReference<
  "query",
  "internal",
  { paymentId: Id<"payments">; userId: Id<"users"> },
  PaywisePaymentRow | null
>;

const getPaywisePaymentInternalRef = makeFunctionReference<
  "query",
  { paymentId: Id<"payments"> },
  PaywisePaymentRow | null
>("billing:getPaywisePaymentInternal") as unknown as FunctionReference<
  "query",
  "internal",
  { paymentId: Id<"payments"> },
  PaywisePaymentRow | null
>;

const claimDuePaywisePaymentsRef = makeFunctionReference<
  "mutation",
  { now: number; limit: number },
  Array<{ _id: Id<"payments">; externalPaymentId: string; statusCheckAttempts: number }>
>("billing:claimDuePaywisePayments") as unknown as FunctionReference<
  "mutation",
  "internal",
  { now: number; limit: number },
  Array<{ _id: Id<"payments">; externalPaymentId: string; statusCheckAttempts: number }>
>;

const recordPaywiseStatusCheckFailureRef = makeFunctionReference<
  "mutation",
  {
    paymentId: Id<"payments">;
    expectedExternalPaymentId: string;
    reason: string;
  },
  null
>("billing:recordPaywiseStatusCheckFailure") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    paymentId: Id<"payments">;
    expectedExternalPaymentId: string;
    reason: string;
  },
  null
>;

const applyPaywiseStatusCheckRef = makeFunctionReference<
  "mutation",
  {
    paymentId: Id<"payments">;
    expectedExternalPaymentId: string;
    providerPaymentDetailsId: string;
    providerStatus: string;
    normalizedStatus: "paid" | "pending" | "rejected" | "cancelled" | "unknown";
    providerAmountCents: number;
    providerCurrency: string;
    providerRequestId?: string;
  },
  StatusApplyResult
>("billing:applyPaywiseStatusCheck") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    paymentId: Id<"payments">;
    expectedExternalPaymentId: string;
    providerPaymentDetailsId: string;
    providerStatus: string;
    normalizedStatus: "paid" | "pending" | "rejected" | "cancelled" | "unknown";
    providerAmountCents: number;
    providerCurrency: string;
    providerRequestId?: string;
  },
  StatusApplyResult
>;

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "");
}

function convexSiteUrl(): string {
  return (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");
}

function requirePublicUrl(label: string, value: string, opts?: { allowHttpLocalhost?: boolean }): string {
  const allowHttpLocalhost = opts?.allowHttpLocalhost === true;
  const ok =
    /^https:\/\//i.test(value) ||
    (allowHttpLocalhost && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value));
  if (!ok) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
  return value;
}

export const startCheckout = action({
  args: {
    clientRequestId: v.string(),
    amountCents: v.number(),
    creditsRequested: v.optional(v.number()),
    reference: v.optional(v.string()),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    checkoutUrl: v.string(),
    status: v.string(),
  }),
  handler: async (ctx, args): Promise<{ paymentId: Id<"payments">; checkoutUrl: string; status: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to top up.");
    }
    const user = await ctx.runQuery(getCheckoutUserRef, {
      userId: userId as Id<"users">,
    });
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.phone || !user.phoneVerifiedAt) {
      throw new Error(
        "Add and verify your phone number in Account details before topping up with PayWise.",
      );
    }
    if (!user.email?.trim()) {
      throw new Error("Add an email address in Account details before topping up with PayWise.");
    }
    const payerNames =
      user.firstName?.trim() && user.lastName?.trim()
        ? { firstName: user.firstName.trim(), lastName: user.lastName.trim() }
        : splitDisplayName(user.name);
    if (!payerNames.firstName.trim() || !payerNames.lastName.trim()) {
      throw new Error("Add your first and last name in Account details before topping up with PayWise.");
    }

    const prepared = await ctx.runMutation(preparePaywiseCheckoutRef, {
      userId: userId as Id<"users">,
      clientRequestId: args.clientRequestId,
      amountCents: args.amountCents,
      creditsRequested: args.creditsRequested,
      reference: args.reference,
    });

    if (prepared.alreadyReady && prepared.checkoutUrl) {
      return {
        paymentId: prepared.paymentId,
        checkoutUrl: prepared.checkoutUrl,
        status: prepared.status,
      };
    }

    const appBase = requirePublicUrl("SITE_URL", siteUrl(), { allowHttpLocalhost: true });
    const apiBase = requirePublicUrl("CONVEX_SITE_URL", convexSiteUrl());
    const token = prepared.callbackToken;
    if (!token) {
      throw new Error("Checkout preparation failed");
    }
    const notifyUrl = `${apiBase}/paywise/notify?paymentId=${prepared.paymentId}&token=${token}`;
    const callbackUrl = `${apiBase}/paywise/callback?paymentId=${prepared.paymentId}&token=${token}`;
    const successUrl = `${appBase}/?payment=success&paymentId=${prepared.paymentId}`;
    const errorUrl = `${appBase}/?payment=error&paymentId=${prepared.paymentId}`;
    const { firstName, lastName } = payerNames;
    const requestId = `studio-checkout-${prepared.paymentId}`;
    let created: Awaited<ReturnType<typeof createPaymentRequest>>;
    try {
      created = await createPaymentRequest({
        transactionId: prepared.paymentId,
        amountCents: prepared.amountCents,
        description: args.reference?.trim() || "Studio credit top-up",
        payer: {
          mobileNumber: toPaywiseMobile(user.phone),
          firstName,
          lastName,
          email: user.email.trim(),
        },
        urls: {
          success: successUrl,
          error: errorUrl,
          notify: notifyUrl,
          callback: callbackUrl,
        },
        idempotencyKey: `paywise:checkout:${prepared.paymentId}`,
        requestId,
      });
    } catch (error) {
      const message =
        error instanceof PaywiseError
          ? error.message
          : error instanceof Error
            ? error.message
            : "PayWise checkout failed";
      // Payment row was already created — mark it failed so invoices aren't stuck on Pending.
      const shouldMarkFailed =
        !(error instanceof PaywiseError) ||
        error.code !== 429;
      if (shouldMarkFailed) {
        await ctx.runMutation(markPaywiseCheckoutFailedRef, {
          paymentId: prepared.paymentId,
          reason: message,
          providerRequestId: error instanceof PaywiseError ? error.requestId : undefined,
        });
      }
      throw new Error(message);
    }

    try {
      await ctx.runMutation(attachPaywiseCheckoutRef, {
        paymentId: prepared.paymentId,
        externalPaymentId: created.paymentDetailsId,
        checkoutUrl: created.checkoutUrl,
        providerRequestId: created.providerRequestId,
        providerStatus: created.providerStatus,
      });
    } catch {
      throw new Error(
        "PayWise created the checkout but Studio could not save it. Retry this same checkout attempt.",
      );
    }

    return {
      paymentId: prepared.paymentId,
      checkoutUrl: created.checkoutUrl,
      status: "pending",
    };
  },
});

export const syncMyPayment = action({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.object({
    status: v.string(),
    granted: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<StatusApplyResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to verify payment.");
    }
    const payment = await ctx.runQuery(getPaywisePaymentForUserRef, {
      paymentId: args.paymentId,
      userId: userId as Id<"users">,
    });
    if (!payment || payment.method !== "paywise") {
      throw new Error("Payment not found");
    }
    if (!payment.externalPaymentId) {
      return { status: payment.status, granted: false, reason: "missing_provider_id" };
    }
    if (
      payment.status === "payment_completed" ||
      payment.status === "checkout_failed"
    ) {
      return { status: payment.status, granted: false, reason: "already_terminal" };
    }
    if (
      payment.lastStatusCheckedAt &&
      Date.now() - payment.lastStatusCheckedAt < 10_000
    ) {
      return { status: payment.status, granted: false, reason: "rate_limited" };
    }

    const provider = await getPaymentStatus(payment.externalPaymentId, {
      requestId: `studio-sync-${args.paymentId}-${Date.now()}`,
    });
    return await ctx.runMutation(applyPaywiseStatusCheckRef, {
      paymentId: args.paymentId,
      expectedExternalPaymentId: payment.externalPaymentId,
      providerPaymentDetailsId: provider.paymentDetailsId,
      providerStatus: provider.providerStatus,
      normalizedStatus: provider.normalizedStatus,
      providerAmountCents: provider.amountCents,
      providerCurrency: provider.currency,
      providerRequestId: provider.providerRequestId,
    });
  },
});

export const adminRefreshPaywisePayment = action({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.object({
    status: v.string(),
    granted: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<StatusApplyResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const admin = await ctx.runQuery(getCheckoutUserRef, {
      userId: userId as Id<"users">,
    });
    if (!admin || (admin.role !== "admin" && admin.role !== "super_admin")) {
      throw new Error("Admin access required");
    }
    const payment = await ctx.runQuery(getPaywisePaymentInternalRef, {
      paymentId: args.paymentId,
    });
    if (!payment || payment.method !== "paywise") {
      throw new Error("PayWise payment not found");
    }
    if (!payment.externalPaymentId) {
      throw new Error("PayWise payment has no provider id yet");
    }
    const provider = await getPaymentStatus(payment.externalPaymentId, {
      requestId: `studio-admin-refresh-${args.paymentId}-${Date.now()}`,
    });
    return await ctx.runMutation(applyPaywiseStatusCheckRef, {
      paymentId: args.paymentId,
      expectedExternalPaymentId: payment.externalPaymentId,
      providerPaymentDetailsId: provider.paymentDetailsId,
      providerStatus: provider.providerStatus,
      normalizedStatus: provider.normalizedStatus,
      providerAmountCents: provider.amountCents,
      providerCurrency: provider.currency,
      providerRequestId: provider.providerRequestId,
    });
  },
});

export const reconcilePendingPayments = internalAction({
  args: {},
  returns: v.object({
    checked: v.number(),
    granted: v.number(),
  }),
  handler: async (ctx): Promise<{ checked: number; granted: number }> => {
    const due = await ctx.runMutation(claimDuePaywisePaymentsRef, {
      now: Date.now(),
      limit: 20,
    });
    let granted = 0;
    for (let index = 0; index < due.length; index += 4) {
      const batch = due.slice(index, index + 4);
      const results = await Promise.all(
        batch.map(async (payment) => {
          try {
            const provider = await getPaymentStatus(payment.externalPaymentId, {
              requestId: `studio-reconcile-${payment._id}-${Date.now()}`,
              maxRetries: 0,
            });
            return await ctx.runMutation(applyPaywiseStatusCheckRef, {
              paymentId: payment._id,
              expectedExternalPaymentId: payment.externalPaymentId,
              providerPaymentDetailsId: provider.paymentDetailsId,
              providerStatus: provider.providerStatus,
              normalizedStatus: provider.normalizedStatus,
              providerAmountCents: provider.amountCents,
              providerCurrency: provider.currency,
              providerRequestId: provider.providerRequestId,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "PayWise status check failed";
            await ctx.runMutation(recordPaywiseStatusCheckFailureRef, {
              paymentId: payment._id,
              expectedExternalPaymentId: payment.externalPaymentId,
              reason: message,
            });
            console.error("paywise_reconcile_failed", {
              paymentId: payment._id,
              message,
            });
            return null;
          }
        }),
      );
      granted += results.filter((result) => result?.granted).length;
    }
    return { checked: due.length, granted };
  },
});

export const settleFromCallback = internalAction({
  args: {
    paymentId: v.id("payments"),
  },
  returns: v.object({
    ok: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const payment = await ctx.runQuery(getPaywisePaymentInternalRef, {
      paymentId: args.paymentId,
    });
    if (!payment || payment.method !== "paywise" || !payment.externalPaymentId) {
      return { ok: false };
    }
    if (
      payment.status === "payment_completed" ||
      payment.status === "checkout_failed"
    ) {
      return { ok: true };
    }
    try {
      const provider = await getPaymentStatus(payment.externalPaymentId, {
        requestId: `studio-callback-${args.paymentId}-${Date.now()}`,
        maxRetries: 1,
      });
      await ctx.runMutation(applyPaywiseStatusCheckRef, {
        paymentId: args.paymentId,
        expectedExternalPaymentId: payment.externalPaymentId,
        providerPaymentDetailsId: provider.paymentDetailsId,
        providerStatus: provider.providerStatus,
        normalizedStatus: provider.normalizedStatus,
        providerAmountCents: provider.amountCents,
        providerCurrency: provider.currency,
        providerRequestId: provider.providerRequestId,
      });
      return { ok: true };
    } catch (error) {
      await ctx.runMutation(recordPaywiseStatusCheckFailureRef, {
        paymentId: args.paymentId,
        expectedExternalPaymentId: payment.externalPaymentId,
        reason: error instanceof Error ? error.message : "PayWise callback status check failed",
      });
      console.error("paywise_callback_settle_failed", {
        paymentId: args.paymentId,
        message: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false };
    }
  },
});
