"use node";

import { v } from "convex/values";
import { Resend as ResendAPI } from "resend";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildSignInCodeEmail } from "./lib/authEmail";
import {
  createPaymentRequest,
  getPaymentStatus,
  splitDisplayName,
  toPaywiseMobile,
  PaywiseError,
} from "./lib/paywise";
import type { Id } from "./_generated/dataModel";

function siteUrl(): string {
  return (process.env.SITE_URL || "https://studio.yatishara.com").replace(/\/+$/, "");
}

function convexSiteUrl(): string {
  return (process.env.CONVEX_SITE_URL || "").replace(/\/+$/, "");
}

function requirePublicUrl(label: string, value: string): string {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(`${label} is not configured`);
  return raw.replace(/\/+$/, "");
}

type StudioCsUser = {
  userId: Id<"users">;
  phone: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  name?: string;
} | null;

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

type PaymentRow = {
  _id: Id<"payments">;
  status: string;
  externalPaymentId?: string;
  providerStatus?: string;
  amountCents: number;
  creditsGranted?: number;
  academyCourseId?: Id<"academyCourses">;
  userId: Id<"users">;
} | null;

type StatusApplyResult = {
  status: string;
  granted: boolean;
  academyUnlocked?: boolean;
};

const preparePaywiseCheckoutRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    clientRequestId: string;
    amountCents: number;
    academyCourseId?: Id<"academyCourses">;
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
    academyCourseId?: Id<"academyCourses">;
    reference?: string;
  },
  PreparedCheckout
>;

const attachPaywiseCheckoutRef = makeFunctionReference<
  "mutation",
  {
    paymentId: Id<"payments">;
    checkoutUrl: string;
    externalPaymentId: string;
    providerRequestId?: string;
    providerStatus?: string;
  },
  null
>("billing:attachPaywiseCheckout") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    paymentId: Id<"payments">;
    checkoutUrl: string;
    externalPaymentId: string;
    providerRequestId?: string;
    providerStatus?: string;
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

