/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  applyStorageBytesDelta,
  chargeMonthlyStorage,
  settleOutstandingStorage,
  storageUploadsBlocked,
} from "./lib/storageBilling";
import { BYTES_PER_GIB } from "./lib/storagePricing";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const gib = (n: number) => n * BYTES_PER_GIB;

async function seedAccount(t: ReturnType<typeof convexTest>, credits: number) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: "Storage Tester",
      email: "storage@example.com",
      phone: "18685550199",
      phoneVerifiedAt: now,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("billingAccounts", {
      userId,
      creditBalance: credits,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
}

async function readState(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const accounts = await ctx.db.query("billingAccounts").collect();
    const account = accounts.find((doc) => doc.userId === userId);
    const rows = await ctx.db.query("storageBilling").collect();
    const row = rows.find((doc) => doc.userId === userId);
    const allLedger = await ctx.db.query("creditTransactions").collect();
    const ledger = allLedger.filter((tx) => tx.userId === userId);
    return {
      balance: account?.creditBalance ?? 0,
      currentBytes: row?.currentBytes ?? 0,
      outstanding: row?.outstandingCredits ?? 0,
      outstandingSince: row?.outstandingSince,
      storageEntries: ledger.filter((tx) => tx.kind === "storage_charge"),
    };
  });
}

async function addBytes(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  deltaBytes: number,
) {
  await t.run(async (ctx) => {
    await applyStorageBytesDelta(ctx, {
      userId,
      deltaBytes,
      reason: "Storage added — test",
    });
  });
}

describe("storage byte deltas", () => {
  test("uploads only move the counter — no mid-month charge", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 10);
    await addBytes(t, userId, gib(2));
    const state = await readState(t, userId);
    expect(state.balance).toBe(10);
    expect(state.currentBytes).toBe(gib(2));
    expect(state.outstanding).toBe(0);
    expect(state.storageEntries).toHaveLength(0);
  });

  test("deletes lower the counter without touching the balance", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 10);
    await addBytes(t, userId, gib(2));
    await addBytes(t, userId, -gib(1.5));
    const state = await readState(t, userId);
    expect(state.currentBytes).toBe(gib(0.5));
    expect(state.balance).toBe(10);
    expect(state.storageEntries).toHaveLength(0);
  });
});

describe("outstanding balances", () => {
  test("monthly charge with an empty balance becomes outstanding", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 0);
    await addBytes(t, userId, gib(2));
    const periodStart = Date.UTC(2026, 7, 1, 4);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("storageBilling").collect();
      const row = rows.find((doc) => doc.userId === userId);
      if (!row) throw new Error("storage row missing");
      await chargeMonthlyStorage(ctx, row, periodStart);
    });
    const state = await readState(t, userId);
    // 2 GiB × TT$0.20 = TT$0.40 = 0.8 credits
    expect(state.balance).toBe(0);
    expect(state.outstanding).toBeCloseTo(0.8, 10);
    expect(state.outstandingSince).toBeTypeOf("number");
  });

  test("a partial balance is debited and only the shortfall is carried", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 0.3);
    await addBytes(t, userId, gib(2));
    const periodStart = Date.UTC(2026, 7, 1, 4);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("storageBilling").collect();
      const row = rows.find((doc) => doc.userId === userId);
      if (!row) throw new Error("storage row missing");
      await chargeMonthlyStorage(ctx, row, periodStart);
    });
    const state = await readState(t, userId);
    expect(state.balance).toBe(0);
    expect(state.outstanding).toBeCloseTo(0.5, 10);
  });

  test("a credit grant settles outstanding storage immediately", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 0);
    await addBytes(t, userId, gib(2));
    const periodStart = Date.UTC(2026, 7, 1, 4);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("storageBilling").collect();
      const row = rows.find((doc) => doc.userId === userId);
      if (!row) throw new Error("storage row missing");
      await chargeMonthlyStorage(ctx, row, periodStart);
    });
    let state = await readState(t, userId);
    expect(state.outstanding).toBeCloseTo(0.8, 10);

    await t.mutation(internal.billing.internalAdjustCreditsByPhone, {
      phone: "+18685550199",
      amount: 100,
      reason: "Top up",
    });
    state = await readState(t, userId);
    expect(state.outstanding).toBe(0);
    expect(state.outstandingSince).toBeUndefined();
    expect(state.balance).toBeCloseTo(99.2, 10);
  });

  test("uploads are blocked only after five days of debt", async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const owing = {
      _id: "row" as unknown as Id<"storageBilling">,
      outstandingCredits: 0.4,
      outstandingSince: now - 4 * day,
    } as never;
    const overdue = {
      _id: "row" as unknown as Id<"storageBilling">,
      outstandingCredits: 0.4,
      outstandingSince: now - 6 * day,
    } as never;
    expect(storageUploadsBlocked(owing, now)).toBe(false);
    expect(storageUploadsBlocked(overdue, now)).toBe(true);
    expect(storageUploadsBlocked(null, now)).toBe(false);
  });
});

describe("monthly charge", () => {
  test("bills the full snapshot rate on the 1st", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 10);
    await addBytes(t, userId, gib(10));
    const before = await readState(t, userId);

    const periodStart = Date.UTC(2026, 7, 1, 4);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("storageBilling").collect();
      const row = rows.find((doc) => doc.userId === userId);
      if (!row) throw new Error("storage row missing");
      await chargeMonthlyStorage(ctx, row, periodStart);
    });

    const state = await readState(t, userId);
    // 10 GiB × TT$0.20 = TT$2.00 = 4 credits
    expect(before.balance - state.balance).toBeCloseTo(4, 10);
    expect(state.storageEntries).toHaveLength(1);
    expect(state.storageEntries[0]?.reason).toBe("Monthly storage");
  });

  test("the cron only charges accounts that have not been billed for the period", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 100);
    await addBytes(t, userId, gib(10));
    const periodStart = Date.UTC(2026, 7, 1, 4);

    const first = await t.mutation(internal.storageBilling.chargeMonthly, {
      periodStart,
    });
    const balanceAfterFirst = (await readState(t, userId)).balance;
    const second = await t.mutation(internal.storageBilling.chargeMonthly, {
      periodStart,
    });

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect((await readState(t, userId)).balance).toBe(balanceAfterFirst);
  });

  test("settleOutstandingStorage is a no-op when nothing is owed", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAccount(t, 5);
    await addBytes(t, userId, gib(1));
    const paid = await t.run(async (ctx) => settleOutstandingStorage(ctx, userId));
    expect(paid).toBe(0);
  });
});
