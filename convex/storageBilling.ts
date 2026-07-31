import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { authedQuery } from "./lib/customFunctions";
import {
  OUTSTANDING_BLOCK_DAYS,
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
  applyStorageBytesDelta,
  beginAssetPurge,
  chargeMonthlyStorage,
  getStorageRow,
  outstandingDays,
  setStorageBytesFromAssets,
  settleOutstandingStorage,
  storageUploadsBlocked,
  sumBillableBytes,
} from "./lib/storageBilling";
import {
  BILLING_DAY_UTC_HOUR,
  STORAGE_TTD_PER_GIB_MONTH,
  monthlyRateTtd,
  projectedMonthlyChargeTtd,
} from "./lib/storagePricing";

const MONTHLY_BATCH_SIZE = 50;
const RECONCILE_BATCH_SIZE = 10;
const PURGE_BATCH_SIZE = 25;
const BACKFILL_BATCH_SIZE = 25;

/** Most recent 1st-of-month billing moment (00:00 AST = 04:00 UTC) at or before `now`. */
export function currentBillingPeriodStart(now: number): number {
  const at = new Date(now);
  const thisMonth = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    1,
    BILLING_DAY_UTC_HOUR,
  );
  if (thisMonth <= now) return thisMonth;
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1, BILLING_DAY_UTC_HOUR);
}

function nextBillingMoment(periodStart: number): number {
  const next = new Date(periodStart);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.getTime();
}

export const getMyStorage = authedQuery({
  args: {},
  returns: v.object({
    usedBytes: v.number(),
    trashBytes: v.number(),
    ttdPerGibMonth: v.number(),
    monthlyRateTtd: v.number(),
    projectedChargeTtd: v.number(),
    outstandingCredits: v.number(),
    outstandingDays: v.number(),
    uploadsBlocked: v.boolean(),
    blockAfterDays: v.number(),
    trashRetentionDays: v.number(),
    nextChargeAt: v.number(),
  }),
  handler: async (ctx) => {
    const row = await getStorageRow(ctx, ctx.user._id);
    const now = Date.now();
    // Trash still occupies the zone, so it is billed until purged.
    const trashed = await ctx.db
      .query("assets")
      .withIndex("by_owner_and_deleted", (q) =>
        q.eq("ownerId", ctx.user._id).gt("deletedAt", 0),
      )
      .collect();
    const trashBytes = sumBillableBytes(trashed);
    const usedBytes = row?.currentBytes ?? 0;
    return {
      usedBytes,
      trashBytes,
      ttdPerGibMonth: STORAGE_TTD_PER_GIB_MONTH,
      monthlyRateTtd: monthlyRateTtd(usedBytes),
      projectedChargeTtd: projectedMonthlyChargeTtd(usedBytes),
      outstandingCredits: row?.outstandingCredits ?? 0,
      outstandingDays: outstandingDays(row ?? null, now),
      uploadsBlocked: storageUploadsBlocked(row ?? null, now),
      blockAfterDays: OUTSTANDING_BLOCK_DAYS,
      trashRetentionDays: TRASH_RETENTION_DAYS,
      nextChargeAt: nextBillingMoment(currentBillingPeriodStart(now)),
    };
  },
});


// --- Studio HTTP/MCP ForApi (Wave 4) ---
// Intended route: GET /api/v1/account/storage -> getMyStorageForApi (scope: read)

const storageSummaryReturn = v.object({
  usedBytes: v.number(),
  trashBytes: v.number(),
  ttdPerGibMonth: v.number(),
  monthlyRateTtd: v.number(),
  projectedChargeTtd: v.number(),
  outstandingCredits: v.number(),
  outstandingDays: v.number(),
  uploadsBlocked: v.boolean(),
  blockAfterDays: v.number(),
  trashRetentionDays: v.number(),
  nextChargeAt: v.number(),
});

