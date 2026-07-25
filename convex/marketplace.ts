import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getMarketplaceSellerForUser } from "./lib/auth";
import {
  adminMutation,
  adminQuery,
  authedMutation,
  authedQuery,
  sellerMutation,
  sellerQuery,
} from "./lib/customFunctions";
import {
  creditsFromOfferPriceCents,
  getCreditPriceCents,
  holdMarketplaceEscrow,
  refundMarketplaceEscrow,
  releaseMarketplaceEscrow,
} from "./lib/marketplaceEscrow";
import {
  signBunnyFullUrl,
  signBunnyCdnUrls,
  assetThumbnailPath,
  THUMB_TRANSFORM,
} from "./lib/bunny";

const AUTO_ACCEPT_MS = 7 * 24 * 60 * 60 * 1000;

const offerStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("paused"),
  v.literal("archived"),
);

const jobStatus = v.union(
  v.literal("pending_payment"),
  v.literal("in_escrow"),
  v.literal("in_progress"),
  v.literal("delivered"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("refunded"),
);

const sellerStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("suspended"),
);

const sellerEntityType = v.union(
  v.literal("freelancer"),
  v.literal("business"),
);

const payoutAccountType = v.union(
  v.literal("chequing"),
  v.literal("savings"),
);

const payoutAccountShape = v.object({
  bankName: v.optional(v.string()),
  accountName: v.optional(v.string()),
  accountNumber: v.string(),
  accountType: v.optional(payoutAccountType),
  branch: v.optional(v.string()),
  note: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

function toPayoutAccount(seller: Doc<"marketplaceSellers"> | null) {
  if (!seller?.payoutAccountNumber) return null;
  return {
    bankName: seller.payoutBankName,
    accountName: seller.payoutAccountName,
    accountNumber: seller.payoutAccountNumber,
    accountType: seller.payoutAccountType,
    branch: seller.payoutBranch,
    note: seller.payoutNote,
    updatedAt: seller.payoutUpdatedAt,
  };
}

const sellerBusinessType = v.union(
  v.literal("sole_trader"),
  v.literal("limited_company"),
  v.literal("partnership"),
  v.literal("other"),
);

const sellerIdentityDocKind = v.union(
  v.literal("national_id"),
  v.literal("passport"),
  v.literal("drivers_permit"),
  v.literal("birth_certificate"),
);

function isTwoSidedIdentityDoc(
  kind: "national_id" | "passport" | "drivers_permit" | "birth_certificate",
): boolean {
  return kind === "national_id" || kind === "drivers_permit";
}

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "offer";
}

async function uniqueOfferSlug(
  ctx: MutationCtx,
  title: string,
  excludeId?: Id<"marketplaceOffers">,
): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

async function appendJobEvent(
  ctx: MutationCtx,
  args: {
    jobId: Id<"marketplaceJobs">;
    actorUserId?: Id<"users">;
    kind: string;
    message?: string;
  },
) {
  await ctx.db.insert("marketplaceJobEvents", {
    jobId: args.jobId,
    actorUserId: args.actorUserId,
    kind: args.kind,
    message: args.message,
    createdAt: Date.now(),
  });
}

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

const offerPackageValidator = v.object({
  name: v.string(),
  description: v.string(),
  priceCents: v.number(),
  deliveryDays: v.number(),
  revisions: v.number(),
  features: v.array(v.string()),
});

type OfferPackage = {
  name: string;
  description: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
};

/** Validate 1–3 seller-supplied packages and derive starting price/delivery. */
function normalizePackages(raw: OfferPackage[]): {
  packages: OfferPackage[];
  startingPriceCents: number;
  startingDeliveryDays: number;
} {
  if (raw.length < 1 || raw.length > 3) {
    throw new Error("Offer between 1 and 3 packages");
  }
  const packages = raw.map((pkg, index) => {
    const name = pkg.name.trim();
    if (!name) throw new Error(`Package ${index + 1} needs a name`);
    if (!Number.isFinite(pkg.priceCents) || pkg.priceCents < 50) {
      throw new Error(`${name}: price must be at least $0.50 TTD`);
    }
    if (!Number.isFinite(pkg.deliveryDays) || pkg.deliveryDays < 1) {
      throw new Error(`${name}: delivery must be at least 1 day`);
    }
    if (!Number.isFinite(pkg.revisions) || pkg.revisions < 0) {
      throw new Error(`${name}: revisions cannot be negative`);
    }
    return {
      name: name.slice(0, 40),
      description: pkg.description.trim().slice(0, 400),
      priceCents: Math.round(pkg.priceCents),
      deliveryDays: Math.floor(pkg.deliveryDays),
      revisions: Math.floor(pkg.revisions),
      features: pkg.features
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
  });
  return {
    packages,
    startingPriceCents: Math.min(...packages.map((p) => p.priceCents)),
    startingDeliveryDays: Math.min(...packages.map((p) => p.deliveryDays)),
  };
}

const publicGalleryItem = v.object({
  kind: v.string(),
  name: v.optional(v.string()),
  url: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

const publicOfferReturn = v.object({
  _id: v.id("marketplaceOffers"),
  title: v.string(),
  slug: v.string(),
  description: v.string(),
  priceCents: v.number(),
  category: v.optional(v.string()),
  deliveryDays: v.number(),
  status: offerStatus,
  publishedAt: v.optional(v.number()),
  packages: v.optional(v.array(offerPackageValidator)),
  bannerThumbUrl: v.optional(v.string()),
  gallery: v.optional(v.array(publicGalleryItem)),
  purchaseCount: v.number(),
  ratingCount: v.number(),
  ratingAvg: v.union(v.number(), v.null()),
  sellerBusinessName: v.string(),
  sellerUsername: v.optional(v.string()),
  sellerUserId: v.id("users"),
});

function offerRatingStats(offer: Doc<"marketplaceOffers">) {
  const purchaseCount = offer.purchaseCount ?? 0;
  const ratingCount = offer.ratingCount ?? 0;
  const ratingSum = offer.ratingSum ?? 0;
  return {
    purchaseCount,
    ratingCount,
    ratingAvg:
      ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
  };
}

async function signOfferGalleryItem(
  ctx: QueryCtx | MutationCtx,
  assetId: Id<"assets">,
  expiresUnix: number,
) {
  const asset = await ctx.db.get("assets", assetId);
  if (!asset?.bunnyPath || asset.deletedAt) return null;
  const url = await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind);
  const thumbPath = assetThumbnailPath(asset);
  let thumbnailUrl: string | undefined;
  if (thumbPath) {
    const signed = await signBunnyCdnUrls([thumbPath], expiresUnix, THUMB_TRANSFORM);
    thumbnailUrl = signed.get(thumbPath);
  }
  return { kind: asset.kind, name: asset.name, url, thumbnailUrl };
}

async function toPublicOffer(
  ctx: QueryCtx | MutationCtx,
  offer: Doc<"marketplaceOffers">,
  opts?: { media?: "thumb" | "full" },
) {
  const seller = await ctx.db.get("marketplaceSellers", offer.sellerId);
  const label = seller
    ? await sellerPublicLabel(ctx, seller)
    : { businessName: "Seller", username: undefined };
  let bannerThumbUrl: string | undefined;
  let gallery:
    | Array<{
        kind: string;
        name?: string;
        url?: string;
        thumbnailUrl?: string;
      }>
    | undefined;
  if (opts?.media) {
    const expiresUnix = Math.floor(Date.now() / 1000) + 3600;
    if (offer.coverAssetId) {
      const cover = await signOfferGalleryItem(ctx, offer.coverAssetId, expiresUnix);
      bannerThumbUrl = cover?.thumbnailUrl ?? cover?.url;
      if (opts.media === "full" && cover) gallery = [cover];
    }
    if (opts.media === "full") {
      gallery = gallery ?? [];
      const seen = new Set<Id<"assets">>(
        offer.coverAssetId ? [offer.coverAssetId] : [],
      );
      for (const assetId of offer.sampleAssetIds ?? []) {
        if (seen.has(assetId)) continue;
        seen.add(assetId);
        const item = await signOfferGalleryItem(ctx, assetId, expiresUnix);
        if (item) gallery.push(item);
      }
      if (gallery.length === 0) gallery = undefined;
    }
  }
  const stats = offerRatingStats(offer);
  return {
    _id: offer._id,
    title: offer.title,
    slug: offer.slug,
    description: offer.description,
    priceCents: offer.priceCents,
    category: offer.category,
    deliveryDays: offer.deliveryDays,
    status: offer.status,
    publishedAt: offer.publishedAt,
    packages: offer.packages,
    bannerThumbUrl,
    gallery,
    purchaseCount: stats.purchaseCount,
    ratingCount: stats.ratingCount,
    ratingAvg: stats.ratingAvg,
    sellerBusinessName: label.businessName,
    sellerUsername: label.username,
    sellerUserId: offer.sellerUserId,
  };
}

async function requireOwnedOffer(
  ctx: MutationCtx,
  sellerId: Id<"marketplaceSellers">,
  offerId: Id<"marketplaceOffers">,
) {
  const offer = await ctx.db.get("marketplaceOffers", offerId);
  if (!offer || offer.sellerId !== sellerId) {
    throw new Error("Offer not found");
  }
  return offer;
}

async function completeJobWithRelease(
  ctx: MutationCtx,
  job: Doc<"marketplaceJobs">,
  actorUserId?: Id<"users">,
  message?: string,
) {
  if (job.status !== "delivered") {
    throw new Error("Job is not awaiting acceptance");
  }
  if (!job.escrowHoldId) {
    throw new Error("Job has no escrow hold");
  }
  await releaseMarketplaceEscrow(ctx, {
    holdId: job.escrowHoldId,
    reason: message ?? "Marketplace job completed",
  });
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: "completed",
    completedAt: now,
    updatedAt: now,
  });
  const offer = await ctx.db.get("marketplaceOffers", job.offerId);
  if (offer) {
    await ctx.db.patch(offer._id, {
      purchaseCount: (offer.purchaseCount ?? 0) + 1,
      updatedAt: now,
    });
  }
  const existingPayout = await ctx.db
    .query("sellerPayouts")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .unique();
  if (!existingPayout) {
    await ctx.db.insert("sellerPayouts", {
      sellerUserId: job.sellerUserId,
      jobId: job._id,
      amountCents: job.priceCents,
      status: "owed",
      createdAt: now,
      updatedAt: now,
    });
  }
  await appendJobEvent(ctx, {
    jobId: job._id,
    actorUserId,
    kind: "completed",
    message: message ?? "Delivery accepted; escrow released to platform",
  });
}

// —— Public catalog ——

export const listPublicOffers = query({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicOfferReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 48, 1), 100);
    const rows = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_status_and_published", (q) => q.eq("status", "published"))
      .order("desc")
      .take(limit * 2);
    const filtered = args.category
      ? rows.filter((o) => o.category === args.category)
      : rows;
    const out = [];
    for (const offer of filtered.slice(0, limit)) {
      out.push(await toPublicOffer(ctx, offer, { media: "thumb" }));
    }
    return out;
  },
});

