import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
  ensurePurchasedAssetsFolder,
} from "./folders";
import { getMarketplaceSellerForUser, requireApprovedSeller } from "./lib/auth";
import {
  assetStorePriceCredits,
  assetStoreSplit,
  sellerPayoutCentsFromCredits,
} from "./lib/assetStorePricing";
import { buildAssetPath, signBunnyFullUrl } from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { audioCreditCost } from "./lib/generationPricing";
import { getCreditPriceCents } from "./lib/marketplaceEscrow";
import { applyStorageBytesDelta, assertUploadsAllowed } from "./lib/storageBilling";

const listingAudioType = v.union(v.literal("music"), v.literal("sfx"));
const listingStatus = v.union(
  v.literal("listed"),
  v.literal("unlisted"),
  v.literal("removed"),
);

const listingCardReturn = v.object({
  _id: v.id("assetListings"),
  title: v.string(),
  description: v.optional(v.string()),
  audioType: listingAudioType,
  durationSeconds: v.optional(v.number()),
  generateCredits: v.number(),
  priceCredits: v.number(),
  priceCents: v.number(),
  purchaseCount: v.number(),
  sellerBusinessName: v.string(),
  sellerUsername: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
  ownedBuyerAssetId: v.optional(v.id("assets")),
  listedAt: v.optional(v.number()),
});

async function sellerPublicLabel(
  ctx: QueryCtx | MutationCtx,
  seller: Doc<"marketplaceSellers">,
): Promise<{ businessName: string; username?: string }> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", seller.userId))
    .unique();
  return {
    businessName: seller.businessName,
    username: profile?.username,
  };
}

async function resolveListableAudio(
  ctx: MutationCtx | QueryCtx,
  asset: Doc<"assets">,
): Promise<{
  audioType: "music" | "sfx";
  durationSeconds?: number;
  generateCredits: number;
}> {
  if (asset.kind !== "audio" || asset.deletedAt || asset.purgedAt) {
    throw new Error("Only ready audio assets can be listed.");
  }
  if (asset.storageStatus !== undefined && asset.storageStatus !== "ready") {
    throw new Error("Asset is not ready yet.");
  }
  if (!asset.bunnyPath) {
    throw new Error("Asset has no media file.");
  }
  if (asset.licenseKind === "purchased_network") {
    throw new Error("Purchased Network audio cannot be re-listed.");
  }

  let audioType: "music" | "sfx" | undefined;
  let durationSeconds = asset.durationSeconds;
  if (asset.sourceGenerationJobId) {
    const job = await ctx.db.get("generationJobs", asset.sourceGenerationJobId);
    if (job?.audioType === "music" || job?.audioType === "sfx") {
      audioType = job.audioType;
    }
    if (durationSeconds == null && job?.durationSeconds != null) {
      durationSeconds = job.durationSeconds;
    }
  }
  if (!audioType) {
    throw new Error("Only Studio-generated music or sound effects can be listed.");
  }

  const generateCredits = audioCreditCost({
    audioType,
    durationSeconds: durationSeconds ?? undefined,
  });
  return { audioType, durationSeconds, generateCredits };
}

async function workspaceRootId(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"folders"> | undefined> {
  const top = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_parent", (q) =>
      q.eq("ownerId", userId).eq("parentId", undefined),
    )
    .collect();
  return top.find(
    (folder) =>
      !folder.deletedAt &&
      folder.systemKind !== "messages" &&
      folder.systemKind !== "purchased_assets",
  )?._id;
}