export const getMyStorageForApi = internalQuery({
  args: {
    userId: v.id("users"),
    /** Client-supplied clock; avoid Date.now() inside the query. */
    now: v.number(),
  },
  returns: storageSummaryReturn,
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const row = await getStorageRow(ctx, args.userId);
    const now = args.now;
    const trashed = await ctx.db
      .query("assets")
      .withIndex("by_owner_and_deleted", (q) =>
        q.eq("ownerId", args.userId).gt("deletedAt", 0),
      )
      .collect();
    const trashBytes = sumBillableBytes(trashed);
    const usedBytes = row?.currentBytes ?? 0;
    return {
      usedBytes,
      trashBytes,
      ttdPerGibMonth: STORAGE_TTD_PER_GIB_MONTH,
      monthlyRateTtd: monthlyRateTtd(usedBytes),
      projectedChargeTtd: projectedMonthlyChargeTtd(usedBytes),
      outstandingCredits: row?.outstandingCredits ?? 0,
      outstandingDays: outstandingDays(row ?? null, now),
      uploadsBlocked: storageUploadsBlocked(row ?? null, now),
      blockAfterDays: OUTSTANDING_BLOCK_DAYS,
      trashRetentionDays: TRASH_RETENTION_DAYS,
      nextChargeAt: nextBillingMoment(currentBillingPeriodStart(now)),
    };
  },
});

/**
 * Billing day: charge 95% of each account's live snapshot. Idempotent — a row is
 * only picked up when it has not been charged for the current period yet.
 */
export const chargeMonthly = internalMutation({
  args: { periodStart: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const periodStart = args.periodStart ?? currentBillingPeriodStart(Date.now());
    const due = await ctx.db
      .query("storageBilling")
      .withIndex("by_last_monthly_charge", (q) =>
        q.lt("lastMonthlyChargeAt", periodStart),
      )
      .take(MONTHLY_BATCH_SIZE);
    for (const row of due) {
      await chargeMonthlyStorage(ctx, row, periodStart);
    }
    if (due.length === MONTHLY_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.storageBilling.chargeMonthly, {
        periodStart,
      });
    }
    return due.length;
  },
});

export const settleOutstanding = internalMutation({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await settleOutstandingStorage(ctx, args.userId);
  },
});

/**
 * Nightly drift repair: recompute each account's byte total from its assets.
 * Never charges — the 1st is the only billing moment.
 */
export const reconcileStorageTotals = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("storageBilling").paginate({
      cursor: args.cursor ?? null,
      numItems: RECONCILE_BATCH_SIZE,
    });
    let fixed = 0;
    for (const row of page.page) {
      const before = row.currentBytes;
      const after = await setStorageBytesFromAssets(ctx, row.userId);
      if (after !== before) fixed += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.storageBilling.reconcileStorageTotals, {
        cursor: page.continueCursor,
      });
    }
    return fixed;
  },
});

/**
 * One-shot seed: create/refresh a storage row for every user that has assets.
 * Run once after enabling billing so libraries already on Bunny are metered
 * before the next 1st — no mid-month charge for the backfill itself.
 */
export const backfillStorageTotals = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({
      cursor: args.cursor ?? null,
      numItems: BACKFILL_BATCH_SIZE,
    });
    let touched = 0;
    for (const user of page.page) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .take(1);
      if (assets.length === 0) continue;
      await setStorageBytesFromAssets(ctx, user._id);
      touched += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.storageBilling.backfillStorageTotals, {
        cursor: page.continueCursor,
      });
    }
    return touched;
  },
});

/** Trash older than the retention window is purged from Bunny so billing drops. */
export const purgeExpiredTrash = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    const expired = await ctx.db
      .query("assets")
      .withIndex("by_deleted_at", (q) => q.gt("deletedAt", 0).lte("deletedAt", cutoff))
      .take(PURGE_BATCH_SIZE);
    let purged = 0;
    for (const asset of expired) {
      if (asset.purgedAt) continue;
      await beginAssetPurge(ctx, asset);
      purged += 1;
    }
    return purged;
  },
});

/** Called by the purge action once the Bunny objects are gone. */
export const clearPurgedAssetPaths = internalMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset) return null;
    await ctx.db.patch(asset._id, {
      bunnyPath: undefined,
      thumbnailPath: undefined,
      editProxyPath: undefined,
      editProxy1080Path: undefined,
      editProxyStatus: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Byte delta for flows that finish outside the mutation that wrote the bytes. */
export const applyBytesDelta = internalMutation({
  args: {
    userId: v.id("users"),
    deltaBytes: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyStorageBytesDelta(ctx, {
      userId: args.userId,
      deltaBytes: args.deltaBytes,
      reason: args.reason,
    });
    return null;
  },
});
