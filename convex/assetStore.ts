import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
  ensurePublicAssetsFolder,
  ensurePurchasedAssetsFolder,
} from "./folders";
import { getMarketplaceSellerForUser, requireApprovedSeller } from "./lib/auth";
import {
  assetStorePriceCredits,
  assetStoreSplit,
  sellerPayoutCentsFromCredits,
} from "./lib/assetStorePricing";
import { buildAssetPath, signBunnyFullUrl } from "./lib/bunny";
import {
  adminMutation,
  adminQuery,
  authedMutation,
  authedQuery,
} from "./lib/customFunctions";
import { audioCreditCost } from "./lib/generationPricing";
import { getCreditPriceCents } from "./lib/marketplaceEscrow";
import {
  applyListingProfitToStorageDebt,
  applyStorageBytesDelta,
  ASSET_STORE_STORAGE_DELIST_DAYS,
  ASSET_STORE_STORAGE_DELIST_MS,
  assertUploadsAllowed,
  getStorageRow,
  roundCredits,
} from "./lib/storageBilling";

const listingAudioType = v.union(v.literal("music"), v.literal("sfx"));
const listingStatus = v.union(
  v.literal("pending_review"),
  v.literal("listed"),
  v.literal("unlisted"),
  v.literal("rejected"),
  v.literal("removed"),
);

const listingViewerAccess = v.union(
  v.literal("owned"),
  v.literal("creator"),
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
  /** Usable studio asset id when the viewer already has access (purchase or creator). */
  ownedBuyerAssetId: v.optional(v.id("assets")),
  /** Distinguishes purchased license vs listing creator (no purchase needed). */
  viewerAccess: v.optional(listingViewerAccess),
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
  // listed_network (Public catalog copy) may be re-listed / refreshed.

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
      folder.systemKind !== "purchased_assets" &&
      folder.systemKind !== "public_assets",
  )?._id;
}