export const sendOtpEmail = internalAction({
  args: { email: v.string(), code: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Resend API key is not configured");
    const resend = new ResendAPI(apiKey);
    const from =
      process.env.AUTH_RESEND_FROM ?? "Yatishara Studio <noreply@yatishara.com>";
    const message = buildSignInCodeEmail({
      code: args.code,
      email: args.email,
      siteUrl: process.env.SITE_URL,
    });
    const { error } = await resend.emails.send({
      from,
      to: [args.email],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error) throw new Error("Could not send verification code");
    return null;
  },
});

export const internalStartPaywiseForCs = internalAction({
  args: {
    phone: v.string(),
    amountCents: v.number(),
    kind: v.optional(v.string()),
    courseId: v.optional(v.id("academyCourses")),
  },
  returns: v.object({
    paymentId: v.string(),
    checkoutUrl: v.optional(v.string()),
    amountCents: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    paymentId: string;
    checkoutUrl?: string;
    amountCents: number;
  }> => {
    const phone = args.phone.replace(/\D/g, "");
    const user: StudioCsUser = await ctx.runQuery(
      internal.studioCs.internalFindUserByPhone,
      { phone },
    );
    if (!user) {
      throw new Error(
        "No Studio account yet. Collect name + email, create account, verify OTP, then PayWise.",
      );
    }
    if (!user.emailVerified) {
      throw new Error(
        "Email not verified yet. Verify OTP in WhatsApp before PayWise.",
      );
    }
    if (!user.email || !user.firstName || !user.lastName) {
      throw new Error(
        "Account needs email and first/last name before PayWise.",
      );
    }
    const clientRequestId = `studio-cs-${phone}-${Date.now()}`;
    const prepared: PreparedCheckout = await ctx.runMutation(
      preparePaywiseCheckoutRef,
      {
        userId: user.userId,
        clientRequestId,
        amountCents: args.amountCents,
        academyCourseId: args.courseId,
        reference:
          args.kind === "wallet"
            ? "Studio CS wallet top-up"
            : "Studio CS Academy course",
      },
    );
    if (prepared.alreadyReady && prepared.checkoutUrl) {
      return {
        paymentId: String(prepared.paymentId),
        checkoutUrl: prepared.checkoutUrl,
        amountCents: prepared.amountCents,
      };
    }
    const token = prepared.callbackToken;
    if (!token) throw new Error("Checkout preparation failed");
    const appBase = requirePublicUrl("SITE_URL", siteUrl());
    const apiBase = requirePublicUrl("CONVEX_SITE_URL", convexSiteUrl());
    const academyCourseId = prepared.academyCourseId ?? args.courseId;
    const notifyUrl = `${apiBase}/paywise/notify?paymentId=${prepared.paymentId}&token=${token}`;
    const callbackUrl = `${apiBase}/paywise/callback?paymentId=${prepared.paymentId}&token=${token}`;
    const successUrl = academyCourseId
      ? `${appBase}/?payment=success&paymentId=${prepared.paymentId}&academyCourse=${academyCourseId}`
      : `${appBase}/?payment=success&paymentId=${prepared.paymentId}`;
    const errorUrl = academyCourseId
      ? `${appBase}/?payment=error&paymentId=${prepared.paymentId}&academyCourse=${academyCourseId}`
      : `${appBase}/?payment=error&paymentId=${prepared.paymentId}`;
    const names = splitDisplayName(
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name,
    );
    const firstName = names.firstName || user.firstName || "Studio";
    const lastName = names.lastName || user.lastName || "Customer";
    try {
      const created = await createPaymentRequest({
        transactionId: prepared.paymentId,
        amountCents: prepared.amountCents,
        description:
          args.kind === "wallet"
            ? "Studio CS wallet top-up"
            : "Studio CS Academy course",
        payer: {
          mobileNumber: toPaywiseMobile(phone),
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
        idempotencyKey: `paywise:studio-cs:${prepared.paymentId}`,
        requestId: `studio-cs-${prepared.paymentId}`,
      });
      await ctx.runMutation(attachPaywiseCheckoutRef, {
        paymentId: prepared.paymentId,
        checkoutUrl: created.checkoutUrl,
        externalPaymentId: created.paymentDetailsId,
        providerRequestId: created.providerRequestId,
        providerStatus: created.providerStatus,
      });
      return {
        paymentId: String(prepared.paymentId),
        checkoutUrl: created.checkoutUrl,
        amountCents: prepared.amountCents,
      };
    } catch (err) {
      const message =
        err instanceof PaywiseError ? err.message : "PayWise checkout failed";
      throw new Error(message);
    }
  },
});

export const internalCheckPaywisePayment = internalAction({
  args: { paymentId: v.string() },
  returns: v.object({
    status: v.string(),
    providerStatus: v.optional(v.string()),
    granted: v.optional(v.boolean()),
    academyUnlocked: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<{
    status: string;
    providerStatus?: string;
    granted?: boolean;
    academyUnlocked?: boolean;
  }> => {
    const payment: PaymentRow = await ctx.runQuery(
      internal.studioCs.internalGetPayment,
      { paymentId: args.paymentId as Id<"payments"> },
    );
    if (!payment) return { status: "missing" };
    if (!payment.externalPaymentId) {
      return { status: payment.status, providerStatus: payment.providerStatus };
    }
    try {
      const provider = await getPaymentStatus(payment.externalPaymentId, {
        requestId: `studio-cs-${args.paymentId}-${Date.now()}`,
      });
      const applied: StatusApplyResult = await ctx.runMutation(
        applyPaywiseStatusCheckRef,
        {
          paymentId: payment._id,
          expectedExternalPaymentId: payment.externalPaymentId,
          providerPaymentDetailsId: provider.paymentDetailsId,
          providerStatus: provider.providerStatus,
          normalizedStatus: provider.normalizedStatus,
          providerAmountCents: provider.amountCents,
          providerCurrency: provider.currency,
          providerRequestId: provider.providerRequestId,
        },
      );
      return {
        status: applied.status,
        providerStatus: provider.providerStatus,
        granted: applied.granted,
        academyUnlocked: applied.academyUnlocked,
      };
    } catch {
      return {
        status: payment.status,
        providerStatus: payment.providerStatus,
      };
    }
  },
});
