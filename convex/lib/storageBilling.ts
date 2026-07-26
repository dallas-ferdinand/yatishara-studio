import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { monthlyCharge } from "./storagePricing";

/** Uploads stop once storage has been owed for this long. */
export const OUTSTANDING_BLOCK_DAYS = 5;
export const OUTSTANDING_BLOCK_MS = OUTSTANDING_BLOCK_DAYS * 24 * 60 * 60 * 1000;

/** Trash still sits on Bunny, so it is billed until this age, then purged. */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Credits are fractional to 0.01 — keep sums from drifting. */
export function roundCredits(credits: number): number {
  return Math.round(Number(credits) * 100) / 100;
}

/** Source media plus both edit proxies all occupy the storage zone. */
export function assetBillableBytes(asset: Doc<"assets">): number {
  return (
    Math.max(0, asset.byteSize ?? 0) +
    Math.max(0, asset.editProxyByteSize ?? 0) +
    Math.max(0, asset.editProxy1080ByteSize ?? 0)
  );
}

/**
 * Total billable bytes for a set of assets, counting each Bunny object once —
 * duplicates share a `bunnyPath` and so cost nothing extra.
 */
export function sumBillableBytes(assets: Doc<"assets">[]): number {
  const counted = new Set<string>();
  let total = 0;
  for (const asset of assets) {
    if (asset.purgedAt) continue;
    const key = asset.bunnyPath ?? `asset:${asset._id}`;
    if (counted.has(key)) continue;
    counted.add(key);
    total += assetBillableBytes(asset);
  }
  return total;
}

/** Every zone object owned by an asset, deduped (image thumbs reuse bunnyPath). */
export function assetStoragePaths(asset: Doc<"assets">): string[] {
  const paths = new Set<string>();
  for (const path of [
    asset.bunnyPath,
    asset.thumbnailPath,
    asset.editProxyPath,
    asset.editProxy1080Path,
  ]) {
    if (path) paths.add(path);
  }
  return [...paths];
}