async function toListingCard(
  ctx: QueryCtx,
  listing: Doc<"assetListings">,
  args: {
    expiresUnix: number;
    buyerUserId?: Id<"users">;
  },
): Promise<{
  _id: Id<"assetListings">;
  title: string;
  description?: string;
  audioType: "music" | "sfx";
  durationSeconds?: number;
  generateCredits: number;
  priceCredits: number;
  priceCents: number;
  purchaseCount: number;
  sellerBusinessName: string;
  sellerUsername?: string;
  previewUrl?: string;
  ownedBuyerAssetId?: Id<"assets">;
  listedAt?: number;
}> {
  const seller = await ctx.db.get("marketplaceSellers", listing.sellerId);
  const label = seller
    ? await sellerPublicLabel(ctx, seller)
    : { businessName: "Seller", username: undefined };
      const creditPriceCents = await getCreditPriceCents(ctx);
  let previewUrl: string | undefined;
  const source = await ctx.db.get("assets", listing.sourceAssetId);
  if (source?.bunnyPath && !source.deletedAt && !source.purgedAt) {
    previewUrl = await signBunnyFullUrl(
      source.bunnyPath,
      args.expiresUnix,
      "audio",
    );
  }
  let ownedBuyerAssetId: Id<"assets"> | undefined;
  if (args.buyerUserId) {
    const purchase = await ctx.db
      .query("assetPurchases")
      .withIndex("by_buyer_and_listing", (q) =>
        q.eq("buyerUserId", args.buyerUserId!).eq("listingId", listing._id),
      )
      .unique();
    ownedBuyerAssetId = purchase?.buyerAssetId;
  }
  return {
    _id: listing._id,
    title: listing.title,
    description: listing.description,
    audioType: listing.audioType,
    durationSeconds: listing.durationSeconds,
    generateCredits: listing.generateCredits,
    priceCredits: listing.priceCredits,
    priceCents: Math.round(listing.priceCredits * creditPriceCents),
    purchaseCount: listing.purchaseCount,
    sellerBusinessName: label.businessName,
    sellerUsername: label.username,
    previewUrl,
    ownedBuyerAssetId,
    listedAt: listing.listedAt,
  };
}

export const quoteListPrice = authedQuery({
  args: { assetId: v.id("assets") },
  returns: v.object({
    audioType: listingAudioType,
    durationSeconds: v.optional(v.number()),
    generateCredits: v.number(),
    priceCredits: v.number(),
    priceCents: v.number(),
    canList: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
      const creditPriceCents = await getCreditPriceCents(ctx);
    if (!asset || asset.ownerId !== ctx.user._id) {
      return {
        audioType: "sfx" as const,
        generateCredits: 0,
        priceCredits: 0,
        priceCents: 0,
        canList: false,
        reason: "Asset not found",
      };
    }
    const seller = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (!seller || seller.status !== "approved") {
      return {
        audioType: "sfx" as const,
        generateCredits: 0,
        priceCredits: 0,
        priceCents: 0,
        canList: false,
        reason: "Approved Creative Network seller required",
      };
    }
    try {
      const resolved = await resolveListableAudio(ctx, asset);
      const priceCredits = assetStorePriceCredits(resolved.generateCredits);
      return {
        audioType: resolved.audioType,
        durationSeconds: resolved.durationSeconds,
        generateCredits: resolved.generateCredits,
        priceCredits,
        priceCents: Math.round(priceCredits * creditPriceCents),
        canList: true,
      };
    } catch (error) {
      return {
        audioType: "sfx" as const,
        generateCredits: 0,
        priceCredits: 0,
        priceCents: 0,
        canList: false,
        reason: error instanceof Error ? error.message : "Cannot list",
      };
    }
  },
});

export const listMyListings = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("assetListings"),
      sourceAssetId: v.id("assets"),
      title: v.string(),
      audioType: listingAudioType,
      status: listingStatus,
      priceCredits: v.number(),
      priceCents: v.number(),
      purchaseCount: v.number(),
      durationSeconds: v.optional(v.number()),
      listedAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
      const creditPriceCents = await getCreditPriceCents(ctx);
    const rows = await ctx.db
      .query("assetListings")
      .withIndex("by_seller_user", (q) => q.eq("sellerUserId", ctx.user._id))
      .collect();
    return rows
      .filter((row) => row.status !== "removed")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        _id: row._id,
        sourceAssetId: row.sourceAssetId,
        title: row.title,
        audioType: row.audioType,
        status: row.status,
        priceCredits: row.priceCredits,
        priceCents: Math.round(row.priceCredits * creditPriceCents),
        purchaseCount: row.purchaseCount,
        durationSeconds: row.durationSeconds,
        listedAt: row.listedAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const browseListings = authedQuery({
  args: {
    audioType: v.optional(listingAudioType),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    expiresUnix: v.number(),
  },
  returns: v.array(listingCardReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 48, 1), 100);
    const search = args.search?.trim().toLowerCase();
    let rows: Doc<"assetListings">[];
    if (args.audioType) {
      rows = await ctx.db
        .query("assetListings")
        .withIndex("by_audio_type_and_status", (q) =>
          q.eq("audioType", args.audioType!).eq("status", "listed"),
        )
        .order("desc")
        .take(limit * 3);
    } else {
      rows = await ctx.db
        .query("assetListings")
        .withIndex("by_status_and_listed", (q) => q.eq("status", "listed"))
        .order("desc")
        .take(limit * 3);
    }
    const filtered = search
      ? rows.filter(
          (row) =>
            row.title.toLowerCase().includes(search) ||
            (row.description?.toLowerCase().includes(search) ?? false),
        )
      : rows;
    const out = [];
    for (const listing of filtered.slice(0, limit)) {
      out.push(
        await toListingCard(ctx, listing, {
          expiresUnix: args.expiresUnix,
          buyerUserId: ctx.user._id,
        }),
      );
    }
    return out;
  },
});

