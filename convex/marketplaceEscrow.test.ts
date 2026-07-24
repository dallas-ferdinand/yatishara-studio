/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  creditsFromOfferPriceCents,
  holdMarketplaceEscrow,
  refundMarketplaceEscrow,
  releaseMarketplaceEscrow,
} from "./lib/marketplaceEscrow";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedBuyerWithCredits(
  t: ReturnType<typeof convexTest>,
  credits = 200,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const buyerId = await ctx.db.insert("users", {
      name: "Buyer",
      email: "buyer@example.com",
      phone: "+18685550111",
      phoneVerifiedAt: now,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    const sellerUserId = await ctx.db.insert("users", {
      name: "Seller",
      email: "seller@example.com",
      phone: "+18685550112",
      phoneVerifiedAt: now,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    const accountId = await ctx.db.insert("billingAccounts", {
      userId: buyerId,
      creditBalance: credits,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("billingAccounts", {
      userId: sellerUserId,
      creditBalance: 50,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    });
    const sellerId = await ctx.db.insert("marketplaceSellers", {
      userId: sellerUserId,
      status: "approved",
      businessName: "Test Studio",
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const offerId = await ctx.db.insert("marketplaceOffers", {
      sellerId,
      sellerUserId,
      title: "15s Ad Pack",
      slug: "15s-ad-pack",
      description: "Cartoon ad package",
      priceCents: 5000,
      status: "published",
      deliveryDays: 5,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { buyerId, sellerUserId, sellerId, offerId, accountId };
  });
}

describe("marketplace escrow helpers", () => {
  test("creditsFromOfferPriceCents ceil-divides by credit price", () => {
    expect(creditsFromOfferPriceCents(5000, 50)).toBe(100);
    expect(creditsFromOfferPriceCents(5050, 50)).toBe(101);
  });

  test("hold debits balance without touching reservedCredits", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedBuyerWithCredits(t, 150);

    const result = await t.run(async (ctx) => {
      const now = Date.now();
      const jobId = await ctx.db.insert("marketplaceJobs", {
        offerId: seeded.offerId,
        sellerId: seeded.sellerId,
        sellerUserId: seeded.sellerUserId,
        buyerUserId: seeded.buyerId,
        priceCredits: 100,
        priceCents: 5000,
        creditPriceCents: 50,
        status: "pending_payment",
        createdAt: now,
        updatedAt: now,
      });
      return await holdMarketplaceEscrow(ctx, {
        buyerUserId: seeded.buyerId,
        jobId,
        credits: 100,
      });
    });

    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      expect(account?.creditBalance).toBe(50);
      expect(account?.reservedCredits).toBe(0);
      const hold = await ctx.db.get(result.holdId);
      expect(hold?.status).toBe("held");
      expect(hold?.credits).toBe(100);
      const tx = await ctx.db.get(result.holdTransactionId);
      expect(tx?.kind).toBe("marketplace_escrow_hold");
      expect(tx?.amount).toBe(-100);
    });
  });

  test("release is idempotent and does not restore buyer balance", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedBuyerWithCredits(t, 100);

    const { holdId } = await t.run(async (ctx) => {
      const now = Date.now();
      const jobId = await ctx.db.insert("marketplaceJobs", {
        offerId: seeded.offerId,
        sellerId: seeded.sellerId,
        sellerUserId: seeded.sellerUserId,
        buyerUserId: seeded.buyerId,
        priceCredits: 100,
        priceCents: 5000,
        creditPriceCents: 50,
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      });
      return await holdMarketplaceEscrow(ctx, {
        buyerUserId: seeded.buyerId,
        jobId,
        credits: 100,
      });
    });

    const first = await t.run(async (ctx) =>
      releaseMarketplaceEscrow(ctx, { holdId }),
    );
    const second = await t.run(async (ctx) =>
      releaseMarketplaceEscrow(ctx, { holdId }),
    );
    expect(first).toEqual(second);

    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      expect(account?.creditBalance).toBe(0);
      const hold = await ctx.db.get(holdId);
      expect(hold?.status).toBe("released");
      const releaseTx = await ctx.db.get(first);
      expect(releaseTx?.kind).toBe("marketplace_escrow_release");
      expect(releaseTx?.amount).toBe(0);
    });
  });

  test("refund restores buyer balance once", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedBuyerWithCredits(t, 100);

    const { holdId } = await t.run(async (ctx) => {
      const now = Date.now();
      const jobId = await ctx.db.insert("marketplaceJobs", {
        offerId: seeded.offerId,
        sellerId: seeded.sellerId,
        sellerUserId: seeded.sellerUserId,
        buyerUserId: seeded.buyerId,
        priceCredits: 100,
        priceCents: 5000,
        creditPriceCents: 50,
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      });
      return await holdMarketplaceEscrow(ctx, {
        buyerUserId: seeded.buyerId,
        jobId,
        credits: 100,
      });
    });

    await t.run(async (ctx) => refundMarketplaceEscrow(ctx, { holdId }));
    await t.run(async (ctx) => refundMarketplaceEscrow(ctx, { holdId }));

    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      expect(account?.creditBalance).toBe(100);
      const hold = await ctx.db.get(holdId);
      expect(hold?.status).toBe("refunded");
      const reversals = await ctx.db
        .query("creditTransactions")
        .withIndex("by_reversed_transaction", (q) =>
          q.eq("reversesTransactionId", hold!.holdCreditTransactionId),
        )
        .collect();
      expect(reversals).toHaveLength(1);
      expect(reversals[0]?.kind).toBe("marketplace_escrow_refund");
    });
  });

  test("auto-accept completes old delivered jobs", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedBuyerWithCredits(t, 100);

    await t.run(async (ctx) => {
      const now = Date.now();
      const jobId = await ctx.db.insert("marketplaceJobs", {
        offerId: seeded.offerId,
        sellerId: seeded.sellerId,
        sellerUserId: seeded.sellerUserId,
        buyerUserId: seeded.buyerId,
        priceCredits: 100,
        priceCents: 5000,
        creditPriceCents: 50,
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      });
      const { holdId, holdTransactionId } = await holdMarketplaceEscrow(ctx, {
        buyerUserId: seeded.buyerId,
        jobId,
        credits: 100,
      });
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      await ctx.db.patch(jobId, {
        status: "delivered",
        escrowHoldId: holdId,
        escrowCreditTransactionId: holdTransactionId,
        deliveredAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
      });
    });

    const result = await t.mutation(internal.marketplace.autoAcceptDeliveredJobs, {});
    expect(result.accepted).toBe(1);

    await t.run(async (ctx) => {
      const jobs = await ctx.db.query("marketplaceJobs").collect();
      expect(jobs[0]?.status).toBe("completed");
      const payouts = await ctx.db.query("sellerPayouts").collect();
      expect(payouts).toHaveLength(1);
      expect(payouts[0]?.status).toBe("owed");
      expect(payouts[0]?.amountCents).toBe(5000);
      const account = await ctx.db.get(seeded.accountId);
      expect(account?.creditBalance).toBe(0);
    });
  });
});
