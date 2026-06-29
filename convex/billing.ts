import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { buildReceiptPath, getStorageUploadCredentials, signBunnyCdnUrl } from "./lib/bunny";
import { adminMutation, adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";

const paymentStatus = v.union(
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

const pricingReturn = v.object({
  creditPriceCents: v.number(),
  imageLowCredits: v.number(),
  imageMediumCredits: v.number(),
  imageHighCredits: v.number(),
  videoCredits: v.number(),
  textCredits: v.number(),
});

const imageCreditCosts = {
  low: 1,
  medium: 2,
  high: 4,
} as const;
const creditPriceCents = 50;
const textGenerationCreditCost = 1;
const videoBaseCreditCost = 15;

const bankAccountReturn = v.object({
  _id: v.id("bankAccounts"),
  _creationTime: v.number(),
  label: v.string(),
  bankName: v.string(),
  accountName: v.string(),
  accountNumber: v.string(),
  accountType: v.union(v.literal("chequing"), v.literal("savings")),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

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
      imageLowCredits: imageCreditCosts.low,
      imageMediumCredits: imageCreditCosts.medium,
      imageHighCredits: imageCreditCosts.high,
      videoCredits: videoBaseCreditCost,
      textCredits: textGenerationCreditCost,
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
      _id: v.id("payments"),
      _creationTime: v.number(),
      userId: v.id("users"),
      method: v.union(v.literal("bank"), v.literal("card")),
      status: paymentStatus,
      amountCents: v.number(),
      creditsGranted: v.optional(v.number()),
      subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
      bankAccountId: v.optional(v.id("bankAccounts")),
      externalPaymentId: v.optional(v.string()),
      receiptUrl: v.optional(v.string()),
      reference: v.optional(v.string()),
      rejectionReason: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
    return await withReceiptUrls(ctx, payments);
  },
});

export const listBankAccounts = authedQuery({
  args: {},
  returns: v.array(bankAccountReturn),
  handler: async (ctx) => {
    return await ctx.db
      .query("bankAccounts")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
  },
});

export const listSubscriptionPlans = authedQuery({
  args: {},
  returns: v.array(subscriptionPlanReturn),
  handler: async (ctx) => {
    return await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
  },
});

export const submitBankPayment = authedMutation({
  args: {
    bankAccountId: v.id("bankAccounts"),
    amountCents: v.number(),
    creditsRequested: v.optional(v.number()),
    subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
    reference: v.optional(v.string()),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const bankAccount = await ctx.db.get("bankAccounts", args.bankAccountId);
    if (!bankAccount || !bankAccount.enabled) {
      throw new Error("Bank account not available");
    }
    let subscriptionPlan: Doc<"subscriptionPlans"> | null = null;
    if (args.subscriptionPlanId !== undefined) {
      const plan = await ctx.db.get("subscriptionPlans", args.subscriptionPlanId);
      if (!plan || !plan.enabled) {
        throw new Error("Subscription plan not available");
      }
      if (args.amountCents !== plan.monthlyPriceCents) {
        throw new Error("Subscription payment amount does not match the selected plan");
      }
      subscriptionPlan = plan;
    }
    const now = Date.now();
    return await ctx.db.insert("payments", {
      userId: ctx.user._id,
      method: "bank",
      status: "receipt_uploaded",
      amountCents: subscriptionPlan ? subscriptionPlan.monthlyPriceCents : args.amountCents,
      creditsGranted: subscriptionPlan ? undefined : args.creditsRequested,
      subscriptionPlanId: args.subscriptionPlanId,
      bankAccountId: args.bankAccountId,
      reference: args.reference,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const reserveReceiptUpload = authedMutation({
  args: {
    paymentId: v.id("payments"),
    filename: v.string(),
    mimeType: v.string(),
  },
  returns: v.object({
    putUrl: v.string(),
    storageAccessKey: v.string(),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== ctx.user._id) {
      throw new Error("Payment not found");
    }
    const bunnyPath = buildReceiptPath({
      userId: ctx.user._id,
      paymentId: payment._id,
      filename: args.filename,
    });
    await ctx.db.insert("paymentReceipts", {
      paymentId: payment._id,
      userId: ctx.user._id,
      bunnyPath,
      mimeType: args.mimeType,
      createdAt: Date.now(),
    });
    return getStorageUploadCredentials(bunnyPath);
  },
});

export const completeReceiptUpload = authedMutation({
  args: {
    paymentId: v.id("payments"),
    byteSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== ctx.user._id) {
      throw new Error("Payment not found");
    }
    const receipt = await ctx.db
      .query("paymentReceipts")
      .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
      .first();
    if (receipt && args.byteSize !== undefined) {
      await ctx.db.patch(receipt._id, { byteSize: args.byteSize });
    }
    await ctx.db.patch(payment._id, {
      status: "receipt_uploaded",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminListPayments = adminQuery({
  args: {
    status: v.optional(paymentStatus),
  },
  returns: v.array(
    v.object({
      _id: v.id("payments"),
      _creationTime: v.number(),
      userId: v.id("users"),
      method: v.union(v.literal("bank"), v.literal("card")),
      status: paymentStatus,
      amountCents: v.number(),
      creditsGranted: v.optional(v.number()),
      subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
      bankAccountId: v.optional(v.id("bankAccounts")),
      externalPaymentId: v.optional(v.string()),
      receiptUrl: v.optional(v.string()),
      reference: v.optional(v.string()),
      rejectionReason: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      const status = args.status;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      return await withReceiptUrls(ctx, payments);
    }
    return await withReceiptUrls(ctx, await ctx.db.query("payments").collect());
  },
});

export const adminSetPricing = adminMutation({
  args: {
    creditPriceCents: v.number(),
    imageLowCredits: v.number(),
    imageMediumCredits: v.number(),
    imageHighCredits: v.number(),
    videoCredits: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const data = {
      key: "default",
      creditPriceCents: args.creditPriceCents,
      imageLowCredits: imageCreditCosts.low,
      imageMediumCredits: imageCreditCosts.medium,
      imageHighCredits: imageCreditCosts.high,
      videoCredits: videoBaseCreditCost,
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

export const adminSeedBankAccountFromEnv = adminMutation({
  args: {},
  returns: v.union(v.id("bankAccounts"), v.null()),
  handler: async (ctx) => {
    const bankName = process.env.STUDIO_BANK_NAME ?? "First Citizens";
    const accountName = process.env.STUDIO_BANK_ACCOUNT_NAME ?? "Tishara Sophia Aaron";
    const accountNumber = process.env.STUDIO_BANK_ACCOUNT_NUMBER ?? "2617327";
    const rawAccountType = process.env.STUDIO_BANK_ACCOUNT_TYPE ?? "savings";
    if (!bankName || !accountName || !accountNumber) {
      return null;
    }
    const accountType = rawAccountType === "savings" ? "savings" : "chequing";
    const now = Date.now();
    const existing = await ctx.db
      .query("bankAccounts")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
    const matching = existing.find((account) => account.accountNumber === accountNumber);
    if (matching) {
      await ctx.db.patch(matching._id, {
        label: "Primary Studio bank account",
        bankName,
        accountName,
        accountNumber,
        accountType,
        enabled: true,
        sortOrder: 0,
        updatedAt: now,
      });
      await audit(ctx, "bank_account_seeded");
      return matching._id;
    }
    const primary = existing.find((account) => account.sortOrder === 0);
    if (primary && primary.bankName === bankName && primary.accountName === accountName) {
      await ctx.db.patch(primary._id, {
        accountNumber,
        accountType,
        enabled: true,
        updatedAt: now,
      });
      await audit(ctx, "bank_account_seeded");
      return primary._id;
    }
    if (existing) {
      for (const account of existing) {
        if (account.sortOrder >= 1) continue;
        await ctx.db.patch(account._id, { sortOrder: account.sortOrder + 1, updatedAt: now });
      }
    }
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      label: "Primary Studio bank account",
      bankName,
      accountName,
      accountNumber,
      accountType,
      enabled: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, "bank_account_seeded");
    return bankAccountId;
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
      imageLowCredits: imageCreditCosts.low,
      imageMediumCredits: imageCreditCosts.medium,
      imageHighCredits: imageCreditCosts.high,
      videoCredits: videoBaseCreditCost,
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

export const adminUpsertBankAccount = adminMutation({
  args: {
    bankAccountId: v.optional(v.id("bankAccounts")),
    label: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    accountNumber: v.string(),
    accountType: v.union(v.literal("chequing"), v.literal("savings")),
    enabled: v.boolean(),
  },
  returns: v.id("bankAccounts"),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.bankAccountId !== undefined) {
      const existing = await ctx.db.get(args.bankAccountId);
      if (!existing) {
        throw new Error("Bank account not found");
      }
      await ctx.db.patch(existing._id, {
        label: args.label.trim(),
        bankName: args.bankName.trim(),
        accountName: args.accountName.trim(),
        accountNumber: args.accountNumber.trim(),
        accountType: args.accountType,
        enabled: args.enabled,
        updatedAt: now,
      });
      await audit(ctx, "bank_account_updated");
      return existing._id;
    }
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      label: args.label.trim(),
      bankName: args.bankName.trim(),
      accountName: args.accountName.trim(),
      accountNumber: args.accountNumber.trim(),
      accountType: args.accountType,
      enabled: args.enabled,
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, "bank_account_created");
    return bankAccountId;
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
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: args.status,
      rejectionReason: args.rejectionReason,
      reviewedBy: ctx.user._id,
      reviewedAt: now,
      updatedAt: now,
    });
    if (args.status === "payment_completed") {
      if (payment.subscriptionPlanId) {
        const plan = await ctx.db.get("subscriptionPlans", payment.subscriptionPlanId);
        if (plan) {
          const periodEnd = now + 30 * 24 * 60 * 60 * 1000;
          const existingSubscription = await ctx.db
            .query("subscriptions")
            .withIndex("by_user_and_status", (q) => q.eq("userId", payment.userId).eq("status", "active"))
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
          });
        }
      } else if (payment.creditsGranted) {
        await grantCredits(ctx, {
          userId: payment.userId,
          amount: payment.creditsGranted,
          paymentId: payment._id,
          reason: "Payment completed",
        });
      }
    }
    const notificationId = await ctx.db.insert("notifications", {
      userId: payment.userId,
      kind: "payment_status",
      title: "Payment status updated",
      body:
        args.status === "payment_completed"
          ? "Your payment was approved and credits were added."
          : args.status === "rejected"
            ? args.rejectionReason ?? "Your payment was rejected."
            : "Your receipt was received and is being reviewed.",
      paymentId: payment._id,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
      notificationId,
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
    });
    await audit(ctx, "credits_adjusted", args.userId);
    return null;
  },
});

async function withReceiptUrls<T extends Doc<"payments">>(
  ctx: QueryCtx,
  payments: T[],
): Promise<Array<T & { receiptUrl?: string }>> {
  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  return await Promise.all(
    payments.map(async (payment) => {
      const receipt = await ctx.db
        .query("paymentReceipts")
        .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
        .first();
      return {
        ...payment,
        receiptUrl: receipt?.bunnyPath
          ? await signBunnyCdnUrl(receipt.bunnyPath, expiresUnix)
          : undefined,
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

async function grantCredits(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  args: {
    userId: Id<"users">;
    amount: number;
    paymentId?: Id<"payments">;
    reason: string;
  },
) {
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
  await ctx.db.patch(accountId, {
    creditBalance: balanceAfter,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    billingAccountId: accountId,
    kind: args.paymentId ? "top_up" : "admin_adjustment",
    amount: args.amount,
    balanceAfter,
    paymentId: args.paymentId,
    reason: args.reason,
    adminId: ctx.user._id,
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