export const getPublicOfferBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicOfferReturn, v.null()),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const offer = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!offer || offer.status !== "published") return null;
    return await toPublicOffer(ctx, offer, { media: "full" });
  },
});

export const listPublicOffersByUsername = query({
  args: { username: v.string() },
  returns: v.array(publicOfferReturn),
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase().replace(/^@/, "");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) return [];
    const seller = await getMarketplaceSellerForUser(ctx, profile.userId);
    if (!seller || seller.status !== "approved") return [];
    const offers = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_seller", (q) => q.eq("sellerId", seller._id))
      .collect();
    const published = offers.filter((o) => o.status === "published");
    const out = [];
    for (const offer of published) {
      out.push(await toPublicOffer(ctx, offer, { media: "thumb" }));
    }
    return out;
  },
});

// —— Seller status (any authed user) ——

export const getMySellerStatus = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("marketplaceSellers"),
      status: sellerStatus,
      businessName: v.string(),
      entityType: v.optional(sellerEntityType),
      legalName: v.optional(v.string()),
      businessType: v.optional(sellerBusinessType),
      rejectionReason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const seller = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (!seller) return null;
    return {
      _id: seller._id,
      status: seller.status,
      businessName: seller.businessName,
      entityType: seller.entityType,
      legalName: seller.legalName,
      businessType: seller.businessType,
      rejectionReason: seller.rejectionReason,
    };
  },
});

/** Payout destination the seller maintains in Settings → Payouts. */
export const getMyPayoutAccount = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      sellerStatus: sellerStatus,
      account: v.union(v.null(), payoutAccountShape),
    }),
  ),
  handler: async (ctx) => {
    const seller = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (!seller) return null;
    return { sellerStatus: seller.status, account: toPayoutAccount(seller) };
  },
});

