import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nextCreditBalanceHigh } from "./creditBalanceHigh";
import {
  creditsForCents,
  PLATFORM_FEE_SINK_KEY,
  POST_UNLOCK_UNDO_MS,
  splitUnlockCredits,
  unlockNeedMessage,
} from "./helpAnswer";
import { getCreditPriceCents } from "./marketplaceEscrow";

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

async function addPlatformFee(ctx: MutationCtx, feeCredits: number, now: number) {
  const existing = await ctx.db
    .query("platformFeeSinks")
    .withIndex("by_key", (q) => q.eq("key", PLATFORM_FEE_SINK_KEY))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      creditBalance: existing.creditBalance + feeCredits,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("platformFeeSinks", {
    key: PLATFORM_FEE_SINK_KEY,
    creditBalance: feeCredits,
    updatedAt: now,
  });
}

async function subtractPlatformFee(
  ctx: MutationCtx,
  feeCredits: number,
  now: number,
) {
  const existing = await ctx.db
    .query("platformFeeSinks")
    .withIndex("by_key", (q) => q.eq("key", PLATFORM_FEE_SINK_KEY))
    .unique();
  if (!existing) return;
  await ctx.db.patch(existing._id, {
    creditBalance: Math.max(0, existing.creditBalance - feeCredits),
    updatedAt: now,
  });
}

export async function viewerHasActiveUnlock(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  postId: Id<"profilePosts">,
): Promise<boolean> {
  const row = await ctx.db
    .query("profileUnlocks")
    .withIndex("by_user_post_status", (q) =>
      q.eq("userId", viewerId).eq("postId", postId).eq("status", "active"),
    )
    .first();
  return Boolean(row);
}

export async function viewerCanSeeHelpAnswerFull(
  ctx: QueryCtx | MutationCtx,
  args: {
    post: Doc<"profilePosts">;
    viewerId: Id<"users"> | null;
  },
): Promise<boolean> {
  if (args.post.postKind !== "help_answer") return true;
  if (!args.viewerId) return false;
  if (args.post.ownerId === args.viewerId) return true;
  return await viewerHasActiveUnlock(ctx, args.viewerId, args.post._id);
}

export async function transferHelpAnswerUnlock(
  ctx: MutationCtx,
  args: {
    senderUserId: Id<"users">;
    receiverUserId: Id<"users">;
    postId: Id<"profilePosts">;
    unlockPriceCents: number;
  },
): Promise<{
  unlockId: Id<"profileUnlocks">;
  amountCredits: number;
  undoUntil: number;
}> {
  if (args.senderUserId === args.receiverUserId) {
    throw new Error("You already have this value.");
  }
  if (await viewerHasActiveUnlock(ctx, args.senderUserId, args.postId)) {
    throw new Error("You already unlocked this value.");
  }
  const creditPriceCents = await getCreditPriceCents(ctx);
  const amountCredits = creditsForCents(args.unlockPriceCents, creditPriceCents);
  const { sellerCredits, feeCredits } = splitUnlockCredits(amountCredits);
  const sender = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", args.senderUserId))
    .unique();
  if (!sender || sender.creditBalance + 1e-9 < amountCredits) {
    throw new Error(unlockNeedMessage(args.unlockPriceCents));
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
    kind: "unlock_sent",
    amount: -sellerCredits,
    balanceAfter: senderAfter + feeCredits,
    reason: "Help answer unlock",
    createdAt: now,
  });
  const feeTxnId = await ctx.db.insert("creditTransactions", {
    userId: args.senderUserId,
    billingAccountId: sender._id,
    kind: "unlock_fee",
    amount: -feeCredits,
    balanceAfter: senderAfter,
    reason: "Help answer platform fee",
    createdAt: now,
  });
  await addPlatformFee(ctx, feeCredits, now);

  const receiverAfter = receiver.creditBalance + sellerCredits;
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
    kind: "unlock_received",
    amount: sellerCredits,
    balanceAfter: receiverAfter,
    reason: "Help answer unlock",
    createdAt: now,
  });

  const unlockId = await ctx.db.insert("profileUnlocks", {
    userId: args.senderUserId,
    postId: args.postId,
    createdAt: now,
    amountCredits,
    sellerCredits,
    feeCredits,
    senderTransactionId: senderTxnId,
    receiverTransactionId: receiverTxnId,
    feeTransactionId: feeTxnId,
    status: "active",
  });
  return {
    unlockId,
    amountCredits,
    undoUntil: now + POST_UNLOCK_UNDO_MS,
  };
}

export async function reverseHelpAnswerUnlock(
  ctx: MutationCtx,
  args: {
    unlockId: Id<"profileUnlocks">;
    requesterUserId: Id<"users">;
  },
): Promise<{ amountCredits: number; buyerAssetId?: Id<"assets"> }> {
  const unlock = await ctx.db.get("profileUnlocks", args.unlockId);
  if (!unlock || unlock.userId !== args.requesterUserId) {
    throw new Error("Nothing to undo.");
  }
  if (unlock.status !== "active") {
    throw new Error("Nothing to undo.");
  }
  const now = Date.now();
  if (now > unlock.createdAt + POST_UNLOCK_UNDO_MS) {
    throw new Error("Too late to undo.");
  }

  const senderTxn = await ctx.db.get(
    "creditTransactions",
    unlock.senderTransactionId,
  );
  const receiverTxn = await ctx.db.get(
    "creditTransactions",
    unlock.receiverTransactionId,
  );
  const feeTxn = await ctx.db.get("creditTransactions", unlock.feeTransactionId);
  if (!senderTxn || !receiverTxn || !feeTxn) {
    throw new Error("Nothing to undo.");
  }

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

  const amountCredits = unlock.amountCredits;
  const senderAfter = senderAccount.creditBalance + amountCredits;
  await ctx.db.patch(senderAccount._id, {
    creditBalance: senderAfter,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: senderAccount.userId,
    billingAccountId: senderAccount._id,
    kind: "refunded",
    amount: unlock.sellerCredits,
    balanceAfter: senderAfter - unlock.feeCredits,
    reversesTransactionId: senderTxn._id,
    reason: "Help answer unlock undo",
    createdAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: senderAccount.userId,
    billingAccountId: senderAccount._id,
    kind: "refunded",
    amount: unlock.feeCredits,
    balanceAfter: senderAfter,
    reversesTransactionId: feeTxn._id,
    reason: "Help answer fee undo",
    createdAt: now,
  });
  await subtractPlatformFee(ctx, unlock.feeCredits, now);

  if (receiverAccount) {
    const receiverAfter = Math.max(
      0,
      receiverAccount.creditBalance - unlock.sellerCredits,
    );
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
      reason: "Help answer unlock undo",
      createdAt: now,
    });
  }

  await ctx.db.patch(unlock._id, {
    status: "undone",
    undoneAt: now,
  });
  return { amountCredits, buyerAssetId: unlock.buyerAssetId };
}
