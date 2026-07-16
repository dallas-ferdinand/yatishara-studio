/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
]);

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      name: "Payment Tester",
      email: "payments@example.com",
      phone: "+18685550123",
      phoneVerifiedAt: now,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function seedPaywisePayment(
  t: ReturnType<typeof convexTest>,
  options: { credits?: number; amountCents?: number } = {},
) {
  const userId = await seedUser(t);
  return await t.run(async (ctx) => {
    const now = Date.now();
    const accountId = await ctx.db.insert("billingAccounts", {
      userId,
      creditBalance: 0,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    });
    const paymentId = await ctx.db.insert("payments", {
      userId,
      method: "paywise",
      status: "pending",
      amountCents: options.amountCents ?? 5_000,
      creditsGranted: options.credits ?? 100,
      externalPaymentId: "pw-payment-1",
      callbackToken: "callback-secret",
      statusCheckAttempts: 0,
      nextStatusCheckAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, accountId, paymentId };
  });
}

describe("PayWise billing invariants", () => {
  test("replaying a paid status grants credits exactly once", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    const args = {
      paymentId: seeded.paymentId,
      expectedExternalPaymentId: "pw-payment-1",
      providerPaymentDetailsId: "pw-payment-1",
      providerStatus: "sandbox-paid",
      normalizedStatus: "paid" as const,
      providerAmountCents: 5_000,
      providerCurrency: "TTD",
    };

    const first = await t.mutation(internal.billing.applyPaywiseStatusCheck, args);
    const replay = await t.mutation(internal.billing.applyPaywiseStatusCheck, args);

    expect(first.granted).toBe(true);
    expect(replay.granted).toBe(false);
    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      const transactions = await ctx.db
        .query("creditTransactions")
        .withIndex("by_payment", (q) => q.eq("paymentId", seeded.paymentId))
        .collect();
      expect(account?.creditBalance).toBe(100);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.kind).toBe("top_up");
    });
  });

  test("amount and currency mismatches stay recoverable without granting", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    const result = await t.mutation(internal.billing.applyPaywiseStatusCheck, {
      paymentId: seeded.paymentId,
      expectedExternalPaymentId: "pw-payment-1",
      providerPaymentDetailsId: "pw-payment-1",
      providerStatus: "sandbox-paid",
      normalizedStatus: "paid",
      providerAmountCents: 4_999,
      providerCurrency: "USD",
    });

    expect(result.status).toBe("needs_review");
    await t.run(async (ctx) => {
      expect((await ctx.db.get(seeded.accountId))?.creditBalance).toBe(0);
      expect((await ctx.db.get(seeded.paymentId))?.nextStatusCheckAt).toBeTypeOf("number");
    });
  });

  test("provider identity mismatch is rejected", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    await expect(
      t.mutation(internal.billing.applyPaywiseStatusCheck, {
        paymentId: seeded.paymentId,
        expectedExternalPaymentId: "pw-payment-1",
        providerPaymentDetailsId: "different-payment",
        providerStatus: "sandbox-paid",
        normalizedStatus: "paid",
        providerAmountCents: 5_000,
        providerCurrency: "TTD",
      }),
    ).rejects.toThrow("status response payment id mismatch");
  });

  test("claiming due work ignores legacy rows and leases PayWise rows", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("payments", {
        userId: seeded.userId,
        method: "bank",
        status: "pending",
        amountCents: 5_000,
        nextStatusCheckAt: now - 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    const claimed = await t.mutation(internal.billing.claimDuePaywisePayments, {
      now: Date.now(),
      limit: 20,
    });
    expect(claimed.map((row) => row._id)).toEqual([seeded.paymentId]);
    expect(
      await t.mutation(internal.billing.claimDuePaywisePayments, {
        now: Date.now(),
        limit: 20,
      }),
    ).toHaveLength(0);
  });

  test("status-check failures advance attempts and release the lease", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    await t.mutation(internal.billing.claimDuePaywisePayments, {
      now: Date.now(),
      limit: 20,
    });
    await t.mutation(internal.billing.recordPaywiseStatusCheckFailure, {
      paymentId: seeded.paymentId,
      expectedExternalPaymentId: "pw-payment-1",
      reason: "network unavailable",
    });

    await t.run(async (ctx) => {
      const payment = await ctx.db.get(seeded.paymentId);
      expect(payment?.statusCheckAttempts).toBe(1);
      expect(payment?.reconciliationLeaseUntil).toBeUndefined();
      expect(payment?.nextStatusCheckAt).toBeGreaterThan(Date.now());
    });
  });

  test("callback tokens are validated and callback metadata is persisted", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPaywisePayment(t);
    const rejected = await t.mutation(internal.billing.enqueuePaywiseCallback, {
      paymentId: seeded.paymentId,
      token: "wrong-secret",
      endpoint: "notify",
      method: "POST",
      requestId: "request-1",
      bodySha256: "abc",
      receivedAt: Date.now(),
    });
    const accepted = await t.mutation(internal.billing.enqueuePaywiseCallback, {
      paymentId: seeded.paymentId,
      token: "callback-secret",
      endpoint: "callback",
      method: "POST",
      requestId: "request-2",
      bodySha256: "def",
      receivedAt: Date.now(),
    });

    expect(rejected.accepted).toBe(false);
    expect(accepted.accepted).toBe(true);
    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("paywiseCallbackEvents")
        .withIndex("by_payment", (q) => q.eq("paymentId", seeded.paymentId))
        .collect();
      expect(events.map((event) => event.accepted)).toEqual([false, true]);
    });
  });

  test("checkout idempotency preserves one local payment", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const args = {
      userId,
      clientRequestId: "stable-client-request",
      amountCents: 5_000,
      creditsRequested: 100,
    };
    const first = await t.mutation(internal.billing.preparePaywiseCheckout, args);
    const replay = await t.mutation(internal.billing.preparePaywiseCheckout, args);
    expect(replay.paymentId).toBe(first.paymentId);

    await expect(
      t.mutation(internal.billing.preparePaywiseCheckout, {
        ...args,
        amountCents: 10_000,
        creditsRequested: 200,
      }),
    ).rejects.toThrow("different top-up");
  });

  test("one provider payment id cannot attach to two local payments", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const first = await t.mutation(internal.billing.preparePaywiseCheckout, {
      userId,
      clientRequestId: "request-one",
      amountCents: 5_000,
      creditsRequested: 100,
    });
    const second = await t.mutation(internal.billing.preparePaywiseCheckout, {
      userId,
      clientRequestId: "request-two",
      amountCents: 5_000,
      creditsRequested: 100,
    });
    await t.mutation(internal.billing.attachPaywiseCheckout, {
      paymentId: first.paymentId,
      externalPaymentId: "provider-shared",
      checkoutUrl: "https://checkout.paywise.co/one",
    });
    await expect(
      t.mutation(internal.billing.attachPaywiseCheckout, {
        paymentId: second.paymentId,
        externalPaymentId: "provider-shared",
        checkoutUrl: "https://checkout.paywise.co/two",
      }),
    ).rejects.toThrow();
  });
});