export const saveMyPayoutAccount = authedMutation({
  args: {
    bankName: v.string(),
    accountName: v.string(),
    accountNumber: v.string(),
    accountType: payoutAccountType,
    branch: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const seller = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (!seller) throw new Error("Apply as a seller before adding payout details");
    const bankName = args.bankName.trim();
    const accountName = args.accountName.trim();
    const accountNumber = args.accountNumber.replace(/[\s-]/g, "");
    if (!bankName) throw new Error("Bank name required");
    if (!accountName) throw new Error("Account holder name required");
    if (!/^\d{6,20}$/.test(accountNumber)) {
      throw new Error("Enter a valid account number (digits only)");
    }
    const now = Date.now();
    await ctx.db.patch(seller._id, {
      payoutBankName: bankName,
      payoutAccountName: accountName,
      payoutAccountNumber: accountNumber,
      payoutAccountType: args.accountType,
      payoutBranch: args.branch?.trim() || undefined,
      payoutNote: args.note?.trim() || undefined,
      payoutUpdatedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const prepareSellerDocUpload = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const requestSellerAccess = authedMutation({
  args: {
    entityType: sellerEntityType,
    businessName: v.string(),
    legalName: v.string(),
    phone: v.string(),
    residentialAddress: v.string(),
    identityDoc1Kind: sellerIdentityDocKind,
    identityDoc1BunnyPath: v.string(),
    identityDoc1BackBunnyPath: v.optional(v.string()),
    identityDoc2Kind: sellerIdentityDocKind,
    identityDoc2BunnyPath: v.string(),
    identityDoc2BackBunnyPath: v.optional(v.string()),
    proofOfResidentialAddressBunnyPath: v.string(),
    businessType: v.optional(sellerBusinessType),
    businessRegistrationNumber: v.optional(v.string()),
    birNumber: v.optional(v.string()),
    businessAddress: v.optional(v.string()),
    businessRegistrationBunnyPath: v.optional(v.string()),
    proofOfBusinessAddressBunnyPath: v.optional(v.string()),
  },
  returns: v.id("marketplaceSellers"),
  handler: async (ctx, args) => {
    const businessName = args.businessName.trim();
    const legalName = args.legalName.trim();
    const phone = args.phone.trim();
    const residentialAddress = args.residentialAddress.trim();
    if (!businessName) throw new Error("Display / trading name required");
    if (!legalName) throw new Error("Legal name required");
    if (!phone) throw new Error("Phone required");
    if (!residentialAddress) throw new Error("Residential address required");
    if (args.identityDoc1Kind === args.identityDoc2Kind) {
      throw new Error("Choose two different identity document types");
    }

    const ownPrefix = `users/${ctx.user._id}/marketplace-kyc/`;
    const assertOwnPath = (path: string, label: string) => {
      const normalized = path.trim();
      if (!normalized.startsWith(ownPrefix)) {
        throw new Error(`Invalid ${label} upload path`);
      }
      return normalized;
    };

    const assertIdentity = (
      kind: typeof args.identityDoc1Kind,
      front: string,
      back: string | undefined,
      label: string,
    ) => {
      const frontPath = assertOwnPath(front, label);
      if (isTwoSidedIdentityDoc(kind) && !back?.trim()) {
        throw new Error(`Back of ${label} is required`);
      }
      const backPath = back?.trim() ? assertOwnPath(back, `${label} back`) : undefined;
      return { frontPath, backPath };
    };

    const doc1 = assertIdentity(
      args.identityDoc1Kind,
      args.identityDoc1BunnyPath,
      args.identityDoc1BackBunnyPath,
      "first ID",
    );
    const doc2 = assertIdentity(
      args.identityDoc2Kind,
      args.identityDoc2BunnyPath,
      args.identityDoc2BackBunnyPath,
      "second ID",
    );
    const proofOfResidentialAddressBunnyPath = assertOwnPath(
      args.proofOfResidentialAddressBunnyPath,
      "residential address proof",
    );

    if (args.entityType === "business") {
      if (!args.businessType) throw new Error("Business type required");
      if (!args.businessAddress?.trim()) throw new Error("Business address required");
      if (!args.businessRegistrationBunnyPath) {
        throw new Error("Business registration / certificate of incorporation required");
      }
      if (!args.proofOfBusinessAddressBunnyPath) {
        throw new Error("Proof of business address required");
      }
    }

    const existing = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (existing) {
      if (existing.status === "suspended") {
        throw new Error("Seller account is suspended");
      }
      if (existing.status === "approved") {
        throw new Error("You are already an approved seller");
      }
      if (existing.status === "pending") {
        throw new Error("You already have a pending seller request");
      }
      // rejected — allow a fresh application on the same row
    }

    const now = Date.now();
    const record = {
      userId: ctx.user._id,
      status: "pending" as const,
      businessName,
      entityType: args.entityType,
      legalName,
      phone,
      residentialAddress,
      businessType: args.entityType === "business" ? args.businessType : undefined,
      businessRegistrationNumber: args.businessRegistrationNumber?.trim() || undefined,
      birNumber: args.birNumber?.trim() || undefined,
      businessAddress:
        args.entityType === "business" ? args.businessAddress?.trim() : undefined,
      identityDoc1Kind: args.identityDoc1Kind,
      identityDoc1BunnyPath: doc1.frontPath,
      identityDoc1BackBunnyPath: doc1.backPath,
      identityDoc2Kind: args.identityDoc2Kind,
      identityDoc2BunnyPath: doc2.frontPath,
      identityDoc2BackBunnyPath: doc2.backPath,
      proofOfResidentialAddressBunnyPath,
      businessRegistrationBunnyPath:
        args.entityType === "business"
          ? assertOwnPath(args.businessRegistrationBunnyPath!, "business registration")
          : undefined,
      proofOfBusinessAddressBunnyPath:
        args.entityType === "business"
          ? assertOwnPath(args.proofOfBusinessAddressBunnyPath!, "business address proof")
          : undefined,
      rejectionReason: undefined,
      rejectedBy: undefined,
      rejectedAt: undefined,
      suspendReason: undefined,
      suspendedAt: undefined,
      updatedAt: now,
    };

    if (existing?.status === "rejected") {
      await ctx.db.patch(existing._id, record);
      return existing._id;
    }

    return await ctx.db.insert("marketplaceSellers", {
      ...record,
      createdAt: now,
    });
  },
});

function sellerKycPaths(seller: Doc<"marketplaceSellers">): string[] {
  return [
    seller.identityDoc1BunnyPath,
    seller.identityDoc1BackBunnyPath,
    seller.identityDoc2BunnyPath,
    seller.identityDoc2BackBunnyPath,
    seller.proofOfResidentialAddressBunnyPath,
    seller.businessRegistrationBunnyPath,
    seller.proofOfBusinessAddressBunnyPath,
  ].filter((p): p is string => Boolean(p));
}

/** Withdraw a pending seller application (before admin approval). */
export const cancelSellerRequest = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const seller = await getMarketplaceSellerForUser(ctx, ctx.user._id);
    if (!seller) return null;
    if (seller.status !== "pending") {
      throw new Error("Only a pending seller request can be cancelled");
    }
    const paths = sellerKycPaths(seller);
    if (paths.length) {
      await ctx.scheduler.runAfter(0, internal.marketplaceActions.deleteSellerKycPaths, {
        paths,
      });
    }
    await ctx.db.delete(seller._id);
    return null;
  },
});

// —— Admin seller + payout ——

export const adminListSellers = adminQuery({
  args: { status: v.optional(sellerStatus) },
  returns: v.array(
    v.object({
      _id: v.id("marketplaceSellers"),
      userId: v.id("users"),
      status: sellerStatus,
      businessName: v.string(),
      entityType: v.optional(sellerEntityType),
      legalName: v.optional(v.string()),
      businessType: v.optional(sellerBusinessType),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      name: v.optional(v.string()),
      createdAt: v.number(),
      approvedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("marketplaceSellers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("marketplaceSellers").collect();
    const out = [];
    for (const seller of rows) {
      const user = await ctx.db.get("users", seller.userId);
      out.push({
        _id: seller._id,
        userId: seller.userId,
        status: seller.status,
        businessName: seller.businessName,
        entityType: seller.entityType,
        legalName: seller.legalName,
        businessType: seller.businessType,
        email: user?.email,
        phone: seller.phone ?? user?.phone,
        name: user?.name,
        createdAt: seller.createdAt,
        approvedAt: seller.approvedAt,
        rejectionReason: seller.rejectionReason,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminGetSellerApplication = adminQuery({
  args: { sellerId: v.id("marketplaceSellers") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("marketplaceSellers"),
      status: sellerStatus,
      businessName: v.string(),
      entityType: v.optional(sellerEntityType),
      legalName: v.optional(v.string()),
      phone: v.optional(v.string()),
      residentialAddress: v.optional(v.string()),
      businessType: v.optional(sellerBusinessType),
      businessRegistrationNumber: v.optional(v.string()),
      birNumber: v.optional(v.string()),
      businessAddress: v.optional(v.string()),
      identityDoc1Kind: v.optional(sellerIdentityDocKind),
      identityDoc1Url: v.optional(v.string()),
      identityDoc1BackUrl: v.optional(v.string()),
      identityDoc2Kind: v.optional(sellerIdentityDocKind),
      identityDoc2Url: v.optional(v.string()),
      identityDoc2BackUrl: v.optional(v.string()),
      proofOfResidentialAddressUrl: v.optional(v.string()),
      businessRegistrationUrl: v.optional(v.string()),
      proofOfBusinessAddressUrl: v.optional(v.string()),
      rejectionReason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const seller = await ctx.db.get("marketplaceSellers", args.sellerId);
    if (!seller) return null;
    const expiresUnix = Math.floor(Date.now() / 1000) + 3600;
    const sign = async (path: string | undefined) =>
      path ? await signBunnyFullUrl(path, expiresUnix, "document") : undefined;
    return {
      _id: seller._id,
      status: seller.status,
      businessName: seller.businessName,
      entityType: seller.entityType,
      legalName: seller.legalName,
      phone: seller.phone,
      residentialAddress: seller.residentialAddress,
      businessType: seller.businessType,
      businessRegistrationNumber: seller.businessRegistrationNumber,
      birNumber: seller.birNumber,
      businessAddress: seller.businessAddress,
      identityDoc1Kind: seller.identityDoc1Kind,
      identityDoc1Url: await sign(seller.identityDoc1BunnyPath),
      identityDoc1BackUrl: await sign(seller.identityDoc1BackBunnyPath),
      identityDoc2Kind: seller.identityDoc2Kind,
      identityDoc2Url: await sign(seller.identityDoc2BunnyPath),
      identityDoc2BackUrl: await sign(seller.identityDoc2BackBunnyPath),
      proofOfResidentialAddressUrl: await sign(
        seller.proofOfResidentialAddressBunnyPath,
      ),
      businessRegistrationUrl: await sign(seller.businessRegistrationBunnyPath),
      proofOfBusinessAddressUrl: await sign(seller.proofOfBusinessAddressBunnyPath),
      rejectionReason: seller.rejectionReason,
      createdAt: seller.createdAt,
    };
  },
});

export const adminApproveSeller = adminMutation({
  args: {
    sellerId: v.id("marketplaceSellers"),
    decision: v.union(
      v.literal("approve"),
      v.literal("reject"),
      v.literal("suspend"),
    ),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const seller = await ctx.db.get("marketplaceSellers", args.sellerId);
    if (!seller) throw new Error("Seller not found");
    const now = Date.now();
    const reason = args.reason?.trim() || undefined;

    if (args.decision === "approve") {
      await ctx.db.patch(seller._id, {
        status: "approved",
        approvedBy: ctx.user._id,
        approvedAt: now,
        rejectionReason: undefined,
        rejectedBy: undefined,
        rejectedAt: undefined,
        suspendReason: undefined,
        suspendedAt: undefined,
        updatedAt: now,
      });
      return null;
    }

    if (args.decision === "reject") {
      if (seller.status !== "pending") {
        throw new Error("Only pending applications can be rejected");
      }
      if (!reason) throw new Error("Rejection reason is required");
      await ctx.db.patch(seller._id, {
        status: "rejected",
        rejectionReason: reason,
        rejectedBy: ctx.user._id,
        rejectedAt: now,
        updatedAt: now,
      });
      return null;
    }

    // suspend — enforcement on approved (or re-suspend path)
    if (seller.status === "pending") {
      throw new Error("Reject pending applications instead of suspending");
    }
    if (seller.status === "rejected") {
      throw new Error("Rejected applications cannot be suspended");
    }
    await ctx.db.patch(seller._id, {
      status: "suspended",
      suspendedAt: now,
      suspendReason: reason,
      updatedAt: now,
    });
    return null;
  },
});

export const adminListJobs = adminQuery({
  args: {
    status: v.optional(jobStatus),
  },
  returns: v.array(
    v.object({
      _id: v.id("marketplaceJobs"),
      offerTitle: v.string(),
      status: jobStatus,
      priceCents: v.number(),
      priceCredits: v.number(),
      buyerLabel: v.string(),
      sellerLabel: v.string(),
      hasEscrow: v.boolean(),
      canRefund: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const jobs = args.status
      ? await ctx.db
          .query("marketplaceJobs")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(150)
      : await ctx.db.query("marketplaceJobs").order("desc").take(150);
    const out = [];
    for (const job of jobs) {
      const [offer, buyer, sellerUser, seller] = await Promise.all([
        ctx.db.get("marketplaceOffers", job.offerId),
        ctx.db.get("users", job.buyerUserId),
        ctx.db.get("users", job.sellerUserId),
        getMarketplaceSellerForUser(ctx, job.sellerUserId),
      ]);
      const canRefund =
        (job.status === "delivered" ||
          job.status === "in_progress" ||
          job.status === "in_escrow") &&
        Boolean(job.escrowHoldId);
      out.push({
        _id: job._id,
        offerTitle: offer?.title ?? "Offer",
        status: job.status,
        priceCents: job.priceCents,
        priceCredits: job.priceCredits,
        buyerLabel:
          buyer?.name ?? buyer?.email ?? buyer?.phone ?? String(job.buyerUserId),
        sellerLabel:
          seller?.businessName ??
          sellerUser?.name ??
          sellerUser?.email ??
          String(job.sellerUserId),
        hasEscrow: Boolean(job.escrowHoldId),
        canRefund,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }
    return out;
  },
});

export const adminListPayouts = adminQuery({
  args: { status: v.optional(v.union(v.literal("owed"), v.literal("paid"))) },
  returns: v.array(
    v.object({
      _id: v.id("sellerPayouts"),
      sellerUserId: v.id("users"),
      jobId: v.id("marketplaceJobs"),
      amountCents: v.number(),
      status: v.union(v.literal("owed"), v.literal("paid")),
      businessName: v.optional(v.string()),
      offerTitle: v.optional(v.string()),
      payoutAccount: v.union(v.null(), payoutAccountShape),
      paidAt: v.optional(v.number()),
      adminNote: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("sellerPayouts")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("sellerPayouts").collect();
    const out = [];
    for (const payout of rows) {
      const seller = await getMarketplaceSellerForUser(ctx, payout.sellerUserId);
      const job = await ctx.db.get("marketplaceJobs", payout.jobId);
      const offer = job
        ? await ctx.db.get("marketplaceOffers", job.offerId)
        : null;
      out.push({
        _id: payout._id,
        sellerUserId: payout.sellerUserId,
        jobId: payout.jobId,
        amountCents: payout.amountCents,
        status: payout.status,
        businessName: seller?.businessName,
        offerTitle: offer?.title,
        payoutAccount: toPayoutAccount(seller),
        paidAt: payout.paidAt,
        adminNote: payout.adminNote,
        createdAt: payout.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminMarkPayoutPaid = adminMutation({
  args: {
    payoutId: v.id("sellerPayouts"),
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get("sellerPayouts", args.payoutId);
    if (!payout) throw new Error("Payout not found");
    if (payout.status === "paid") return null;
    const now = Date.now();
    await ctx.db.patch(payout._id, {
      status: "paid",
      paidAt: now,
      markedPaidBy: ctx.user._id,
      adminNote: args.adminNote?.trim() || payout.adminNote,
      updatedAt: now,
    });
    return null;
  },
});

export const adminRefundDeliveredJob = adminMutation({
  args: {
    jobId: v.id("marketplaceJobs"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "delivered" && job.status !== "in_progress" && job.status !== "in_escrow") {
      throw new Error("Job cannot be refunded in current status");
    }
    if (!job.escrowHoldId) throw new Error("No escrow to refund");
    await refundMarketplaceEscrow(ctx, {
      holdId: job.escrowHoldId,
      reason: args.reason ?? "Admin marketplace refund",
      adminId: ctx.user._id,
    });
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "refunded",
      cancelledAt: now,
      updatedAt: now,
    });
    await appendJobEvent(ctx, {
      jobId: job._id,
      actorUserId: ctx.user._id,
      kind: "refunded",
      message: args.reason ?? "Admin refunded escrow to buyer",
    });
    return null;
  },
});

// —— Seller offers CRUD ——

export const listMyOffers = sellerQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("marketplaceOffers"),
      title: v.string(),
      slug: v.string(),
      description: v.string(),
      priceCents: v.number(),
      category: v.optional(v.string()),
      status: offerStatus,
      deliveryDays: v.number(),
      packages: v.optional(v.array(offerPackageValidator)),
      coverAssetId: v.optional(v.id("assets")),
      sampleAssetIds: v.optional(v.array(v.id("assets"))),
      publishedAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const offers = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_seller", (q) => q.eq("sellerId", ctx.seller._id))
      .collect();
    return offers
      .map((o) => ({
        _id: o._id,
        title: o.title,
        slug: o.slug,
        description: o.description,
        priceCents: o.priceCents,
        category: o.category,
        status: o.status,
        deliveryDays: o.deliveryDays,
        packages: o.packages,
        coverAssetId: o.coverAssetId,
        sampleAssetIds: o.sampleAssetIds,
        publishedAt: o.publishedAt,
        updatedAt: o.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const createOffer = sellerMutation({
  args: {
    title: v.string(),
    description: v.string(),
    priceCents: v.number(),
    category: v.optional(v.string()),
    deliveryDays: v.number(),
    packages: v.optional(v.array(offerPackageValidator)),
    coverAssetId: v.optional(v.id("assets")),
    sampleAssetIds: v.optional(v.array(v.id("assets"))),
  },
  returns: v.id("marketplaceOffers"),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const description = args.description.trim();
    if (!title) throw new Error("Title required");
    if (!description) throw new Error("Description required");
    let priceCents = Math.round(args.priceCents);
    let deliveryDays = Math.floor(args.deliveryDays);
    let packages: OfferPackage[] | undefined;
    if (args.packages && args.packages.length > 0) {
      const normalized = normalizePackages(args.packages);
      packages = normalized.packages;
      priceCents = normalized.startingPriceCents;
      deliveryDays = normalized.startingDeliveryDays;
    } else {
      if (!Number.isFinite(args.priceCents) || args.priceCents < 50) {
        throw new Error("Price must be at least $0.50 TTD");
      }
      if (!Number.isFinite(args.deliveryDays) || args.deliveryDays < 1) {
        throw new Error("Delivery days must be at least 1");
      }
    }
    if ((args.sampleAssetIds ?? []).length > 6) {
      throw new Error("Up to 6 gallery items");
    }
    const now = Date.now();
    const slug = await uniqueOfferSlug(ctx, title);
    return await ctx.db.insert("marketplaceOffers", {
      sellerId: ctx.seller._id,
      sellerUserId: ctx.user._id,
      title,
      slug,
      description,
      priceCents,
      category: args.category?.trim() || undefined,
      status: "draft",
      deliveryDays,
      packages,
      coverAssetId: args.coverAssetId,
      sampleAssetIds: args.sampleAssetIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateOffer = sellerMutation({
  args: {
    offerId: v.id("marketplaceOffers"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    category: v.optional(v.string()),
    deliveryDays: v.optional(v.number()),
    // null clears the tiers back to a flat-rate offer.
    packages: v.optional(v.union(v.array(offerPackageValidator), v.null())),
    coverAssetId: v.optional(v.union(v.id("assets"), v.null())),
    sampleAssetIds: v.optional(v.array(v.id("assets"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const offer = await requireOwnedOffer(ctx, ctx.seller._id, args.offerId);
    const patch: Partial<Doc<"marketplaceOffers">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Title required");
      patch.title = title;
      patch.slug = await uniqueOfferSlug(ctx, title, offer._id);
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (!description) throw new Error("Description required");
      patch.description = description;
    }
    if (args.priceCents !== undefined) {
      if (args.priceCents < 50) throw new Error("Price must be at least $0.50 TTD");
      patch.priceCents = Math.round(args.priceCents);
    }
    if (args.category !== undefined) {
      patch.category = args.category.trim() || undefined;
    }
    if (args.deliveryDays !== undefined) {
      if (args.deliveryDays < 1) throw new Error("Delivery days must be at least 1");
      patch.deliveryDays = Math.floor(args.deliveryDays);
    }
    if (args.packages !== undefined) {
      if (args.packages === null || args.packages.length === 0) {
        patch.packages = undefined;
      } else {
        const normalized = normalizePackages(args.packages);
        patch.packages = normalized.packages;
        patch.priceCents = normalized.startingPriceCents;
        patch.deliveryDays = normalized.startingDeliveryDays;
      }
    }
    if (args.coverAssetId !== undefined) {
      patch.coverAssetId = args.coverAssetId ?? undefined;
    }
    if (args.sampleAssetIds !== undefined) {
      if (args.sampleAssetIds.length > 6) throw new Error("Up to 6 gallery items");
      patch.sampleAssetIds = args.sampleAssetIds;
    }
    await ctx.db.patch(offer._id, patch);
    return null;
  },
});

export const setOfferStatus = sellerMutation({
  args: {
    offerId: v.id("marketplaceOffers"),
    status: offerStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const offer = await requireOwnedOffer(ctx, ctx.seller._id, args.offerId);
    const now = Date.now();
    const patch: Partial<Doc<"marketplaceOffers">> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.status === "published" && !offer.publishedAt) {
      patch.publishedAt = now;
    }
    await ctx.db.patch(offer._id, patch);
    return null;
  },
});

/** Admin moderation — pause / restore / archive any listing. */
export const adminListOffers = adminQuery({
  args: {
    status: v.optional(offerStatus),
  },
  returns: v.array(
    v.object({
      _id: v.id("marketplaceOffers"),
      title: v.string(),
      status: offerStatus,
      priceCents: v.number(),
      sellerUserId: v.id("users"),
      businessName: v.optional(v.string()),
      publishedAt: v.optional(v.number()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("marketplaceOffers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(100)
      : await ctx.db.query("marketplaceOffers").order("desc").take(100);
    const out = [];
    for (const offer of rows) {
      const seller = await ctx.db.get("marketplaceSellers", offer.sellerId);
      out.push({
        _id: offer._id,
        title: offer.title,
        status: offer.status,
        priceCents: offer.priceCents,
        sellerUserId: offer.sellerUserId,
        businessName: seller?.businessName,
        publishedAt: offer.publishedAt,
        createdAt: offer.createdAt,
      });
    }
    return out;
  },
});

export const adminSetOfferStatus = adminMutation({
  args: {
    offerId: v.id("marketplaceOffers"),
    status: v.union(
      v.literal("paused"),
      v.literal("published"),
      v.literal("archived"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const offer = await ctx.db.get("marketplaceOffers", args.offerId);
    if (!offer) throw new Error("Offer not found");
    const now = Date.now();
    const patch: Partial<Doc<"marketplaceOffers">> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.status === "published" && !offer.publishedAt) {
      patch.publishedAt = now;
    }
    await ctx.db.patch(offer._id, patch);
    return null;
  },
});

// —— Book + jobs ——

/** Resolve the booked package (if any) and effective price/delivery/revisions. */
function resolveBookedPackage(
  offer: Doc<"marketplaceOffers">,
  packageIndex: number | undefined,
): {
  priceCents: number;
  deliveryDays: number;
  revisions?: number;
  packageName?: string;
} {
  const packages = offer.packages ?? [];
  if (packages.length === 0) {
    return { priceCents: offer.priceCents, deliveryDays: offer.deliveryDays };
  }
  const index = packageIndex ?? 0;
  const pkg = packages[index];
  if (!pkg) throw new Error("Package not available");
  return {
    priceCents: pkg.priceCents,
    deliveryDays: pkg.deliveryDays,
    revisions: pkg.revisions,
    packageName: pkg.name,
  };
}

export const quoteBookOffer = authedQuery({
  args: {
    offerId: v.id("marketplaceOffers"),
    packageIndex: v.optional(v.number()),
  },
  returns: v.object({
    priceCents: v.number(),
    priceCredits: v.number(),
    creditPriceCents: v.number(),
    creditBalance: v.number(),
    shortfallCredits: v.number(),
    canBook: v.boolean(),
    packageName: v.optional(v.string()),
    deliveryDays: v.number(),
  }),
  handler: async (ctx, args) => {
    const offer = await ctx.db.get("marketplaceOffers", args.offerId);
    if (!offer || offer.status !== "published") {
      throw new Error("Offer not available");
    }
    const booked = resolveBookedPackage(offer, args.packageIndex);
    const settings = await ctx.db
      .query("pricingSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const creditPriceCents = settings?.creditPriceCents ?? 50;
    const priceCredits = creditsFromOfferPriceCents(booked.priceCents, creditPriceCents);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const creditBalance = account?.creditBalance ?? 0;
    const shortfallCredits = Math.max(0, priceCredits - creditBalance);
    return {
      priceCents: booked.priceCents,
      priceCredits,
      creditPriceCents,
      creditBalance,
      shortfallCredits,
      canBook:
        shortfallCredits === 0 &&
        offer.sellerUserId !== ctx.user._id,
      packageName: booked.packageName,
      deliveryDays: booked.deliveryDays,
    };
  },
});

export const bookOffer = authedMutation({
  args: {
    offerId: v.id("marketplaceOffers"),
    packageIndex: v.optional(v.number()),
  },
  returns: v.object({
    jobId: v.id("marketplaceJobs"),
    priceCredits: v.number(),
    shortfallCredits: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const offer = await ctx.db.get("marketplaceOffers", args.offerId);
    if (!offer || offer.status !== "published") {
      throw new Error("Offer not available");
    }
    if (offer.sellerUserId === ctx.user._id) {
      throw new Error("Cannot book your own offer");
    }
    const seller = await ctx.db.get("marketplaceSellers", offer.sellerId);
    if (!seller || seller.status !== "approved") {
      throw new Error("Seller is not accepting jobs");
    }
    const booked = resolveBookedPackage(offer, args.packageIndex);
    const creditPriceCents = await getCreditPriceCents(ctx);
    const priceCredits = creditsFromOfferPriceCents(booked.priceCents, creditPriceCents);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const balance = account?.creditBalance ?? 0;
    if (balance < priceCredits) {
      throw new Error(
        `Insufficient credits. Need ${priceCredits} credits (${booked.priceCents} cents TTD). Shortfall: ${priceCredits - balance}`,
      );
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("marketplaceJobs", {
      offerId: offer._id,
      sellerId: offer.sellerId,
      sellerUserId: offer.sellerUserId,
      buyerUserId: ctx.user._id,
      priceCredits,
      priceCents: booked.priceCents,
      creditPriceCents,
      packageName: booked.packageName,
      deliveryDays: booked.deliveryDays,
      revisions: booked.revisions,
      status: "pending_payment",
      createdAt: now,
      updatedAt: now,
    });
    const { holdId, holdTransactionId } = await holdMarketplaceEscrow(ctx, {
      buyerUserId: ctx.user._id,
      jobId,
      credits: priceCredits,
      reason: `Escrow for offer ${offer.slug}`,
    });
    const workFolderId = await ctx.db.insert("folders", {
      ownerId: offer.sellerUserId,
      name: `Job · ${offer.title}`.slice(0, 80),
      icon: "folder",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const heldAt = Date.now();
    await ctx.db.patch(jobId, {
      status: "in_escrow",
      escrowHoldId: holdId,
      escrowCreditTransactionId: holdTransactionId,
      workFolderId,
      updatedAt: heldAt,
    });
    await appendJobEvent(ctx, {
      jobId,
      actorUserId: ctx.user._id,
      kind: "booked",
      message: booked.packageName
        ? `Booked “${booked.packageName}” package — payment held in escrow`
        : "Booked — payment held in escrow",
    });
    await ctx.db.patch(jobId, {
      status: "in_progress",
      updatedAt: Date.now(),
    });
    await appendJobEvent(ctx, {
      jobId,
      actorUserId: ctx.user._id,
      kind: "in_progress",
      message: "Escrow held; work started",
    });
    return { jobId, priceCredits };
  },
});

const jobSummary = v.object({
  _id: v.id("marketplaceJobs"),
  offerId: v.id("marketplaceOffers"),
  offerTitle: v.string(),
  offerSlug: v.string(),
  status: jobStatus,
  priceCents: v.number(),
  priceCredits: v.number(),
  packageName: v.optional(v.string()),
  deliveryDays: v.optional(v.number()),
  revisions: v.optional(v.number()),
  sellerUserId: v.id("users"),
  buyerUserId: v.id("users"),
  deliveredAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  reviewId: v.optional(v.id("marketplaceReviews")),
  createdAt: v.number(),
  updatedAt: v.number(),
  role: v.union(v.literal("seller"), v.literal("buyer")),
});

async function toJobSummary(
  ctx: QueryCtx | MutationCtx,
  job: Doc<"marketplaceJobs">,
  role: "seller" | "buyer",
) {
  const offer = await ctx.db.get("marketplaceOffers", job.offerId);
  return {
    _id: job._id,
    offerId: job.offerId,
    offerTitle: offer?.title ?? "Offer",
    offerSlug: offer?.slug ?? "",
    status: job.status,
    priceCents: job.priceCents,
    priceCredits: job.priceCredits,
    packageName: job.packageName,
    deliveryDays: job.deliveryDays,
    revisions: job.revisions,
    sellerUserId: job.sellerUserId,
    buyerUserId: job.buyerUserId,
    deliveredAt: job.deliveredAt,
    completedAt: job.completedAt,
    reviewId: job.reviewId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    role,
  };
}

export const listMySellerJobs = sellerQuery({
  args: { offerId: v.optional(v.id("marketplaceOffers")) },
  returns: v.array(jobSummary),
  handler: async (ctx, args) => {
    let jobs = await ctx.db
      .query("marketplaceJobs")
      .withIndex("by_seller", (q) => q.eq("sellerUserId", ctx.user._id))
      .collect();
    if (args.offerId) {
      jobs = jobs.filter((j) => j.offerId === args.offerId);
    }
    const out = [];
    for (const job of jobs.sort((a, b) => b.updatedAt - a.updatedAt)) {
      out.push(await toJobSummary(ctx, job, "seller"));
    }
    return out;
  },
});

export const listMyBuyerJobs = authedQuery({
  args: {},
  returns: v.array(jobSummary),
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("marketplaceJobs")
      .withIndex("by_buyer", (q) => q.eq("buyerUserId", ctx.user._id))
      .collect();
    const out = [];
    for (const job of jobs.sort((a, b) => b.updatedAt - a.updatedAt)) {
      out.push(await toJobSummary(ctx, job, "buyer"));
    }
    return out;
  },
});

export const getJob = authedQuery({
  args: { jobId: v.id("marketplaceJobs") },
  returns: v.union(
    v.null(),
    v.object({
      job: jobSummary,
      events: v.array(
        v.object({
          _id: v.id("marketplaceJobEvents"),
          kind: v.string(),
          message: v.optional(v.string()),
          createdAt: v.number(),
        }),
      ),
      deliverables: v.array(
        v.object({
          _id: v.id("marketplaceDeliverables"),
          assetId: v.id("assets"),
          note: v.optional(v.string()),
          deliveredAt: v.number(),
          name: v.optional(v.string()),
          kind: v.optional(v.string()),
          signedReadUrl: v.optional(v.string()),
          signedThumbnailUrl: v.optional(v.string()),
        }),
      ),
      workFolderId: v.optional(v.id("folders")),
      review: v.union(
        v.null(),
        v.object({
          _id: v.id("marketplaceReviews"),
          rating: v.number(),
          body: v.optional(v.string()),
          createdAt: v.number(),
        }),
      ),
      canReview: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job) return null;
    if (job.buyerUserId !== ctx.user._id && job.sellerUserId !== ctx.user._id) {
      const user = ctx.user;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return null;
      }
    }
    const role =
      job.sellerUserId === ctx.user._id ? "seller" : ("buyer" as const);
    const events = await ctx.db
      .query("marketplaceJobEvents")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const deliverableRows = await ctx.db
      .query("marketplaceDeliverables")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const expiresUnix = Math.floor(Date.now() / 1000) + 3600;
    const deliverables = [];
    for (const row of deliverableRows) {
      const asset = await ctx.db.get("assets", row.assetId);
      let signedReadUrl: string | undefined;
      let signedThumbnailUrl: string | undefined;
      if (asset?.bunnyPath) {
        signedReadUrl = await signBunnyFullUrl(
          asset.bunnyPath,
          expiresUnix,
          asset.kind,
        );
        const thumbPath = assetThumbnailPath(asset);
        if (thumbPath) {
          const signed = await signBunnyCdnUrls(
            [thumbPath],
            expiresUnix,
            THUMB_TRANSFORM,
          );
          signedThumbnailUrl = signed.get(thumbPath);
        }
      }
      deliverables.push({
        _id: row._id,
        assetId: row.assetId,
        note: row.note,
        deliveredAt: row.deliveredAt,
        name: asset?.name,
        kind: asset?.kind,
        signedReadUrl,
        signedThumbnailUrl,
      });
    }
    let review: {
      _id: Id<"marketplaceReviews">;
      rating: number;
      body?: string;
      createdAt: number;
    } | null = null;
    if (job.reviewId) {
      const row = await ctx.db.get("marketplaceReviews", job.reviewId);
      if (row) {
        review = {
          _id: row._id,
          rating: row.rating,
          body: row.body,
          createdAt: row.createdAt,
        };
      }
    } else {
      const existing = await ctx.db
        .query("marketplaceReviews")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .unique();
      if (existing) {
        review = {
          _id: existing._id,
          rating: existing.rating,
          body: existing.body,
          createdAt: existing.createdAt,
        };
      }
    }
    return {
      job: await toJobSummary(ctx, job, role),
      events: events
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => ({
          _id: e._id,
          kind: e.kind,
          message: e.message,
          createdAt: e.createdAt,
        })),
      deliverables,
      workFolderId: job.workFolderId,
      review,
      canReview:
        role === "buyer" && job.status === "completed" && review === null,
    };
  },
});

export const deliverJobAssets = sellerMutation({
  args: {
    jobId: v.id("marketplaceJobs"),
    assetIds: v.array(v.id("assets")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job || job.sellerUserId !== ctx.user._id) {
      throw new Error("Job not found");
    }
    if (job.status !== "in_progress" && job.status !== "delivered") {
      throw new Error("Job is not in progress");
    }
    if (!args.assetIds.length) throw new Error("Select at least one asset");
    const now = Date.now();
    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) {
        throw new Error("Asset not found or not owned");
      }
      const existing = await ctx.db
        .query("marketplaceDeliverables")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      if (existing.some((d) => d.jobId === job._id)) continue;
      await ctx.db.insert("marketplaceDeliverables", {
        jobId: job._id,
        assetId,
        note: args.note?.trim(),
        deliveredBy: ctx.user._id,
        deliveredAt: now,
      });
    }
    await ctx.db.patch(job._id, {
      status: "delivered",
      deliveredAt: now,
      updatedAt: now,
    });
    await appendJobEvent(ctx, {
      jobId: job._id,
      actorUserId: ctx.user._id,
      kind: "delivered",
      message: args.note?.trim() || `Delivered ${args.assetIds.length} asset(s)`,
    });
    return null;
  },
});

export const acceptJobDelivery = authedMutation({
  args: { jobId: v.id("marketplaceJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job || job.buyerUserId !== ctx.user._id) {
      throw new Error("Job not found");
    }
    await completeJobWithRelease(ctx, job, ctx.user._id, "Buyer accepted delivery");
    return null;
  },
});

export const cancelJobBeforeDelivery = authedMutation({
  args: {
    jobId: v.id("marketplaceJobs"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job) throw new Error("Job not found");
    const isBuyer = job.buyerUserId === ctx.user._id;
    const isSeller = job.sellerUserId === ctx.user._id;
    if (!isBuyer && !isSeller) throw new Error("Unauthorized");
    if (job.status !== "in_progress" && job.status !== "in_escrow") {
      throw new Error("Can only cancel before delivery");
    }
    if (!job.escrowHoldId) throw new Error("No escrow hold");
    await refundMarketplaceEscrow(ctx, {
      holdId: job.escrowHoldId,
      reason: args.reason ?? "Job cancelled before delivery",
    });
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });
    await appendJobEvent(ctx, {
      jobId: job._id,
      actorUserId: ctx.user._id,
      kind: "cancelled",
      message: args.reason ?? "Cancelled; escrow refunded",
    });
    return null;
  },
});

export const autoAcceptDeliveredJobs = internalMutation({
  args: {},
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - AUTO_ACCEPT_MS;
    const delivered = await ctx.db
      .query("marketplaceJobs")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .collect();
    let accepted = 0;
    for (const job of delivered) {
      if (!job.deliveredAt || job.deliveredAt > cutoff) continue;
      await completeJobWithRelease(
        ctx,
        job,
        undefined,
        "Auto-accepted after 7 days",
      );
      accepted += 1;
    }
    return { accepted };
  },
});

/** Lightweight public check used by profile UI. */
export const isApprovedSellerUser = query({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const seller = await getMarketplaceSellerForUser(ctx, args.userId);
    return Boolean(seller && seller.status === "approved");
  },
});

export const viewerCanSeeSellerOffers = query({
  args: { username: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase().replace(/^@/, "");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) return false;
    const seller = await getMarketplaceSellerForUser(ctx, profile.userId);
    if (!seller || seller.status !== "approved") return false;
    const offers = await ctx.db
      .query("marketplaceOffers")
      .withIndex("by_seller", (q) => q.eq("sellerId", seller._id))
      .collect();
    return offers.some((o) => o.status === "published");
  },
});

// —— Verified-purchase ratings & reviews ——

const publicReviewReturn = v.object({
  _id: v.id("marketplaceReviews"),
  rating: v.number(),
  body: v.optional(v.string()),
  createdAt: v.number(),
  buyerDisplayName: v.string(),
  buyerUsername: v.optional(v.string()),
  packageName: v.optional(v.string()),
});

export const listPublicOfferReviews = query({
  args: {
    offerId: v.id("marketplaceOffers"),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicReviewReturn),
  handler: async (ctx, args) => {
    const offer = await ctx.db.get("marketplaceOffers", args.offerId);
    if (!offer || offer.status !== "published") return [];
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_offer_and_created", (q) => q.eq("offerId", args.offerId))
      .order("desc")
      .take(limit);
    const out = [];
    for (const row of rows) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.buyerUserId))
        .unique();
      const job = await ctx.db.get("marketplaceJobs", row.jobId);
      out.push({
        _id: row._id,
        rating: row.rating,
        body: row.body,
        createdAt: row.createdAt,
        buyerDisplayName:
          profile?.displayName?.trim() ||
          (profile?.username ? `@${profile.username}` : "Buyer"),
        buyerUsername: profile?.username,
        packageName: job?.packageName,
      });
    }
    return out;
  },
});

/**
 * Buyer leaves a rating after a completed job (verified purchase).
 * Written review body is optional — stars are required.
 */
export const submitJobReview = authedMutation({
  args: {
    jobId: v.id("marketplaceJobs"),
    rating: v.number(),
    body: v.optional(v.string()),
  },
  returns: v.id("marketplaceReviews"),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("marketplaceJobs", args.jobId);
    if (!job || job.buyerUserId !== ctx.user._id) {
      throw new Error("Job not found");
    }
    if (job.status !== "completed") {
      throw new Error("Only completed purchases can be reviewed");
    }
    if (job.reviewId) {
      throw new Error("You already reviewed this purchase");
    }
    const existing = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .unique();
    if (existing) {
      throw new Error("You already reviewed this purchase");
    }
    const rating = Math.floor(args.rating);
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be 1 to 5 stars");
    }
    const body = args.body?.trim().slice(0, 2000) || undefined;
    const now = Date.now();
    const reviewId = await ctx.db.insert("marketplaceReviews", {
      jobId: job._id,
      offerId: job.offerId,
      sellerUserId: job.sellerUserId,
      buyerUserId: ctx.user._id,
      rating,
      body,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      reviewId,
      updatedAt: now,
    });
    const offer = await ctx.db.get("marketplaceOffers", job.offerId);
    if (offer) {
      await ctx.db.patch(offer._id, {
        ratingSum: (offer.ratingSum ?? 0) + rating,
        ratingCount: (offer.ratingCount ?? 0) + 1,
        updatedAt: now,
      });
    }
    await appendJobEvent(ctx, {
      jobId: job._id,
      actorUserId: ctx.user._id,
      kind: "reviewed",
      message: body
        ? `Rated ${rating}/5 — ${body.slice(0, 80)}`
        : `Rated ${rating}/5`,
    });
    return reviewId;
  },
});
