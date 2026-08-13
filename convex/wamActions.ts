"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  WAM_CURRENCY,
  normalizeWamIntentStatus,
  wamErrorMessage,
} from "./lib/wam";
import { WamPaymentError, getWamSDK } from "./lib/wamSdk";

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
  academyCourseId?: Id<"academyCourses">;
};

type HostedPaymentRow = {
  _id: Id<"payments">;
  userId: Id<"users">;
  method: "bank" | "card" | "paywise" | "wam";
  status: string;
  amountCents: number;
  creditsGranted?: number;
  externalPaymentId?: string;
  checkoutUrl?: string;
  providerStatus?: string;
  statusCheckAttempts?: number;
  nextStatusCheckAt?: number;
  lastStatusCheckedAt?: number;
  academyCourseId?: Id<"academyCourses">;
};

type StatusApplyResult = {
  status: string;
  granted: boolean;
  reason?: string;
  amountCents?: number;
  creditsGranted?: number;
  academyCourseId?: Id<"academyCourses">;
  academyUnlocked?: boolean;
};

const getCheckoutUserRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  CheckoutUser | null
>("billing:getCheckoutUser") as unknown as FunctionReference<
  "query",
  "internal",
  { userId: Id<"users"> },
  CheckoutUser | null
>;

const prepareCheckoutRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    clientRequestId: string;
    amountCents: number;
    creditsRequested?: number;
    reference?: string;
    academyCourseId?: Id<"academyCourses">;
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
    academyCourseId?: Id<"academyCourses">;
  },
  PreparedCheckout
>;

const attachCheckoutRef = makeFunctionReference<
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

const markCheckoutFailedRef = makeFunctionReference<
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

const getPaymentForUserRef = makeFunctionReference<
  "query",
  { paymentId: Id<"payments">; userId: Id<"users"> },
  HostedPaymentRow | null
>("billing:getPaywisePaymentForUser") as unknown as FunctionReference<
  "query",
  "internal",
  { paymentId: Id<"payments">; userId: Id<"users"> },
  HostedPaymentRow | null
>;

const getPaymentInternalRef = makeFunctionReference<
  "query",
  { paymentId: Id<"payments"> },
  HostedPaymentRow | null
>("billing:getPaywisePaymentInternal") as unknown as FunctionReference<
  "query",
  "internal",
  { paymentId: Id<"payments"> },
  HostedPaymentRow | null
>;

const claimDuePaymentsRef = makeFunctionReference<
  "mutation",
  { now: number; limit: number },
  Array<{ _id: Id<"payments">; externalPaymentId: string; statusCheckAttempts: number }>
>("billing:claimDuePaywisePayments") as unknown as FunctionReference<
  "mutation",
  "internal",
  { now: number; limit: number },
  Array<{ _id: Id<"payments">; externalPaymentId: string; statusCheckAttempts: number }>
>;

const recordStatusCheckFailureRef = makeFunctionReference<
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

const applyStatusCheckRef = makeFunctionReference<
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

const finalizeAcademyRef = makeFunctionReference<
  "mutation",
  { paymentId: Id<"payments"> },
  { academyCourseId?: Id<"academyCourses">; academyUnlocked: boolean }
>("billing:finalizeAcademyAfterPaywise") as unknown as FunctionReference<
  "mutation",
  "internal",
  { paymentId: Id<"payments"> },
  { academyCourseId?: Id<"academyCourses">; academyUnlocked: boolean }
>;

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "");
}

function requirePublicUrl(
  label: string,
  value: string,
  opts?: { allowHttpLocalhost?: boolean },
): string {
  const allowHttpLocalhost = opts?.allowHttpLocalhost === true;
  const ok =
    /^https:\/\//i.test(value) ||
    (allowHttpLocalhost &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value));
  if (!ok) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
  return value;
}

function isHostedMethod(method: string | undefined): boolean {
  return method === "wam" || method === "paywise";
}