describe("credit ledger invariants", () => {
  test("spent transactions can only be refunded once", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const accountId = await ctx.db.insert("billingAccounts", {
        userId,
        creditBalance: 90,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      });
      const transactionId = await ctx.db.insert("creditTransactions", {
        userId,
        billingAccountId: accountId,
        kind: "spent",
        amount: -10,
        balanceAfter: 90,
        createdAt: now,
      });
      return { accountId, transactionId };
    });

    const args = { userId, transactionId: seeded.transactionId };
    await t.mutation(internal.generation.refundCreditTransactionForUser, args);
    await t.mutation(internal.generation.refundCreditTransactionForUser, args);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(seeded.accountId))?.creditBalance).toBe(100);
      const refunds = await ctx.db
        .query("creditTransactions")
        .withIndex("by_reversed_transaction", (q) =>
          q.eq("reversesTransactionId", seeded.transactionId),
        )
        .collect();
      expect(refunds).toHaveLength(1);
    });
  });

  test("generation completion is idempotent and settles the original reservation amount", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedGenerationReservation(t, 7);
    await t.mutation(internal.generation.completeWithOutputs, {
      jobId: seeded.jobId,
      assetIds: [],
    });
    await t.mutation(internal.generation.completeWithOutputs, {
      jobId: seeded.jobId,
      assetIds: [],
    });

    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      const reversals = await ctx.db
        .query("creditTransactions")
        .withIndex("by_reversed_transaction", (q) =>
          q.eq("reversesTransactionId", seeded.reservationId),
        )
        .collect();
      expect(account?.reservedCredits).toBe(0);
      expect(account?.creditBalance).toBe(93);
      expect(reversals).toHaveLength(1);
      expect(reversals[0]?.kind).toBe("spent");
    });
  });

  test("generation failure refunds the original reservation once", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedGenerationReservation(t, 7);
    await t.mutation(internal.generation.failJob, {
      jobId: seeded.jobId,
      error: "provider failure",
    });
    await t.mutation(internal.generation.failJob, {
      jobId: seeded.jobId,
      error: "provider failure replay",
    });

    await t.run(async (ctx) => {
      const account = await ctx.db.get(seeded.accountId);
      const reversals = await ctx.db
        .query("creditTransactions")
        .withIndex("by_reversed_transaction", (q) =>
          q.eq("reversesTransactionId", seeded.reservationId),
        )
        .collect();
      expect(account?.creditBalance).toBe(100);
      expect(account?.reservedCredits).toBe(0);
      expect(reversals).toHaveLength(1);
      expect(reversals[0]?.amount).toBe(7);
    });
  });
});

async function seedGenerationReservation(t: ReturnType<typeof convexTest>, amount: number) {
  const userId = await seedUser(t);
  return await t.run(async (ctx) => {
    const now = Date.now();
    const folderId = await ctx.db.insert("folders", {
      ownerId: userId,
      name: "Test",
      icon: "folder",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const threadId = await ctx.db.insert("generationThreads", {
      ownerId: userId,
      linkedFolderId: folderId,
      title: "Test",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const presetId = await ctx.db.insert("stylePresets", {
      name: "Test",
      slug: `test-${now}`,
      kind: "any",
      systemInstructions: "Test",
      enabled: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const accountId = await ctx.db.insert("billingAccounts", {
      userId,
      creditBalance: 100 - amount,
      reservedCredits: amount,
      createdAt: now,
      updatedAt: now,
    });
    const reservationId = await ctx.db.insert("creditTransactions", {
      userId,
      billingAccountId: accountId,
      kind: "reserved",
      amount: -amount,
      balanceAfter: 100 - amount,
      createdAt: now,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: userId,
      threadId,
      saveFolderId: folderId,
      mode: "image",
      tier: "image",
      resolvedModel: "test-model",
      stylePresetId: presetId,
      userPrompt: "Test",
      stage: "queued",
      reservedCreditTransactionId: reservationId,
      createdAt: now,
      updatedAt: now,
    });
    return { accountId, jobId, reservationId };
  });
}