export const getListing = authedQuery({
  args: {
    listingId: v.id("assetListings"),
    expiresUnix: v.number(),
  },
  returns: v.union(listingCardReturn, v.null()),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing || listing.status !== "listed") return null;
    return await toListingCard(ctx, listing, {
      expiresUnix: args.expiresUnix,
      buyerUserId: ctx.user._id,
    });
  },
});

export const listOnNetwork = authedMutation({
  args: {
    assetId: v.id("assets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.id("assetListings"),
  handler: async (ctx, args) => {
    const { user, seller } = await requireApprovedSeller(ctx);
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== user._id) {
      throw new Error("Asset not found");
    }
    const resolved = await resolveListableAudio(ctx, asset);
    const priceCredits = assetStorePriceCredits(resolved.generateCredits);
    const title =
      args.title?.trim() ||
      asset.name.replace(/\.[^.]+$/, "").trim() ||
      (resolved.audioType === "music" ? "Music" : "Sound effect");
    const description = args.description?.trim() || undefined;
    const now = Date.now();

    const existing = await ctx.db
      .query("assetListings")
      .withIndex("by_source_asset", (q) => q.eq("sourceAssetId", asset._id))
      .unique();
    if (existing) {
      if (existing.sellerUserId !== user._id) {
        throw new Error("This asset is already listed by another seller");
      }
      await ctx.db.patch(existing._id, {
        title: title.slice(0, 120),
        description,
        audioType: resolved.audioType,
        durationSeconds: resolved.durationSeconds,
        generateCredits: resolved.generateCredits,
        priceCredits,
        status: "listed",
        listedAt: existing.listedAt ?? now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("assetListings", {
      sellerId: seller._id,
      sellerUserId: user._id,
      sourceAssetId: asset._id,
      audioType: resolved.audioType,
      title: title.slice(0, 120),
      description,
      durationSeconds: resolved.durationSeconds,
      generateCredits: resolved.generateCredits,
      priceCredits,
      status: "listed",
      purchaseCount: 0,
      listedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const unlistFromNetwork = authedMutation({
  args: { listingId: v.id("assetListings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing || listing.sellerUserId !== ctx.user._id) {
      throw new Error("Listing not found");
    }
    await ctx.db.patch(listing._id, {
      status: "unlisted",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Debit buyer, create pending copy + purchase + payout, return paths for the action.
 */
export const preparePurchase = authedMutation({
  args: { listingId: v.id("assetListings") },
  returns: v.object({
    purchaseId: v.id("assetPurchases"),
    buyerAssetId: v.id("assets"),
    sourceBunnyPath: v.string(),
    destBunnyPath: v.string(),
    mimeType: v.string(),
    alreadyOwned: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing || listing.status !== "listed") {
      throw new Error("Listing is not available");
    }
    if (listing.sellerUserId === ctx.user._id) {
      throw new Error("You already own this track as the seller");
    }

    const existing = await ctx.db
      .query("assetPurchases")
      .withIndex("by_buyer_and_listing", (q) =>
        q.eq("buyerUserId", ctx.user._id).eq("listingId", listing._id),
      )
      .unique();
    if (existing) {
      const buyerAsset = await ctx.db.get("assets", existing.buyerAssetId);
      if (buyerAsset?.bunnyPath) {
        return {
          purchaseId: existing._id,
          buyerAssetId: existing.buyerAssetId,
          sourceBunnyPath: buyerAsset.bunnyPath,
          destBunnyPath: buyerAsset.bunnyPath,
          mimeType: buyerAsset.mimeType,
          alreadyOwned: true,
        };
      }
    }

    const source = await ctx.db.get("assets", listing.sourceAssetId);
    if (
      !source ||
      source.deletedAt ||
      source.purgedAt ||
      !source.bunnyPath ||
      (source.storageStatus !== undefined && source.storageStatus !== "ready")
    ) {
      throw new Error("Listing media is unavailable");
    }

    await assertUploadsAllowed(ctx, ctx.user._id);

    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    if (!account) throw new Error("Billing account not found");
    const priceCredits = listing.priceCredits;
    const creditPriceCents = await getCreditPriceCents(ctx);
    if (account.creditBalance < priceCredits) {
      const needCents = Math.round(priceCredits * creditPriceCents);
      const needTtd = (needCents / 100).toLocaleString(undefined, {
        minimumFractionDigits: Number.isInteger(needCents / 100) ? 0 : 2,
        maximumFractionDigits: 2,
      });
      throw new Error(
        `Not enough balance. Top up at least $${needTtd} TTD to buy this track.`,
      );
    }

    const { platformCredits, sellerCredits } = assetStoreSplit(priceCredits);
    const sellerPayoutCents = sellerPayoutCentsFromCredits(
      sellerCredits,
      creditPriceCents,
    );

    const rootId = await workspaceRootId(ctx, ctx.user._id);
    const purchasedFolderId = await ensurePurchasedAssetsFolder(
      ctx,
      ctx.user._id,
      rootId,
    );

    const now = Date.now();
    const balanceAfter = account.creditBalance - priceCredits;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });

    const filename =
      source.name.trim() ||
      (listing.audioType === "music" ? "music.mp3" : "sfx.mp3");
    const buyerAssetId = await ctx.db.insert("assets", {
      ownerId: ctx.user._id,
      folderId: purchasedFolderId,
      name: listing.title.slice(0, 120),
      kind: "audio",
      mimeType: source.mimeType || "audio/mpeg",
      storageStatus: "pending",
      durationSeconds: listing.durationSeconds ?? source.durationSeconds,
      sourceListingId: listing._id,
      licenseKind: "purchased_network",
      createdAt: now,
      updatedAt: now,
    });
    const destBunnyPath = buildAssetPath({
      userId: ctx.user._id,
      folderId: purchasedFolderId,
      assetId: buyerAssetId,
      filename,
    });

    const creditTransactionId = await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "asset_purchase",
      amount: -priceCredits,
      balanceAfter,
      reason: `Creative Network: ${listing.title.slice(0, 80)}`,
      createdAt: now,
    });

    const purchaseId = await ctx.db.insert("assetPurchases", {
      listingId: listing._id,
      buyerUserId: ctx.user._id,
      sellerUserId: listing.sellerUserId,
      sellerId: listing.sellerId,
      priceCredits,
      platformCredits,
      sellerCredits,
      creditPriceCents,
      sellerPayoutCents,
      buyerAssetId,
      creditTransactionId,
      createdAt: now,
    });

    await ctx.db.patch(creditTransactionId, {
      assetPurchaseId: purchaseId,
    });

    await ctx.db.insert("sellerPayouts", {
      sellerUserId: listing.sellerUserId,
      assetPurchaseId: purchaseId,
      amountCents: sellerPayoutCents,
      status: "owed",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(listing._id, {
      purchaseCount: listing.purchaseCount + 1,
      updatedAt: now,
    });

    return {
      purchaseId,
      buyerAssetId,
      sourceBunnyPath: source.bunnyPath,
      destBunnyPath,
      mimeType: source.mimeType || "audio/mpeg",
      alreadyOwned: false,
    };
  },
});

export const finalizePurchaseCopy = authedMutation({
  args: {
    purchaseId: v.id("assetPurchases"),
    bunnyPath: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get("assetPurchases", args.purchaseId);
    if (!purchase || purchase.buyerUserId !== ctx.user._id) {
      throw new Error("Purchase not found");
    }
    const asset = await ctx.db.get("assets", purchase.buyerAssetId);
    if (!asset || asset.ownerId !== ctx.user._id) {
      throw new Error("Buyer asset not found");
    }
    if (asset.storageStatus === "ready" && asset.bunnyPath) {
      return asset._id;
    }
    const now = Date.now();
    const prevBytes = asset.byteSize ?? 0;
    await ctx.db.patch(asset._id, {
      bunnyPath: args.bunnyPath,
      byteSize: args.byteSize,
      mimeType: args.mimeType,
      storageStatus: "ready",
      updatedAt: now,
    });
    const delta = Math.max(0, args.byteSize - prevBytes);
    if (delta > 0) {
      await applyStorageBytesDelta(ctx, {
        userId: ctx.user._id,
        deltaBytes: delta,
        reason: "Creative Network purchase copy",
      });
    }
    return asset._id;
  },
});

export const failPurchaseCopy = authedMutation({
  args: {
    purchaseId: v.id("assetPurchases"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get("assetPurchases", args.purchaseId);
    if (!purchase || purchase.buyerUserId !== ctx.user._id) {
      throw new Error("Purchase not found");
    }
    const asset = await ctx.db.get("assets", purchase.buyerAssetId);
    if (asset && asset.storageStatus !== "ready") {
      await ctx.db.patch(asset._id, {
        storageStatus: "failed",
        updatedAt: Date.now(),
      });
    }
    // Refund if we never delivered a ready copy.
    if (!asset?.bunnyPath || asset.storageStatus !== "ready") {
      const account = await ctx.db
        .query("billingAccounts")
        .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
        .unique();
      if (account) {
        const now = Date.now();
        const balanceAfter = account.creditBalance + purchase.priceCredits;
        await ctx.db.patch(account._id, {
          creditBalance: balanceAfter,
          updatedAt: now,
        });
        await ctx.db.insert("creditTransactions", {
          userId: ctx.user._id,
          billingAccountId: account._id,
          kind: "refunded",
          amount: purchase.priceCredits,
          balanceAfter,
          assetPurchaseId: purchase._id,
          reversesTransactionId: purchase.creditTransactionId,
          reason: `Purchase copy failed: ${args.error.slice(0, 120)}`,
          createdAt: now,
        });
      }
      const payout = await ctx.db
        .query("sellerPayouts")
        .withIndex("by_asset_purchase", (q) =>
          q.eq("assetPurchaseId", purchase._id),
        )
        .unique();
      if (payout && payout.status === "owed") {
        await ctx.db.patch(payout._id, {
          status: "paid",
          paidAt: Date.now(),
          adminNote: "Voided — purchase copy failed; buyer refunded",
          updatedAt: Date.now(),
        });
      }
      const listing = await ctx.db.get("assetListings", purchase.listingId);
      if (listing && listing.purchaseCount > 0) {
        await ctx.db.patch(listing._id, {
          purchaseCount: listing.purchaseCount - 1,
          updatedAt: Date.now(),
        });
      }
    }
    return null;
  },
});

/** Finalize after successful Bunny copy (called from Node action). */
export const finalizePurchaseCopyInternal = internalMutation({
  args: {
    purchaseId: v.id("assetPurchases"),
    buyerUserId: v.id("users"),
    bunnyPath: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get("assetPurchases", args.purchaseId);
    if (!purchase || purchase.buyerUserId !== args.buyerUserId) {
      throw new Error("Purchase not found");
    }
    const asset = await ctx.db.get("assets", purchase.buyerAssetId);
    if (!asset || asset.ownerId !== args.buyerUserId) {
      throw new Error("Buyer asset not found");
    }
    if (asset.storageStatus === "ready" && asset.bunnyPath) {
      return asset._id;
    }
    const now = Date.now();
    const prevBytes = asset.byteSize ?? 0;
    await ctx.db.patch(asset._id, {
      bunnyPath: args.bunnyPath,
      byteSize: args.byteSize,
      mimeType: args.mimeType,
      storageStatus: "ready",
      updatedAt: now,
    });
    const delta = Math.max(0, args.byteSize - prevBytes);
    if (delta > 0) {
      await applyStorageBytesDelta(ctx, {
        userId: args.buyerUserId,
        deltaBytes: delta,
        reason: "Creative Network purchase copy",
      });
    }
    return asset._id;
  },
});