function splitDisplayName(name?: string): { firstName: string; lastName: string } {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function applyProviderStatus(
  ctx: { runMutation: Function },
  paymentId: Id<"payments">,
  externalPaymentId: string,
) {
  const wam = getWamSDK();
  const provider = await wam.getPaymentIntentStatus(externalPaymentId);
  return await ctx.runMutation(applyStatusCheckRef, {
    paymentId,
    expectedExternalPaymentId: externalPaymentId,
    providerPaymentDetailsId: provider.paymentId,
    providerStatus: provider.status,
    normalizedStatus: normalizeWamIntentStatus(provider.status),
    providerAmountCents: provider.amountCents,
    providerCurrency: provider.currency || WAM_CURRENCY,
    providerRequestId: provider.providerTransactionId ?? undefined,
  });
}

export const startCheckout = action({
  args: {
    clientRequestId: v.string(),
    amountCents: v.number(),
    creditsRequested: v.optional(v.number()),
    reference: v.optional(v.string()),
    academyCourseId: v.optional(v.id("academyCourses")),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    checkoutUrl: v.string(),
    status: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ paymentId: Id<"payments">; checkoutUrl: string; status: string }> => {
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
    if (!user.phone?.trim()) {
      throw new Error("Add a phone number in Account details before topping up with Wam.");
    }
    if (!user.email?.trim()) {
      throw new Error("Add an email address in Account details before topping up with Wam.");
    }
    const payerNames =
      user.firstName?.trim() && user.lastName?.trim()
        ? { firstName: user.firstName.trim(), lastName: user.lastName.trim() }
        : splitDisplayName(user.name);
    if (!payerNames.firstName.trim() || !payerNames.lastName.trim()) {
      throw new Error(
        "Add your first and last name in Account details before topping up with Wam.",
      );
    }

    const prepared = await ctx.runMutation(prepareCheckoutRef, {
      userId: userId as Id<"users">,
      clientRequestId: args.clientRequestId,
      amountCents: args.amountCents,
      creditsRequested: args.creditsRequested,
      reference: args.reference,
      academyCourseId: args.academyCourseId,
    });

    if (prepared.alreadyReady && prepared.checkoutUrl) {
      return {
        paymentId: prepared.paymentId,
        checkoutUrl: prepared.checkoutUrl,
        status: prepared.status,
      };
    }

    const appBase = requirePublicUrl("SITE_URL", siteUrl(), {
      allowHttpLocalhost: true,
    });
    const academyCourseId = prepared.academyCourseId ?? args.academyCourseId;
    const returnUrl = academyCourseId
      ? `${appBase}/?payment=success&paymentId=${prepared.paymentId}&academyCourse=${academyCourseId}`
      : `${appBase}/?payment=success&paymentId=${prepared.paymentId}`;

    let intent: Awaited<ReturnType<ReturnType<typeof getWamSDK>["createPaymentIntent"]>>;
    try {
      const wam = getWamSDK();
      intent = await wam.createPaymentIntent({
        amountCents: prepared.amountCents,
        currency: WAM_CURRENCY,
        orderReference: String(prepared.paymentId),
        description:
          args.reference?.trim() ||
          (academyCourseId ? "Studio Academy course unlock" : "Studio credit top-up"),
        returnUrl,
        metadata: {
          paymentId: String(prepared.paymentId),
          userId: String(userId),
          ...(academyCourseId ? { academyCourseId: String(academyCourseId) } : {}),
        },
        idempotencyKey: `wam:checkout:${prepared.paymentId}`,
      });
    } catch (error) {
      const message = wamErrorMessage(error);
      const shouldMarkFailed =
        !(error instanceof WamPaymentError) ||
        !String(error.code || "").includes("RATE");
      if (shouldMarkFailed) {
        await ctx.runMutation(markCheckoutFailedRef, {
          paymentId: prepared.paymentId,
          reason: message,
        });
      }
      throw new Error(message);
    }

    try {
      await ctx.runMutation(attachCheckoutRef, {
        paymentId: prepared.paymentId,
        externalPaymentId: intent.paymentId,
        checkoutUrl: intent.checkoutUrl,
        providerRequestId: intent.invoiceId,
        providerStatus: intent.status,
      });
    } catch {
      throw new Error(
        "Wam created the checkout but Studio could not save it. Retry this same checkout attempt.",
      );
    }

    return {
      paymentId: prepared.paymentId,
      checkoutUrl: intent.checkoutUrl,
      status: "pending",
    };
  },
});

export const syncMyPayment = action({
  args: {
    paymentId: v.id("payments"),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.string(),
    granted: v.boolean(),
    reason: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    creditsGranted: v.optional(v.number()),
    academyCourseId: v.optional(v.id("academyCourses")),
    academyUnlocked: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<StatusApplyResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to verify payment.");
    }
    const payment = await ctx.runQuery(getPaymentForUserRef, {
      paymentId: args.paymentId,
      userId: userId as Id<"users">,
    });
    if (!payment || !isHostedMethod(payment.method)) {
      throw new Error("Payment not found");
    }
    if (!payment.externalPaymentId) {
      return {
        status: payment.status,
        granted: false,
        reason: "missing_provider_id",
        academyCourseId: payment.academyCourseId,
      };
    }
    if (
      payment.status === "payment_completed" ||
      payment.status === "checkout_failed"
    ) {
      if (payment.status === "payment_completed" && payment.academyCourseId) {
        const unlock = await ctx.runMutation(finalizeAcademyRef, {
          paymentId: args.paymentId,
        });
        return {
          status: payment.status,
          granted: false,
          reason: "already_terminal",
          amountCents: payment.amountCents,
          creditsGranted: payment.creditsGranted,
          academyCourseId: unlock.academyCourseId ?? payment.academyCourseId,
          academyUnlocked: unlock.academyUnlocked,
        };
      }
      return {
        status: payment.status,
        granted: false,
        reason: "already_terminal",
        amountCents: payment.amountCents,
        creditsGranted: payment.creditsGranted,
        academyCourseId: payment.academyCourseId,
      };
    }
    if (
      !args.force &&
      payment.lastStatusCheckedAt &&
      Date.now() - payment.lastStatusCheckedAt < 10_000
    ) {
      return { status: payment.status, granted: false, reason: "rate_limited" };
    }

    return await applyProviderStatus(ctx, args.paymentId, payment.externalPaymentId);
  },
});

