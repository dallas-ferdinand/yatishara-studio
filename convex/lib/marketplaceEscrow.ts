import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nextCreditBalanceHigh } from "./creditBalanceHigh";

const DEFAULT_CREDIT_PRICE_CENTS = 50;

export function creditsFromOfferPriceCents(
  priceCents: number,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  const price = Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS);
  if (!price || !Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error("Invalid offer price");
  }
  const credits = Math.ceil(Number(priceCents) / price);
  if (credits < 1) {
    throw new Error("Offer price is too low");
  }
  return credits;
}

export async function getCreditPriceCents(
  ctx: MutationCtx | QueryCtx,
): Promise<number> {
  const settings = await ctx.db
    .query("pricingSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  return settings?.creditPriceCents ?? DEFAULT_CREDIT_PRICE_CENTS;
}

async function requireBillingAccount(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"billingAccounts">> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!account) {
    throw new Error("Billing account not found");
  }
  return account;
}

/**
 * Debit buyer spendable balance into platform escrow (not generation reservedCredits).
 */
export async function holdMarketplaceEscrow(
  ctx: MutationCtx,
  args: {
    buyerUserId: Id<"users">;
    jobId: Id<"marketplaceJobs">;
    credits: number;
    reason?: string;
  },
): Promise<{
  holdId: Id<"platformEscrowHolds">;
  holdTransactionId: Id<"creditTransactions">;
}> {
  const credits = Math.floor(Number(args.credits));
  if (!Number.isFinite(credits) || credits < 1) {
    throw new Error("Invalid escrow amount");
  }
  const account = await requireBillingAccount(ctx, args.buyerUserId);
  if (account.creditBalance < credits) {
    throw new Error(
      `Insufficient credits for marketplace escrow. Need ${credits} credits.`,
    );
  }
  const now = Date.now();
  const balanceAfter = account.creditBalance - credits;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    updatedAt: now,
  });
  const holdTransactionId = await ctx.db.insert("creditTransactions", {
    userId: args.buyerUserId,
    billingAccountId: account._id,
    kind: "marketplace_escrow_hold",
    amount: -credits,
    balanceAfter,
    marketplaceJobId: args.jobId,
    reason: args.reason ?? "Marketplace escrow hold",
    createdAt: now,
  });
  const holdId = await ctx.db.insert("platformEscrowHolds", {
    jobId: args.jobId,
    buyerUserId: args.buyerUserId,
    credits,
    holdCreditTransactionId: holdTransactionId,
    status: "held",
    createdAt: now,
    updatedAt: now,
  });
  return { holdId, holdTransactionId };
}

/**
 * Clear escrow into platform revenue. Buyer balance stays reduced (money already left wallet).
 * Idempotent via by_reversed_transaction on the hold row.
 */
export async function releaseMarketplaceEscrow(
  ctx: MutationCtx,
  args: {
    holdId: Id<"platformEscrowHolds">;
    reason?: string;
  },
): Promise<Id<"creditTransactions">> {
  const hold = await ctx.db.get("platformEscrowHolds", args.holdId);
  if (!hold) {
    throw new Error("Escrow hold not found");
  }
  if (hold.status === "released" && hold.releaseCreditTransactionId) {
    return hold.releaseCreditTransactionId;
  }
  if (hold.status !== "held") {
    throw new Error(`Cannot release escrow in status ${hold.status}`);
  }
  const existing = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", hold.holdCreditTransactionId),
    )
    .unique();
  if (existing) {
    if (existing.kind !== "marketplace_escrow_release") {
      throw new Error("Escrow hold was already reversed");
    }
    if (!hold.releaseCreditTransactionId) {
      await ctx.db.patch(hold._id, {
        status: "released",
        releaseCreditTransactionId: existing._id,
        updatedAt: Date.now(),
      });
    }
    return existing._id;
  }
  const account = await requireBillingAccount(ctx, hold.buyerUserId);
  const now = Date.now();
  const releaseId = await ctx.db.insert("creditTransactions", {
    userId: hold.buyerUserId,
    billingAccountId: account._id,
    kind: "marketplace_escrow_release",
    amount: 0,
    balanceAfter: account.creditBalance,
    marketplaceJobId: hold.jobId,
    reversesTransactionId: hold.holdCreditTransactionId,
    reason: args.reason ?? "Marketplace escrow released to platform revenue",
    createdAt: now,
  });
  await ctx.db.patch(hold._id, {
    status: "released",
    releaseCreditTransactionId: releaseId,
    updatedAt: now,
  });
  return releaseId;
}

/**
 * Return escrow credits to buyer. Idempotent via by_reversed_transaction.
 */
export async function refundMarketplaceEscrow(
  ctx: MutationCtx,
  args: {
    holdId: Id<"platformEscrowHolds">;
    reason?: string;
    adminId?: Id<"users">;
  },
): Promise<Id<"creditTransactions"> | null> {
  const hold = await ctx.db.get("platformEscrowHolds", args.holdId);
  if (!hold) {
    throw new Error("Escrow hold not found");
  }
  if (hold.status === "refunded" && hold.refundCreditTransactionId) {
    return hold.refundCreditTransactionId;
  }
  if (hold.status === "released") {
    throw new Error("Cannot refund escrow that was already released");
  }
  if (hold.status !== "held") {
    throw new Error(`Cannot refund escrow in status ${hold.status}`);
  }
  const existing = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", hold.holdCreditTransactionId),
    )
    .unique();
  if (existing) {
    if (existing.kind !== "marketplace_escrow_refund") {
      throw new Error("Escrow hold was already reversed");
    }
    if (!hold.refundCreditTransactionId) {
      await ctx.db.patch(hold._id, {
        status: "refunded",
        refundCreditTransactionId: existing._id,
        updatedAt: Date.now(),
      });
    }
    return existing._id;
  }
  const account = await requireBillingAccount(ctx, hold.buyerUserId);
  const now = Date.now();
  const balanceAfter = account.creditBalance + hold.credits;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    creditBalanceHigh: nextCreditBalanceHigh({
      previousHigh: account.creditBalanceHigh,
      balanceAfter,
      mode: "max",
    }),
    updatedAt: now,
  });
  const refundId = await ctx.db.insert("creditTransactions", {
    userId: hold.buyerUserId,
    billingAccountId: account._id,
    kind: "marketplace_escrow_refund",
    amount: hold.credits,
    balanceAfter,
    marketplaceJobId: hold.jobId,
    reversesTransactionId: hold.holdCreditTransactionId,
    reason: args.reason ?? "Marketplace escrow refund",
    adminId: args.adminId,
    createdAt: now,
  });
  await ctx.db.patch(hold._id, {
    status: "refunded",
    refundCreditTransactionId: refundId,
    updatedAt: now,
  });
  return refundId;
}
