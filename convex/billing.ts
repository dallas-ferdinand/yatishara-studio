import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { buildReceiptPath, getStorageUploadCredentials, signBunnyCdnUrl } from "./lib/bunny";
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
      .order("desc")
      .take(50);
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

export const submitBankPayment = authedMutation({
  args: {
    bankAccountId: v.id("bankAccounts"),
    amountCents: v.number(),
    creditsRequested: v.optional(v.number()),
    /** Accepted for backwards-compatible clients; new subscription purchases are rejected. */
    subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
    reference: v.optional(v.string()),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const bankAccount = await ctx.db.get("bankAccounts", args.bankAccountId);
    if (!bankAccount || !bankAccount.enabled) {
      throw new Error("Bank account not available");
    }
    if (args.subscriptionPlanId !== undefined) {
      throw new Error("Subscriptions are no longer available. Please top up instead.");
    }
    const pricing = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const unitPriceCents = pricing?.creditPriceCents ?? creditPriceCents;
    const minAmountCents = TOP_UP_MIN_CREDITS * unitPriceCents;
    if (!Number.isFinite(args.amountCents) || args.amountCents < minAmountCents) {
      throw new Error(`Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`);
    }
    const creditsFromAmount = Math.floor(args.amountCents / unitPriceCents);
    if (creditsFromAmount < TOP_UP_MIN_CREDITS) {
      throw new Error(`Top-up amount must be at least ${Math.round(minAmountCents / 100)} TTD`);
    }
    const creditsGranted =
      args.creditsRequested !== undefined ? Math.floor(args.creditsRequested) : creditsFromAmount;
    if (!Number.isFinite(creditsGranted) || creditsGranted <= 0) {
      throw new Error("Invalid credit amount");
    }
    if (creditsGranted > creditsFromAmount) {
      throw new Error("Requested credits exceed the amount paid");
    }
    const now = Date.now();
    return await ctx.db.insert("payments", {
      userId: ctx.user._id,
      method: "bank",
      status: "receipt_uploaded",
      amountCents: Math.round(args.amountCents),
      creditsGranted,
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
      return await withAdminPaymentDetails(ctx, payments);
    }
    return await withAdminPaymentDetails(ctx, await ctx.db.query("payments").collect());
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
          ? "Your payment was approved and your balance was topped up."
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