async function usableCreatorAssetId(
  ctx: QueryCtx,
  listing: Doc<"assetListings">,
  viewerUserId: Id<"users">,
): Promise<Id<"assets"> | undefined> {
  // Prefer the seller's working original; fall back to the Public catalog copy.
  const candidates: Id<"assets">[] = [];
  if (listing.originalAssetId) candidates.push(listing.originalAssetId);
  candidates.push(listing.sourceAssetId);
  for (const assetId of candidates) {
    const asset = await ctx.db.get("assets", assetId);
    if (
      asset &&
      asset.ownerId === viewerUserId &&
      !asset.deletedAt &&
      !asset.purgedAt &&
      asset.bunnyPath &&
      (asset.storageStatus === undefined || asset.storageStatus === "ready")
    ) {
      return asset._id;
    }
  }
  return undefined;
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
  viewerAccess?: "owned" | "creator";
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
  let viewerAccess: "owned" | "creator" | undefined;
  if (args.buyerUserId) {
    if (listing.sellerUserId === args.buyerUserId) {
      ownedBuyerAssetId = await usableCreatorAssetId(
        ctx,
        listing,
        args.buyerUserId,
      );
      if (ownedBuyerAssetId) {
        viewerAccess = "creator";
      }
    } else {
      const purchase = await ctx.db
        .query("assetPurchases")
        .withIndex("by_buyer_and_listing", (q) =>
          q.eq("buyerUserId", args.buyerUserId!).eq("listingId", listing._id),
        )
        .unique();
      ownedBuyerAssetId = purchase?.buyerAssetId;
      if (ownedBuyerAssetId) {
        viewerAccess = "owned";
      }
    }
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
    viewerAccess,
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
      originalAssetId: v.optional(v.id("assets")),
      title: v.string(),
      description: v.optional(v.string()),
      audioType: listingAudioType,
      status: listingStatus,
      priceCredits: v.number(),
      priceCents: v.number(),
      purchaseCount: v.number(),
      durationSeconds: v.optional(v.number()),
      submittedAt: v.optional(v.number()),
      listedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
      platformOwnedAt: v.optional(v.number()),
      releasedAt: v.optional(v.number()),
      profitBannedAt: v.optional(v.number()),
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
        originalAssetId: row.originalAssetId,
        title: row.title,
        description: row.description,
        audioType: row.audioType,
        status: row.status,
        priceCredits: row.priceCredits,
        priceCents: Math.round(row.priceCredits * creditPriceCents),
        purchaseCount: row.purchaseCount,
        durationSeconds: row.durationSeconds,
        submittedAt: row.submittedAt,
        listedAt: row.listedAt,
        rejectionReason: row.rejectionReason,
        platformOwnedAt: row.platformOwnedAt,
        releasedAt: row.releasedAt,
        profitBannedAt: row.profitBannedAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const myAssetStoreSummary = authedQuery({
  args: {},
  returns: v.object({
    listedCount: v.number(),
    pendingCount: v.number(),
    totalFundsCents: v.number(),
    monthProfitCents: v.number(),
  }),
  handler: async (ctx) => {
    const listings = await ctx.db
      .query("assetListings")
      .withIndex("by_seller_user", (q) => q.eq("sellerUserId", ctx.user._id))
      .collect();
    const listedCount = listings.filter((row) => row.status === "listed").length;
    const pendingCount = listings.filter(
      (row) => row.status === "pending_review",
    ).length;

    const purchases = await ctx.db
      .query("assetPurchases")
      .withIndex("by_seller", (q) => q.eq("sellerUserId", ctx.user._id))
      .collect();

    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    let totalFundsCents = 0;
    let monthProfitCents = 0;
    for (const purchase of purchases) {
      const gross = Math.round(purchase.priceCredits * purchase.creditPriceCents);
      totalFundsCents += gross;
      if (purchase.createdAt >= monthStart) {
        monthProfitCents += purchase.sellerPayoutCents;
      }
    }
    return { listedCount, pendingCount, totalFundsCents, monthProfitCents };
  },
});

export const getMyListingDetail = authedQuery({
  args: {
    listingId: v.id("assetListings"),
    expiresUnix: v.number(),
  },
  returns: v.union(
    v.object({
      _id: v.id("assetListings"),
      sourceAssetId: v.id("assets"),
      originalAssetId: v.optional(v.id("assets")),
      title: v.string(),
      description: v.optional(v.string()),
      audioType: listingAudioType,
      status: listingStatus,
      priceCredits: v.number(),
      priceCents: v.number(),
      purchaseCount: v.number(),
      durationSeconds: v.optional(v.number()),
      submittedAt: v.optional(v.number()),
      listedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
      platformOwnedAt: v.optional(v.number()),
      releasedAt: v.optional(v.number()),
      profitBannedAt: v.optional(v.number()),
      profitBanReason: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      canUnlist: v.boolean(),
      canRelease: v.boolean(),
      canResubmit: v.boolean(),
      orders: v.array(
        v.object({
          _id: v.id("assetPurchases"),
          createdAt: v.number(),
          priceCents: v.number(),
          sellerPayoutCents: v.number(),
          platformCents: v.number(),
          buyerLabel: v.string(),
        }),
      ),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing || listing.sellerUserId !== ctx.user._id) return null;
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
    const purchases = await ctx.db
      .query("assetPurchases")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .collect();
    purchases.sort((a, b) => b.createdAt - a.createdAt);
    const orders = [];
    for (const purchase of purchases) {
      const buyer = await ctx.db.get("users", purchase.buyerUserId);
      const platformCents = Math.round(
        purchase.platformCredits * purchase.creditPriceCents,
      );
      orders.push({
        _id: purchase._id,
        createdAt: purchase.createdAt,
        priceCents: Math.round(purchase.priceCredits * purchase.creditPriceCents),
        sellerPayoutCents: purchase.sellerPayoutCents,
        platformCents,
        buyerLabel: buyer?.name
          ? buyer.name
          : buyer?.email
            ? `${buyer.email.slice(0, 3)}…`
            : "Buyer",
      });
    }
    const platformOwned = Boolean(listing.platformOwnedAt);
    return {
      _id: listing._id,
      sourceAssetId: listing.sourceAssetId,
      originalAssetId: listing.originalAssetId,
      title: listing.title,
      description: listing.description,
      audioType: listing.audioType,
      status: listing.status,
      priceCredits: listing.priceCredits,
      priceCents: Math.round(listing.priceCredits * creditPriceCents),
      purchaseCount: listing.purchaseCount,
      durationSeconds: listing.durationSeconds,
      submittedAt: listing.submittedAt,
      listedAt: listing.listedAt,
      rejectionReason: listing.rejectionReason,
      platformOwnedAt: listing.platformOwnedAt,
      releasedAt: listing.releasedAt,
      profitBannedAt: listing.profitBannedAt,
      profitBanReason: listing.profitBanReason,
      previewUrl,
      canUnlist:
        !platformOwned &&
        listing.purchaseCount === 0 &&
        (listing.status === "listed" || listing.status === "pending_review"),
      canRelease:
        !platformOwned &&
        listing.status === "listed" &&
        listing.purchaseCount > 0,
      canResubmit:
        !platformOwned &&
        (listing.status === "rejected" || listing.status === "unlisted"),
      orders,
      updatedAt: listing.updatedAt,
    };
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

const listPrepareReturn = v.object({
  alreadyReady: v.boolean(),
  publicAssetId: v.id("assets"),
  originalAssetId: v.id("assets"),
  existingListingId: v.optional(v.id("assetListings")),
  sourceBunnyPath: v.optional(v.string()),
  destBunnyPath: v.optional(v.string()),
  mimeType: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  audioType: listingAudioType,
  durationSeconds: v.optional(v.number()),
  generateCredits: v.number(),
  priceCredits: v.number(),
});

/**
 * Prepare a locked Public-folder catalog copy for listing.
 * Client/action then Bunny-copies (unless alreadyReady) and commits the listing.
 */
export const prepareListOnNetwork = authedMutation({
  args: {
    assetId: v.id("assets"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  returns: listPrepareReturn,
  handler: async (ctx, args) => {
    const { user } = await requireApprovedSeller(ctx);
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== user._id) {
      throw new Error("Asset not found");
    }

    let originalAsset = asset;
    let publicAsset: Doc<"assets"> | null = null;
    let existingListing: Doc<"assetListings"> | null = null;

    if (asset.licenseKind === "listed_network") {
      publicAsset = asset;
      existingListing =
        (await ctx.db
          .query("assetListings")
          .withIndex("by_source_asset", (q) => q.eq("sourceAssetId", asset._id))
          .unique()) ?? null;
      if (existingListing?.originalAssetId) {
        const orig = await ctx.db.get("assets", existingListing.originalAssetId);
        if (orig && orig.ownerId === user._id) {
          originalAsset = orig;
        }
      }
    } else {
      existingListing =
        (await ctx.db
          .query("assetListings")
          .withIndex("by_original_asset", (q) =>
            q.eq("originalAssetId", asset._id),
          )
          .unique()) ??
        (await ctx.db
          .query("assetListings")
          .withIndex("by_source_asset", (q) => q.eq("sourceAssetId", asset._id))
          .unique()) ??
        null;
      if (existingListing) {
        if (existingListing.sellerUserId !== user._id) {
          throw new Error("This asset is already listed by another seller");
        }
        const src = await ctx.db.get("assets", existingListing.sourceAssetId);
        if (src?.licenseKind === "listed_network") {
          publicAsset = src;
        }
        if (existingListing.originalAssetId) {
          const orig = await ctx.db.get(
            "assets",
            existingListing.originalAssetId,
          );
          if (orig) originalAsset = orig;
        } else if (src && src.licenseKind !== "listed_network") {
          // Legacy listing pointed at the working original.
          originalAsset = src;
        }
      }
    }

    if (existingListing) {
      if (existingListing.sellerUserId !== user._id) {
        throw new Error("This asset is already listed by another seller");
      }
      if (existingListing.platformOwnedAt) {
        throw new Error("This listing was released to the platform");
      }
      if (existingListing.status === "pending_review") {
        throw new Error(
          "This asset is already in review. Wait for a decision before submitting again.",
        );
      }
      if (existingListing.status === "listed") {
        throw new Error(
          existingListing.purchaseCount > 0
            ? "This asset is live and has purchases. Release it to the platform instead of re-listing."
            : "This asset is already live. Unlist it before submitting again.",
        );
      }
      if (
        existingListing.status !== "rejected" &&
        existingListing.status !== "unlisted" &&
        existingListing.status !== "removed"
      ) {
        throw new Error("This asset cannot be submitted right now");
      }
    }

    const resolveTarget =
      publicAsset?.sourceGenerationJobId || publicAsset?.licenseKind === "listed_network"
        ? publicAsset!
        : originalAsset;
    const resolved = await resolveListableAudio(ctx, resolveTarget);
    const priceCredits = assetStorePriceCredits(resolved.generateCredits);
    const title = args.title?.trim();
    if (!title) {
      throw new Error("A display name is required to list this asset");
    }
    const description = args.description?.trim() || undefined;
    const mimeType =
      publicAsset?.mimeType || originalAsset.mimeType || "audio/mpeg";

    const publicReady =
      publicAsset &&
      publicAsset.bunnyPath &&
      !publicAsset.deletedAt &&
      !publicAsset.purgedAt &&
      (publicAsset.storageStatus === undefined ||
        publicAsset.storageStatus === "ready");

    if (publicReady && publicAsset) {
      return {
        alreadyReady: true,
        publicAssetId: publicAsset._id,
        originalAssetId: originalAsset._id,
        existingListingId: existingListing?._id,
        mimeType,
        title: title.slice(0, 120),
        description,
        audioType: resolved.audioType,
        durationSeconds: resolved.durationSeconds,
        generateCredits: resolved.generateCredits,
        priceCredits,
      };
    }

    const copyFrom =
      asset.licenseKind === "listed_network" ? asset : originalAsset;
    if (
      !copyFrom.bunnyPath ||
      copyFrom.deletedAt ||
      copyFrom.purgedAt ||
      (copyFrom.storageStatus !== undefined &&
        copyFrom.storageStatus !== "ready")
    ) {
      throw new Error("Listing media is unavailable");
    }

    await assertUploadsAllowed(ctx, user._id);

    const rootId = await workspaceRootId(ctx, user._id);
    const publicFolderId = await ensurePublicAssetsFolder(
      ctx,
      user._id,
      rootId,
    );
    const now = Date.now();

    let publicAssetId: Id<"assets">;
    if (
      publicAsset &&
      publicAsset.licenseKind === "listed_network" &&
      publicAsset.storageStatus !== "ready"
    ) {
      publicAssetId = publicAsset._id;
      await ctx.db.patch(publicAssetId, {
        folderId: publicFolderId,
        name: title.slice(0, 120),
        storageStatus: "pending",
        updatedAt: now,
      });
    } else {
      publicAssetId = await ctx.db.insert("assets", {
        ownerId: user._id,
        folderId: publicFolderId,
        name: title.slice(0, 120),
        kind: "audio",
        mimeType: copyFrom.mimeType || "audio/mpeg",
        storageStatus: "pending",
        durationSeconds: resolved.durationSeconds ?? copyFrom.durationSeconds,
        sourceGenerationJobId: copyFrom.sourceGenerationJobId,
        licenseKind: "listed_network",
        createdAt: now,
        updatedAt: now,
      });
    }

    const filename =
      copyFrom.name.trim() ||
      (resolved.audioType === "music" ? "music.mp3" : "sfx.mp3");
    const destBunnyPath = buildAssetPath({
      userId: user._id,
      folderId: publicFolderId,
      assetId: publicAssetId,
      filename,
    });

    return {
      alreadyReady: false,
      publicAssetId,
      originalAssetId: originalAsset._id,
      existingListingId: existingListing?._id,
      sourceBunnyPath: copyFrom.bunnyPath,
      destBunnyPath,
      mimeType: copyFrom.mimeType || "audio/mpeg",
      title: title.slice(0, 120),
      description,
      audioType: resolved.audioType,
      durationSeconds: resolved.durationSeconds,
      generateCredits: resolved.generateCredits,
      priceCredits,
    };
  },
});

export const finalizeListCopyInternal = internalMutation({
  args: {
    publicAssetId: v.id("assets"),
    sellerUserId: v.id("users"),
    bunnyPath: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.publicAssetId);
    if (
      !asset ||
      asset.ownerId !== args.sellerUserId ||
      asset.licenseKind !== "listed_network"
    ) {
      throw new Error("Public catalog asset not found");
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
        userId: args.sellerUserId,
        deltaBytes: delta,
        reason: "Creative Network Public catalog copy",
      });
    }
    return asset._id;
  },
});

export const failListCopy = authedMutation({
  args: {
    publicAssetId: v.id("assets"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.publicAssetId);
    if (
      !asset ||
      asset.ownerId !== ctx.user._id ||
      asset.licenseKind !== "listed_network"
    ) {
      throw new Error("Public catalog asset not found");
    }
    if (asset.storageStatus === "ready" && asset.bunnyPath) {
      return null;
    }
    const listing = await ctx.db
      .query("assetListings")
      .withIndex("by_source_asset", (q) => q.eq("sourceAssetId", asset._id))
      .unique();
    if (listing) {
      await ctx.db.patch(asset._id, {
        storageStatus: "failed",
        updatedAt: Date.now(),
      });
      return null;
    }
    // No listing yet — drop the pending Public row (bytes never billed).
    await ctx.db.delete(asset._id);
    return null;
  },
});

/** Insert or refresh listing after Public copy is ready. */
export const commitListOnNetwork = authedMutation({
  args: {
    publicAssetId: v.id("assets"),
    originalAssetId: v.id("assets"),
    existingListingId: v.optional(v.id("assetListings")),
    title: v.string(),
    description: v.optional(v.string()),
    audioType: listingAudioType,
    durationSeconds: v.optional(v.number()),
    generateCredits: v.number(),
    priceCredits: v.number(),
  },
  returns: v.id("assetListings"),
  handler: async (ctx, args) => {
    const { user, seller } = await requireApprovedSeller(ctx);
    const publicAsset = await ctx.db.get("assets", args.publicAssetId);
    if (
      !publicAsset ||
      publicAsset.ownerId !== user._id ||
      publicAsset.licenseKind !== "listed_network" ||
      !publicAsset.bunnyPath ||
      (publicAsset.storageStatus !== undefined &&
        publicAsset.storageStatus !== "ready")
    ) {
      throw new Error("Public catalog copy is not ready");
    }
    const original = await ctx.db.get("assets", args.originalAssetId);
    if (!original || original.ownerId !== user._id) {
      throw new Error("Original asset not found");
    }

    const now = Date.now();
    let existing: Doc<"assetListings"> | null = null;
    if (args.existingListingId) {
      existing = await ctx.db.get("assetListings", args.existingListingId);
    }
    if (!existing) {
      existing =
        (await ctx.db
          .query("assetListings")
          .withIndex("by_source_asset", (q) =>
            q.eq("sourceAssetId", args.publicAssetId),
          )
          .unique()) ??
        (await ctx.db
          .query("assetListings")
          .withIndex("by_original_asset", (q) =>
            q.eq("originalAssetId", args.originalAssetId),
          )
          .unique()) ??
        null;
    }
    if (!args.title.trim()) {
      throw new Error("A display name is required to list this asset");
    }

    if (existing) {
      if (existing.sellerUserId !== user._id) {
        throw new Error("This asset is already listed by another seller");
      }
      if (existing.platformOwnedAt) {
        throw new Error("This listing was released to the platform");
      }
      if (existing.status === "pending_review") {
        throw new Error("Submission is already in review");
      }
      if (existing.status === "listed") {
        throw new Error("Unlist before submitting again");
      }
      await ctx.db.patch(existing._id, {
        sourceAssetId: args.publicAssetId,
        originalAssetId: args.originalAssetId,
        title: args.title.slice(0, 120),
        description: args.description,
        audioType: args.audioType,
        durationSeconds: args.durationSeconds,
        generateCredits: args.generateCredits,
        priceCredits: args.priceCredits,
        status: "pending_review",
        submittedAt: now,
        rejectionReason: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
        profitBannedAt: undefined,
        profitBanReason: undefined,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("assetListings", {
      sellerId: seller._id,
      sellerUserId: user._id,
      sourceAssetId: args.publicAssetId,
      originalAssetId: args.originalAssetId,
      audioType: args.audioType,
      title: args.title.slice(0, 120),
      description: args.description,
      durationSeconds: args.durationSeconds,
      generateCredits: args.generateCredits,
      priceCredits: args.priceCredits,
      status: "pending_review",
      purchaseCount: 0,
      submittedAt: now,
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
    if (listing.platformOwnedAt) {
      throw new Error("Released listings cannot be unlisted");
    }
    if (listing.purchaseCount > 0) {
      throw new Error(
        "Assets with purchases cannot be unlisted. Release the listing to the platform instead.",
      );
    }
    if (
      listing.status !== "listed" &&
      listing.status !== "pending_review"
    ) {
      throw new Error("Only live or pending submissions can be withdrawn");
    }
    await ctx.db.patch(listing._id, {
      status: "unlisted",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Seller releases a sold listing to the platform — stays live, future profits = platform. */
export const releaseListingToPlatform = authedMutation({
  args: { listingId: v.id("assetListings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing || listing.sellerUserId !== ctx.user._id) {
      throw new Error("Listing not found");
    }
    if (listing.platformOwnedAt) {
      throw new Error("Already released to the platform");
    }
    if (listing.status !== "listed") {
      throw new Error("Only live listings can be released");
    }
    if (listing.purchaseCount < 1) {
      throw new Error("Release is for listings that have been purchased");
    }
    const now = Date.now();
    await ctx.db.patch(listing._id, {
      platformOwnedAt: now,
      releasedAt: now,
      updatedAt: now,
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
    if (listing.profitBannedAt && !listing.platformOwnedAt) {
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

    const split = assetStoreSplit(priceCredits);
    let platformCredits = split.platformCredits;
    let sellerCredits = split.sellerCredits;
    const platformOwned = Boolean(listing.platformOwnedAt);

    // Platform-owned / released listings: seller share stays with the platform.
    if (platformOwned) {
      platformCredits = priceCredits;
      sellerCredits = 0;
    } else {
      // Unpaid storage: auto-cover from seller share before payout.
      const appliedToStorage = await applyListingProfitToStorageDebt(
        ctx,
        listing.sellerUserId,
        sellerCredits,
      );
      if (appliedToStorage > 0) {
        sellerCredits = roundCredits(
          Math.max(0, sellerCredits - appliedToStorage),
        );
        platformCredits = roundCredits(priceCredits - sellerCredits);
      }
    }

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

    if (sellerPayoutCents > 0) {
      await ctx.db.insert("sellerPayouts", {
        sellerUserId: listing.sellerUserId,
        assetPurchaseId: purchaseId,
        amountCents: sellerPayoutCents,
        status: "owed",
        createdAt: now,
        updatedAt: now,
      });
    }

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

const adminListingFilter = v.union(
  v.literal("pending_review"),
  v.literal("listed"),
  v.literal("rejected"),
  v.literal("unlisted"),
  v.literal("removed"),
  v.literal("platform_owned"),
  v.literal("all"),
);

export const adminListAssetSubmissions = adminQuery({
  args: {
    filter: v.optional(adminListingFilter),
    expiresUnix: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("assetListings"),
      title: v.string(),
      description: v.optional(v.string()),
      audioType: listingAudioType,
      status: listingStatus,
      priceCents: v.number(),
      purchaseCount: v.number(),
      durationSeconds: v.optional(v.number()),
      sellerBusinessName: v.string(),
      sellerUserId: v.id("users"),
      previewUrl: v.optional(v.string()),
      submittedAt: v.optional(v.number()),
      listedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
      platformOwnedAt: v.optional(v.number()),
      profitBannedAt: v.optional(v.number()),
      profitBanReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const filter = args.filter ?? "pending_review";
    const creditPriceCents = await getCreditPriceCents(ctx);
    let rows: Doc<"assetListings">[];
    if (filter === "all") {
      rows = await ctx.db.query("assetListings").order("desc").take(200);
    } else if (filter === "platform_owned") {
      const listed = await ctx.db
        .query("assetListings")
        .withIndex("by_status", (q) => q.eq("status", "listed"))
        .order("desc")
        .take(200);
      rows = listed.filter((row) => Boolean(row.platformOwnedAt));
    } else {
      rows = await ctx.db
        .query("assetListings")
        .withIndex("by_status_and_submitted", (q) => q.eq("status", filter))
        .order("desc")
        .take(150);
      if (rows.length === 0) {
        rows = (
          await ctx.db
            .query("assetListings")
            .withIndex("by_status", (q) => q.eq("status", filter))
            .order("desc")
            .take(150)
        ).sort((a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt));
      }
    }
    const out = [];
    for (const listing of rows) {
      const seller = await ctx.db.get("marketplaceSellers", listing.sellerId);
      let previewUrl: string | undefined;
      const source = await ctx.db.get("assets", listing.sourceAssetId);
      if (source?.bunnyPath && !source.deletedAt && !source.purgedAt) {
        previewUrl = await signBunnyFullUrl(
          source.bunnyPath,
          args.expiresUnix,
          "audio",
        );
      }
      out.push({
        _id: listing._id,
        title: listing.title,
        description: listing.description,
        audioType: listing.audioType,
        status: listing.status,
        priceCents: Math.round(listing.priceCredits * creditPriceCents),
        purchaseCount: listing.purchaseCount,
        durationSeconds: listing.durationSeconds,
        sellerBusinessName: seller?.businessName ?? "Seller",
        sellerUserId: listing.sellerUserId,
        previewUrl,
        submittedAt: listing.submittedAt,
        listedAt: listing.listedAt,
        rejectionReason: listing.rejectionReason,
        platformOwnedAt: listing.platformOwnedAt,
        profitBannedAt: listing.profitBannedAt,
        profitBanReason: listing.profitBanReason,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      });
    }
    return out;
  },
});

export const adminApproveListing = adminMutation({
  args: { listingId: v.id("assetListings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "pending_review") {
      throw new Error("Only pending submissions can be approved");
    }
    const now = Date.now();
    await ctx.db.patch(listing._id, {
      status: "listed",
      listedAt: now,
      reviewedAt: now,
      reviewedBy: ctx.user._id,
      rejectionReason: undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const adminRejectListing = adminMutation({
  args: {
    listingId: v.id("assetListings"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "pending_review") {
      throw new Error("Only pending submissions can be rejected");
    }
    const reason = args.reason.trim();
    if (!reason) throw new Error("Rejection reason is required");
    const now = Date.now();
    await ctx.db.patch(listing._id, {
      status: "rejected",
      rejectionReason: reason.slice(0, 500),
      reviewedAt: now,
      reviewedBy: ctx.user._id,
      updatedAt: now,
    });
    return null;
  },
});

export const adminRemoveListing = adminMutation({
  args: {
    listingId: v.id("assetListings"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("assetListings", args.listingId);
    if (!listing) throw new Error("Listing not found");
    const now = Date.now();
    const reason = args.reason?.trim();
    await ctx.db.patch(listing._id, {
      status: "removed",
      profitBannedAt: listing.profitBannedAt ?? now,
      profitBanReason:
        reason?.slice(0, 500) ||
        listing.profitBanReason ||
        "Removed by admin",
      reviewedAt: now,
      reviewedBy: ctx.user._id,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Daily: sellers with storage unpaid ≥90 days lose live non-platform listings
 * and are profit-banned on those assets.
 */
export const enforceUnpaidStorageListingPolicy = internalMutation({
  args: {},
  returns: v.object({ sellersChecked: v.number(), listingsRemoved: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - ASSET_STORE_STORAGE_DELIST_MS;
    const outstanding = await ctx.db
      .query("storageBilling")
      .withIndex("by_outstanding_since", (q) =>
        q.lte("outstandingSince", cutoff),
      )
      .take(200);

    let sellersChecked = 0;
    let listingsRemoved = 0;
    const reason = `Storage unpaid for ${ASSET_STORE_STORAGE_DELIST_DAYS}+ days — listing removed and profit-banned`;

    for (const row of outstanding) {
      if (row.outstandingCredits <= 0 || row.outstandingSince == null) continue;
      if (row.outstandingSince > cutoff) continue;
      // Confirm still outstanding (index range is approximate).
      const fresh = await getStorageRow(ctx, row.userId);
      if (
        !fresh ||
        fresh.outstandingCredits <= 0 ||
        fresh.outstandingSince == null ||
        fresh.outstandingSince > cutoff
      ) {
        continue;
      }
      sellersChecked += 1;
      const listings = await ctx.db
        .query("assetListings")
        .withIndex("by_seller_user", (q) => q.eq("sellerUserId", row.userId))
        .collect();
      for (const listing of listings) {
        if (listing.platformOwnedAt) continue;
        if (listing.status !== "listed" && listing.status !== "pending_review") {
          continue;
        }
        await ctx.db.patch(listing._id, {
          status: "removed",
          profitBannedAt: now,
          profitBanReason: reason,
          updatedAt: now,
        });
        listingsRemoved += 1;
      }
    }
    return { sellersChecked, listingsRemoved };
  },
});