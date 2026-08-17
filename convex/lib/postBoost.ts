import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nextCreditBalanceHigh } from "./creditBalanceHigh";
import { getCreditPriceCents } from "./marketplaceEscrow";

/** Face amount sent on each Boost. Studio ledger is credits (TT$0.50 / credit). */
export const POST_BOOST_AMOUNT_CENTS = 5;
export const POST_BOOST_UNDO_MS = 60_000;

const DEFAULT_CREDIT_PRICE_CENTS = 50;

export function boostCreditsForPrice(
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  const price = Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid credit price");
  }
  return POST_BOOST_AMOUNT_CENTS / price;
}

function boostNeedMessage(): string {
  const amount = POST_BOOST_AMOUNT_CENTS / 100;
  const needTtd = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Not enough balance. Top up at least $${needTtd} TTD to boost.`;
}

async function getOrCreateBillingAccount(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"billingAccounts">> {
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("billingAccounts", {
    userId,
    creditBalance: 0,
    reservedCredits: 0,
    createdAt: now,
    updatedAt: now,
  });
  const account = await ctx.db.get("billingAccounts", id);
  if (!account) throw new Error("Billing account not found");
  return account;
}

export async function viewerHasActiveBoost(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  postId: Id<"profilePosts">,
): Promise<boolean> {
  const row = await ctx.db
    .query("profileBoosts")
    .withIndex("by_user_post_status", (q) =>
      q.eq("userId", viewerId).eq("postId", postId).eq("status", "active"),
    )
    .first();
  return Boolean(row);
}

export async function transferPostBoost(
  ctx: MutationCtx,
  args: {
    senderUserId: Id<"users">;
    receiverUserId: Id<"users">;
    postId: Id<"profilePosts">;
  },
): Promise<{
  boostId: Id<"profileBoosts">;
  amountCredits: number;
  undoUntil: number;
}> {
  if (args.senderUserId === args.receiverUserId) {
    throw new Error("You can't boost your own post.");
  }
  if (await viewerHasActiveBoost(ctx, args.senderUserId, args.postId)) {
    throw new Error("You already boosted this post.");
  }
  const creditPriceCents = await getCreditPriceCents(ctx);
  const amountCredits = boostCreditsForPrice(creditPriceCents);
  const sender = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", args.senderUserId))
    .unique();
  if (!sender || sender.creditBalance + 1e-9 < amountCredits) {
    throw new Error(boostNeedMessage());
  }
  const receiver = await getOrCreateBillingAccount(ctx, args.receiverUserId);
  const now = Date.now();

  const senderAfter = sender.creditBalance - amountCredits;
  await ctx.db.patch(sender._id, {
    creditBalance: senderAfter,
    updatedAt: now,
  });
  const senderTxnId = await ctx.db.insert("creditTransactions", {
    userId: args.senderUserId,
    billingAccountId: sender._id,
    kind: "boost_sent",
    amount: -amountCredits,
    balanceAfter: senderAfter,
    reason: "Post boost",
    createdAt: now,
  });

  const receiverAfter = receiver.creditBalance + amountCredits;
  await ctx.db.patch(receiver._id, {
    creditBalance: receiverAfter,
    creditBalanceHigh: nextCreditBalanceHigh({
      previousHigh: receiver.creditBalanceHigh,
      balanceAfter: receiverAfter,
      mode: "max",
    }),
    updatedAt: now,
  });
  const receiverTxnId = await ctx.db.insert("creditTransactions", {
    userId: args.receiverUserId,
    billingAccountId: receiver._id,
    kind: "boost_received",
    amount: amountCredits,
    balanceAfter: receiverAfter,
    reason: "Post boost",
    createdAt: now,
  });

  const boostId = await ctx.db.insert("profileBoosts", {
    userId: args.senderUserId,
    postId: args.postId,
    createdAt: now,
    amountCredits,
    senderTransactionId: senderTxnId,
    receiverTransactionId: receiverTxnId,
    status: "active",
  });
  return {
    boostId,
    amountCredits,
    undoUntil: now + POST_BOOST_UNDO_MS,
  };
}

export async function reversePostBoost(
  ctx: MutationCtx,
  args: {
    boostId: Id<"profileBoosts">;
    requesterUserId: Id<"users">;
  },
): Promise<{ amountCredits: number }> {
  const boost = await ctx.db.get("profileBoosts", args.boostId);
  if (!boost || boost.userId !== args.requesterUserId) {
    throw new Error("Nothing to undo.");
  }
  if (boost.status !== "active") {
    throw new Error("Nothing to undo.");
  }
  const now = Date.now();
  if (now > boost.createdAt + POST_BOOST_UNDO_MS) {
    throw new Error("Too late to undo.");
  }

  const senderTxn = await ctx.db.get(
    "creditTransactions",
    boost.senderTransactionId,
  );
  const receiverTxn = await ctx.db.get(
    "creditTransactions",
    boost.receiverTransactionId,
  );
  if (!senderTxn || !receiverTxn) {
    throw new Error("Nothing to undo.");
  }

  const amountCredits = boost.amountCredits;
  const senderAccount = await ctx.db.get(
    "billingAccounts",
    senderTxn.billingAccountId,
  );
  const receiverAccount = await ctx.db.get(
    "billingAccounts",
    receiverTxn.billingAccountId,
  );
  if (!senderAccount) throw new Error("Billing account not found");

  if (senderAccount.userId !== args.requesterUserId) {
    throw new Error("Nothing to undo.");
  }

  const senderAfter = senderAccount.creditBalance + amountCredits;
  await ctx.db.patch(senderAccount._id, {
    creditBalance: senderAfter,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: senderAccount.userId,
    billingAccountId: senderAccount._id,
    kind: "refunded",
    amount: amountCredits,
    balanceAfter: senderAfter,
    reversesTransactionId: senderTxn._id,
    reason: "Boost undo",
    createdAt: now,
  });

  if (receiverAccount) {
    const receiverAfter = Math.max(0, receiverAccount.creditBalance - amountCredits);
    await ctx.db.patch(receiverAccount._id, {
      creditBalance: receiverAfter,
      updatedAt: now,
    });
    await ctx.db.insert("creditTransactions", {
      userId: receiverAccount.userId,
      billingAccountId: receiverAccount._id,
      kind: "refunded",
      amount: -(receiverAccount.creditBalance - receiverAfter),
      balanceAfter: receiverAfter,
      reversesTransactionId: receiverTxn._id,
      reason: "Boost undo",
      createdAt: now,
    });
  }

  await ctx.db.patch(boost._id, {
    status: "undone",
    undoneAt: now,
  });
  return { amountCredits };
}