export const adminRefreshWamPayment = action({
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
    const payment = await ctx.runQuery(getPaymentInternalRef, {
      paymentId: args.paymentId,
    });
    if (!payment || !isHostedMethod(payment.method)) {
      throw new Error("Wam payment not found");
    }
    if (!payment.externalPaymentId) {
      throw new Error("Wam payment has no provider id yet");
    }
    return await applyProviderStatus(ctx, args.paymentId, payment.externalPaymentId);
  },
});

/** Alias kept for UI that still calls adminRefreshPaywisePayment. */
export const adminRefreshPaywisePayment = adminRefreshWamPayment;

export const reconcilePendingPayments = internalAction({
  args: {},
  returns: v.object({
    checked: v.number(),
    granted: v.number(),
  }),
  handler: async (ctx): Promise<{ checked: number; granted: number }> => {
    const due = await ctx.runMutation(claimDuePaymentsRef, {
      now: Date.now(),
      limit: 20,
    });
    let granted = 0;
    for (let index = 0; index < due.length; index += 4) {
      const batch = due.slice(index, index + 4);
      const results = await Promise.all(
        batch.map(async (payment) => {
          try {
            return await applyProviderStatus(
              ctx,
              payment._id,
              payment.externalPaymentId,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Wam status check failed";
            await ctx.runMutation(recordStatusCheckFailureRef, {
              paymentId: payment._id,
              expectedExternalPaymentId: payment.externalPaymentId,
              reason: message,
            });
            console.error("wam_reconcile_failed", {
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

export const settleFromWebhook = internalAction({
  args: {
    paymentId: v.id("payments"),
    externalPaymentId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const payment = await ctx.runQuery(getPaymentInternalRef, {
      paymentId: args.paymentId,
    });
    if (!payment || !isHostedMethod(payment.method)) {
      return { ok: false };
    }
    const externalId = args.externalPaymentId || payment.externalPaymentId;
    if (!externalId) return { ok: false };
    if (
      payment.status === "payment_completed" ||
      payment.status === "checkout_failed"
    ) {
      if (payment.status === "payment_completed" && payment.academyCourseId) {
        await ctx.runMutation(finalizeAcademyRef, {
          paymentId: args.paymentId,
        });
      }
      return { ok: true };
    }
    try {
      await applyProviderStatus(ctx, args.paymentId, externalId);
      return { ok: true };
    } catch (error) {
      await ctx.runMutation(recordStatusCheckFailureRef, {
        paymentId: args.paymentId,
        expectedExternalPaymentId: externalId,
        reason:
          error instanceof Error ? error.message : "Wam webhook status check failed",
      });
      console.error("wam_webhook_settle_failed", {
        paymentId: args.paymentId,
        message: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false };
    }
  },
});

/** Legacy name used by enqueuePaywiseCallback scheduler. */
export const settleFromCallback = settleFromWebhook;