export async function getStorageRow(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"storageBilling"> | null> {
  return await ctx.db
    .query("storageBilling")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function requireStorageRow(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"storageBilling">> {
  const existing = await getStorageRow(ctx, userId);
  if (existing) return existing;
  const now = Date.now();
  const rowId = await ctx.db.insert("storageBilling", {
    userId,
    currentBytes: 0,
    outstandingCredits: 0,
    // 0 so the row appears in by_last_monthly_charge and gets billed on the 1st.
    lastMonthlyChargeAt: 0,
    updatedAt: now,
  });
  const created = await ctx.db.get("storageBilling", rowId);
  if (!created) throw new Error("Storage billing row not found");
  return created;
}

async function requireBillingAccountId(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"billingAccounts">> {
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const accountId = await ctx.db.insert("billingAccounts", {
    userId,
    creditBalance: 0,
    reservedCredits: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get("billingAccounts", accountId);
  if (!created) throw new Error("Billing account not found");
  return created;
}

/**
 * Debit as much of `credits` as the balance covers and carry the rest as
 * outstanding. The balance never goes negative — outstanding is the debt.
 */
async function chargeStorageCredits(
  ctx: MutationCtx,
  args: { userId: Id<"users">; credits: number; reason: string },
): Promise<{ paid: number; outstanding: number }> {
  const owed = roundCredits(Math.max(0, args.credits));
  if (owed <= 0) return { paid: 0, outstanding: 0 };
  const account = await requireBillingAccountId(ctx, args.userId);
  const now = Date.now();
  const paid = roundCredits(Math.min(Math.max(0, account.creditBalance), owed));
  const shortfall = roundCredits(owed - paid);
  const balanceAfter = roundCredits(account.creditBalance - paid);
  if (paid > 0) {
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
  }
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    billingAccountId: account._id,
    kind: "storage_charge",
    amount: -paid,
    balanceAfter,
    reason:
      shortfall > 0
        ? `${args.reason} — ${shortfall} credits outstanding`
        : args.reason,
    createdAt: now,
  });
  if (shortfall > 0) {
    const row = await requireStorageRow(ctx, args.userId);
    await ctx.db.patch(row._id, {
      outstandingCredits: roundCredits(row.outstandingCredits + shortfall),
      outstandingSince: row.outstandingSince ?? now,
      updatedAt: now,
    });
  }
  return { paid, outstanding: shortfall };
}

/**
 * Move a user's storage total. Uploads and deletes never charge — the monthly
 * cron bills whatever is stored on the 1st. Runs in the same mutation as the
 * byte write so the counter cannot drift from the stored bytes.
 */
export async function applyStorageBytesDelta(
  ctx: MutationCtx,
  args: { userId: Id<"users">; deltaBytes: number; reason: string },
): Promise<void> {
  const delta = Math.round(Number(args.deltaBytes) || 0);
  if (delta === 0) return;
  const row = await requireStorageRow(ctx, args.userId);
  await ctx.db.patch(row._id, {
    currentBytes: Math.max(0, row.currentBytes + delta),
    updatedAt: Date.now(),
  });
}

/** Billing day: full monthly rate on the live snapshot. */
export async function chargeMonthlyStorage(
  ctx: MutationCtx,
  row: Doc<"storageBilling">,
  chargedAt: number,
): Promise<number> {
  const charge = monthlyCharge(row.currentBytes);
  await ctx.db.patch(row._id, {
    lastMonthlyChargeAt: chargedAt,
    updatedAt: chargedAt,
  });
  if (!charge.chargeable) return 0;
  await chargeStorageCredits(ctx, {
    userId: row.userId,
    credits: charge.credits,
    reason: "Monthly storage",
  });
  return charge.credits;
}

/**
 * Seed or refresh a user's byte counter from their assets. Used by backfill and
 * reconcile — never charges, so existing libraries start clean until the 1st.
 */
export async function setStorageBytesFromAssets(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const assets = await ctx.db
    .query("assets")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .collect();
  const actualBytes = sumBillableBytes(assets);
  const row = await requireStorageRow(ctx, userId);
  const patch: {
    currentBytes: number;
    updatedAt: number;
    lastMonthlyChargeAt?: number;
  } = {
    currentBytes: actualBytes,
    updatedAt: Date.now(),
  };
  // Older rows may lack this and would be invisible to the monthly index.
  if (row.lastMonthlyChargeAt == null) {
    patch.lastMonthlyChargeAt = 0;
  }
  if (row.currentBytes === actualBytes && row.lastMonthlyChargeAt != null) {
    return actualBytes;
  }
  await ctx.db.patch(row._id, patch);
  return actualBytes;
}

/** Pay down storage debt from available balance — called after every credit grant. */
export async function settleOutstandingStorage(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const row = await getStorageRow(ctx, userId);
  if (!row || row.outstandingCredits <= 0) return 0;
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!account || account.creditBalance <= 0) return 0;
  const paid = roundCredits(
    Math.min(account.creditBalance, row.outstandingCredits),
  );
  if (paid <= 0) return 0;
  const now = Date.now();
  const balanceAfter = roundCredits(account.creditBalance - paid);
  const remaining = roundCredits(row.outstandingCredits - paid);
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    updatedAt: now,
  });
  await ctx.db.patch(row._id, {
    outstandingCredits: remaining,
    outstandingSince: remaining > 0 ? row.outstandingSince : undefined,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId,
    billingAccountId: account._id,
    kind: "storage_charge",
    amount: -paid,
    balanceAfter,
    reason:
      remaining > 0
        ? `Outstanding storage settled — ${remaining} credits still owed`
        : "Outstanding storage settled",
    createdAt: now,
  });
  return paid;
}

/**
 * `assets.duplicate` copies the byte size but reuses the source `bunnyPath`, so
 * a duplicate occupies no extra storage and its objects belong to its siblings.
 */
export async function hasSiblingSharingStorage(
  ctx: QueryCtx | MutationCtx,
  asset: Doc<"assets">,
): Promise<boolean> {
  if (!asset.bunnyPath) return false;
  const sharing = await ctx.db
    .query("assets")
    .withIndex("by_bunny_path", (q) => q.eq("bunnyPath", asset.bunnyPath))
    .collect();
  return sharing.some((other) => other._id !== asset._id && !other.purgedAt);
}

/**
 * Hard delete: release the bytes now and hand the Bunny objects to the delete
 * action. The row is tombstoned instead of removed because documents, edits,
 * profile posts and deliverables all reference assets by id.
 */
export async function beginAssetPurge(
  ctx: MutationCtx,
  asset: Doc<"assets">,
): Promise<void> {
  if (asset.purgedAt) return;
  const now = Date.now();
  // A surviving duplicate still needs the objects, and never added bytes of its own.
  const shared = await hasSiblingSharingStorage(ctx, asset);
  const bytes = shared ? 0 : assetBillableBytes(asset);
  const paths = shared ? [] : assetStoragePaths(asset);
  await ctx.db.patch(asset._id, {
    purgedAt: now,
    deletedAt: asset.deletedAt ?? now,
    byteSize: undefined,
    editProxyByteSize: undefined,
    editProxy1080ByteSize: undefined,
    updatedAt: now,
  });
  if (bytes > 0) {
    await applyStorageBytesDelta(ctx, {
      userId: asset.ownerId,
      deltaBytes: -bytes,
      reason: "Storage freed",
    });
  }
  if (paths.length > 0) {
    await ctx.scheduler.runAfter(0, internal.storageActions.purgeAssetObjects, {
      assetId: asset._id,
      paths,
    });
  } else {
    await ctx.db.patch(asset._id, {
      bunnyPath: undefined,
      thumbnailPath: undefined,
      editProxyPath: undefined,
      editProxy1080Path: undefined,
      editProxyStatus: undefined,
      updatedAt: now,
    });
  }

  // Orphan DM bubbles that referenced this media — keep the message row.
  const dmHits = await ctx.db
    .query("dmMessages")
    .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
    .collect();
  for (const message of dmHits) {
    await ctx.db.patch(message._id, {
      assetId: undefined,
      audioStorageId: undefined,
      imageStorageId: undefined,
    });
  }
}

export function storageUploadsBlocked(
  row: Doc<"storageBilling"> | null,
  now: number,
): boolean {
  if (!row || row.outstandingCredits <= 0 || row.outstandingSince == null) {
    return false;
  }
  return now - row.outstandingSince >= OUTSTANDING_BLOCK_MS;
}

export function outstandingDays(
  row: Doc<"storageBilling"> | null,
  now: number,
): number {
  if (!row || row.outstandingCredits <= 0 || row.outstandingSince == null) {
    return 0;
  }
  return Math.floor((now - row.outstandingSince) / (24 * 60 * 60 * 1000));
}

/** Throws when storage has been owed past the grace period. */
export async function assertUploadsAllowed(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const row = await getStorageRow(ctx, userId);
  const now = Date.now();
  if (!storageUploadsBlocked(row, now)) return;
  throw new Error(
    `Storage payment outstanding for ${outstandingDays(row, now)} days — top up to resume uploads.`,
  );
}
