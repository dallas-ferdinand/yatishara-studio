/**
 * Wave 3 — Creative Network + asset store HTTP surface.
 * Scope: marketplace (user-level; not sandbox-limited).
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import {
  authenticateStudioRequest,
  type StudioHttpAuth,
} from "./lib/studioApi/requestAuth";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseOptionalId,
  readJsonBody,
  signedUrlExpiryUnix,
} from "./lib/studioApi/httpHelpers";

type AuthContext = Pick<StudioHttpAuth, "userId" | "apiKeyId" | "scopes" | "role">;

type OfferPackage = {
  name: string;
  description: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
};

type OfferStatus = "draft" | "published" | "paused" | "archived";
type ListingAudioType = "music" | "sfx";

async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope?: string,
): Promise<AuthContext | Response> {
  const auth = await authenticateStudioRequest(ctx, request, requiredScope);
  if (auth instanceof Response) return auth;
  return {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes: auth.scopes,
    role: auth.role,
  };
}

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

function asId<T extends TableNames>(_table: T, value: string): Id<T> {
  return value as Id<T>;
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function resolveExpiresUnix(url: URL): number {
  return (
    parseOptionalNumber(url.searchParams.get("expiresUnix")) ??
    signedUrlExpiryUnix()
  );
}

function parseOfferStatus(value: unknown): OfferStatus | null {
  if (
    value === "draft" ||
    value === "published" ||
    value === "paused" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function parseAudioType(value: string | null): ListingAudioType | undefined {
  if (value === "music" || value === "sfx") return value;
  return undefined;
}

export const studioApiNetwork = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  const started = Date.now();
  const url = new URL(request.url);
  const route = routePath(url.pathname);
  const expiresUnix = resolveExpiresUnix(url);
  let audit: { apiKeyId: Id<"apiKeys">; userId: Id<"users"> } | null = null;

  const finish = async (response: Response) => {
    if (audit) {
      await ctx
        .runMutation(internal.studioApiInternal.logApiRequest, {
          apiKeyId: audit.apiKeyId,
          userId: audit.userId,
          method: request.method,
          route: `/api/v1/${route}`,
          status: response.status,
          latencyMs: Date.now() - started,
        })
        .catch(() => {});
    }
    return response;
  };

  const authFor = async (scope: string): Promise<AuthContext | Response> => {
    const auth = await authenticateRequest(ctx, request, scope);
    if (!(auth instanceof Response)) {
      audit = { apiKeyId: auth.apiKeyId, userId: auth.userId };
    }
    return auth;
  };

  try {
    if (!route.startsWith("network")) {
      return finish(errorResponse("Not found", 404));
    }

    // —— Public offers ——

    if (request.method === "GET" && route === "network/offers") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const offers = await ctx.runQuery(
        internal.marketplace.listPublicOffersForApi,
        {
          userId: auth.userId,
          category: url.searchParams.get("category") ?? undefined,
          limit: parseOptionalNumber(url.searchParams.get("limit")),
          expiresUnix,
        },
      );
      return finish(jsonResponse({ offers }));
    }

    const sellerOffersMatch = route.match(
      /^network\/sellers\/([^/]+)\/offers$/,
    );
    if (request.method === "GET" && sellerOffersMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const offers = await ctx.runQuery(
        internal.marketplace.listPublicOffersByUsernameForApi,
        {
          userId: auth.userId,
          username: decodeURIComponent(sellerOffersMatch[1]!),
          expiresUnix,
        },
      );
      return finish(jsonResponse({ offers }));
    }

    const sellerHireMatch = route.match(/^network\/sellers\/([^/]+)\/hire$/);
    if (request.method === "GET" && sellerHireMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runQuery(
        internal.marketplace.viewerCanSeeSellerOffersForApi,
        {
          userId: auth.userId,
          username: decodeURIComponent(sellerHireMatch[1]!),
        },
      );
      return finish(jsonResponse({ hire: result }));
    }

    const approvedSellerMatch = route.match(
      /^network\/sellers\/approved\/([^/]+)$/,
    );
    if (request.method === "GET" && approvedSellerMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const approved = await ctx.runQuery(
        internal.marketplace.isApprovedSellerUserForApi,
        {
          userId: auth.userId,
          targetUserId: asId("users", approvedSellerMatch[1]!),
        },
      );
      return finish(jsonResponse({ approved }));
    }

    if (request.method === "GET" && route === "network/me/seller") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const seller = await ctx.runQuery(
        internal.marketplace.getMySellerStatusForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse({ seller }));
    }

    if (request.method === "GET" && route === "network/me/offers") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const offers = await ctx.runQuery(internal.marketplace.listMyOffersForApi, {
        userId: auth.userId,
        expiresUnix,
      });
      return finish(jsonResponse({ offers }));
    }

    if (request.method === "POST" && route === "network/me/offers") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        title?: string;
        description?: string;
        priceCents?: number;
        category?: string;
        deliveryDays?: number;
        packages?: OfferPackage[];
        coverAssetId?: string;
        sampleAssetIds?: string[];
      }>(request);
      if (!body.title || !body.description) {
        return finish(errorResponse("title and description are required", 400));
      }
      if (body.priceCents == null || body.deliveryDays == null) {
        if (!body.packages || body.packages.length === 0) {
          return finish(
            errorResponse(
              "priceCents and deliveryDays are required (or provide packages)",
              400,
            ),
          );
        }
      }
      const offerId = await ctx.runMutation(
        internal.marketplace.createOfferForApi,
        {
          userId: auth.userId,
          title: body.title,
          description: body.description,
          priceCents: body.priceCents ?? 0,
          category: body.category,
          deliveryDays: body.deliveryDays ?? 1,
          packages: body.packages,
          coverAssetId: body.coverAssetId
            ? asId("assets", body.coverAssetId)
            : undefined,
          sampleAssetIds: body.sampleAssetIds?.map((id) => asId("assets", id)),
        },
      );
      return finish(jsonResponse({ offerId }));
    }

    const myOfferStatusMatch = route.match(
      /^network\/me\/offers\/([^/]+)\/status$/,
    );
    if (request.method === "POST" && myOfferStatusMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ status?: string }>(request);
      const status = parseOfferStatus(body.status);
      if (!status) {
        return finish(errorResponse("valid status is required", 400));
      }
      await ctx.runMutation(internal.marketplace.setOfferStatusForApi, {
        userId: auth.userId,
        offerId: asId("marketplaceOffers", myOfferStatusMatch[1]!),
        status,
      });
      return finish(jsonResponse({ ok: true }));
    }

    const myOfferMatch = route.match(/^network\/me\/offers\/([^/]+)$/);
    if (request.method === "PATCH" && myOfferMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        title?: string;
        description?: string;
        priceCents?: number;
        category?: string;
        deliveryDays?: number;
        packages?: OfferPackage[] | null;
        coverAssetId?: string | null;
        sampleAssetIds?: string[];
      }>(request);
      await ctx.runMutation(internal.marketplace.updateOfferForApi, {
        userId: auth.userId,
        offerId: asId("marketplaceOffers", myOfferMatch[1]!),
        title: body.title,
        description: body.description,
        priceCents: body.priceCents,
        category: body.category,
        deliveryDays: body.deliveryDays,
        packages: body.packages,
        coverAssetId:
          body.coverAssetId === null
            ? null
            : body.coverAssetId
              ? asId("assets", body.coverAssetId)
              : undefined,
        sampleAssetIds: body.sampleAssetIds?.map((id) => asId("assets", id)),
      });
      return finish(jsonResponse({ ok: true }));
    }

    const offerReviewsMatch = route.match(
      /^network\/offers\/([^/]+)\/reviews$/,
    );
    if (request.method === "GET" && offerReviewsMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const reviews = await ctx.runQuery(
        internal.marketplace.listPublicOfferReviewsForApi,
        {
          userId: auth.userId,
          offerId: asId("marketplaceOffers", offerReviewsMatch[1]!),
          limit: parseOptionalNumber(url.searchParams.get("limit")),
        },
      );
      return finish(jsonResponse({ reviews }));
    }

    const offerQuoteMatch = route.match(/^network\/offers\/([^/]+)\/quote$/);
    if (request.method === "GET" && offerQuoteMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const packageIndex = parseOptionalNumber(
        url.searchParams.get("packageIndex"),
      );
      const quote = await ctx.runQuery(
        internal.marketplace.quoteBookOfferForApi,
        {
          userId: auth.userId,
          offerId: asId("marketplaceOffers", offerQuoteMatch[1]!),
          packageIndex,
        },
      );
      return finish(jsonResponse({ quote }));
    }

    const offerBookMatch = route.match(/^network\/offers\/([^/]+)\/book$/);
    if (request.method === "POST" && offerBookMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ packageIndex?: number }>(request);
      const result = await ctx.runMutation(internal.marketplace.bookOfferForApi, {
        userId: auth.userId,
        offerId: asId("marketplaceOffers", offerBookMatch[1]!),
        packageIndex: body.packageIndex,
      });
      return finish(jsonResponse(result));
    }

    // GET /network/offers/:slug — after action suffixes
    if (request.method === "GET" && route.startsWith("network/offers/")) {
      const slug = route.slice("network/offers/".length);
      if (slug && !slug.includes("/")) {
        const auth = await authFor("marketplace");
        if (auth instanceof Response) return finish(auth);
        const offer = await ctx.runQuery(
          internal.marketplace.getPublicOfferBySlugForApi,
          { userId: auth.userId, slug, expiresUnix },
        );
        if (!offer) {
          return finish(errorResponse("Offer not found", 404));
        }
        return finish(jsonResponse({ offer }));
      }
    }

    // —— Jobs ——

    if (request.method === "GET" && route === "network/jobs/seller") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const offerId = parseOptionalId(url.searchParams.get("offerId"));
      const jobs = await ctx.runQuery(
        internal.marketplace.listMySellerJobsForApi,
        {
          userId: auth.userId,
          offerId: offerId
            ? asId("marketplaceOffers", offerId)
            : undefined,
        },
      );
      return finish(jsonResponse({ jobs }));
    }

    if (request.method === "GET" && route === "network/jobs/buyer") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const jobs = await ctx.runQuery(
        internal.marketplace.listMyBuyerJobsForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse({ jobs }));
    }

    const jobsWithPeerMatch = route.match(/^network\/jobs\/with\/([^/]+)$/);
    if (request.method === "GET" && jobsWithPeerMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const result = await ctx.runQuery(
        internal.marketplace.listJobsWithPeerForApi,
        {
          userId: auth.userId,
          peerUserId: asId("users", jobsWithPeerMatch[1]!),
        },
      );
      return finish(jsonResponse(result));
    }

    const jobActionMatch = route.match(
      /^network\/jobs\/([^/]+)\/(deliver|accept|cancel|review)$/,
    );
    if (jobActionMatch && request.method === "POST") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const jobId = asId("marketplaceJobs", jobActionMatch[1]!);
      const action = jobActionMatch[2]!;

      if (action === "deliver") {
        const body = await readJsonBody<{
          assetIds?: string[];
          note?: string;
        }>(request);
        if (!body.assetIds || !Array.isArray(body.assetIds)) {
          return finish(errorResponse("assetIds is required", 400));
        }
        await ctx.runMutation(internal.marketplace.deliverJobAssetsForApi, {
          userId: auth.userId,
          jobId,
          assetIds: body.assetIds.map((id) => asId("assets", id)),
          note: body.note,
        });
        return finish(jsonResponse({ ok: true }));
      }

      if (action === "accept") {
        await ctx.runMutation(internal.marketplace.acceptJobDeliveryForApi, {
          userId: auth.userId,
          jobId,
        });
        return finish(jsonResponse({ ok: true }));
      }

      if (action === "cancel") {
        const body = await readJsonBody<{ reason?: string }>(request);
        await ctx.runMutation(
          internal.marketplace.cancelJobBeforeDeliveryForApi,
          {
            userId: auth.userId,
            jobId,
            reason: body.reason,
          },
        );
        return finish(jsonResponse({ ok: true }));
      }

      if (action === "review") {
        const body = await readJsonBody<{
          rating?: number;
          body?: string;
        }>(request);
        if (body.rating == null || !Number.isFinite(body.rating)) {
          return finish(errorResponse("rating is required", 400));
        }
        const reviewId = await ctx.runMutation(
          internal.marketplace.submitJobReviewForApi,
          {
            userId: auth.userId,
            jobId,
            rating: body.rating,
            body: body.body,
          },
        );
        return finish(jsonResponse({ reviewId }));
      }
    }

    if (request.method === "GET" && route.startsWith("network/jobs/")) {
      const jobId = route.slice("network/jobs/".length);
      if (jobId && !jobId.includes("/")) {
        const auth = await authFor("marketplace");
        if (auth instanceof Response) return finish(auth);
        const detail = await ctx.runQuery(internal.marketplace.getJobForApi, {
          userId: auth.userId,
          jobId: asId("marketplaceJobs", jobId),
        });
        if (!detail) {
          return finish(errorResponse("Job not found", 404));
        }
        return finish(jsonResponse(detail));
      }
    }

    // —— Asset store listings ——

    if (request.method === "GET" && route === "network/listings") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const listings = await ctx.runQuery(
        internal.assetStore.browseListingsForApi,
        {
          userId: auth.userId,
          audioType: parseAudioType(url.searchParams.get("audioType")),
          search: url.searchParams.get("search") ?? undefined,
          limit: parseOptionalNumber(url.searchParams.get("limit")),
          expiresUnix,
        },
      );
      return finish(jsonResponse({ listings }));
    }

    if (request.method === "GET" && route === "network/listings/quote") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const assetId = url.searchParams.get("assetId");
      if (!assetId) {
        return finish(errorResponse("assetId is required", 400));
      }
      const quote = await ctx.runQuery(internal.assetStore.quoteListPriceForApi, {
        userId: auth.userId,
        assetId: asId("assets", assetId),
      });
      return finish(jsonResponse({ quote }));
    }

    if (request.method === "GET" && route === "network/me/listings") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const listings = await ctx.runQuery(
        internal.assetStore.listMyListingsForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse({ listings }));
    }

    if (request.method === "GET" && route === "network/me/listings/summary") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const nowMs =
        parseOptionalNumber(url.searchParams.get("nowMs")) ?? Date.now();
      const summary = await ctx.runQuery(
        internal.assetStore.myAssetStoreSummaryForApi,
        { userId: auth.userId, nowMs },
      );
      return finish(jsonResponse({ summary }));
    }

    const myListingForAssetMatch = route.match(
      /^network\/me\/listings\/for-asset\/([^/]+)$/,
    );
    if (request.method === "GET" && myListingForAssetMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const listing = await ctx.runQuery(
        internal.assetStore.getMyListingForAssetForApi,
        {
          userId: auth.userId,
          assetId: asId("assets", myListingForAssetMatch[1]!),
        },
      );
      return finish(jsonResponse({ listing }));
    }

    if (request.method === "POST" && route === "network/me/listings/prepare") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        assetId?: string;
        title?: string;
        description?: string;
      }>(request);
      if (!body.assetId || !body.title) {
        return finish(errorResponse("assetId and title are required", 400));
      }
      const prepared = await ctx.runMutation(
        internal.assetStore.prepareListOnNetworkForApi,
        {
          userId: auth.userId,
          assetId: asId("assets", body.assetId),
          title: body.title,
          description: body.description,
        },
      );
      return finish(jsonResponse({ prepared }));
    }

    if (request.method === "POST" && route === "network/me/listings/commit") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        publicAssetId?: string;
        originalAssetId?: string;
        existingListingId?: string;
        title?: string;
        description?: string;
        audioType?: string;
        durationSeconds?: number;
        generateCredits?: number;
        priceCredits?: number;
      }>(request);
      if (
        !body.publicAssetId ||
        !body.originalAssetId ||
        !body.title ||
        (body.audioType !== "music" && body.audioType !== "sfx") ||
        body.generateCredits == null ||
        body.priceCredits == null
      ) {
        return finish(
          errorResponse(
            "publicAssetId, originalAssetId, title, audioType, generateCredits, and priceCredits are required",
            400,
          ),
        );
      }
      const listingId = await ctx.runMutation(
        internal.assetStore.commitListOnNetworkForApi,
        {
          userId: auth.userId,
          publicAssetId: asId("assets", body.publicAssetId),
          originalAssetId: asId("assets", body.originalAssetId),
          existingListingId: body.existingListingId
            ? asId("assetListings", body.existingListingId)
            : undefined,
          title: body.title,
          description: body.description,
          audioType: body.audioType,
          durationSeconds: body.durationSeconds,
          generateCredits: body.generateCredits,
          priceCredits: body.priceCredits,
        },
      );
      return finish(jsonResponse({ listingId }));
    }

    const myListingUnlistMatch = route.match(
      /^network\/me\/listings\/([^/]+)\/unlist$/,
    );
    if (request.method === "POST" && myListingUnlistMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.assetStore.unlistFromNetworkForApi, {
        userId: auth.userId,
        listingId: asId("assetListings", myListingUnlistMatch[1]!),
      });
      return finish(jsonResponse({ ok: true }));
    }

    if (request.method === "GET" && route.startsWith("network/me/listings/")) {
      const listingId = route.slice("network/me/listings/".length);
      if (listingId && !listingId.includes("/")) {
        const auth = await authFor("marketplace");
        if (auth instanceof Response) return finish(auth);
        const listing = await ctx.runQuery(
          internal.assetStore.getMyListingDetailForApi,
          {
            userId: auth.userId,
            listingId: asId("assetListings", listingId),
            expiresUnix,
          },
        );
        if (!listing) {
          return finish(errorResponse("Listing not found", 404));
        }
        return finish(jsonResponse({ listing }));
      }
    }

    // Orchestrated list: prepare → Bunny copy → commit
    if (request.method === "POST" && route === "network/listings") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        assetId?: string;
        title?: string;
        description?: string;
      }>(request);
      if (!body.assetId || !body.title?.trim()) {
        return finish(errorResponse("assetId and title are required", 400));
      }
      const prepared = await ctx.runMutation(
        internal.assetStore.prepareListOnNetworkForApi,
        {
          userId: auth.userId,
          assetId: asId("assets", body.assetId),
          title: body.title.trim(),
          description: body.description,
        },
      );
      if (!prepared.alreadyReady) {
        if (!prepared.sourceBunnyPath || !prepared.destBunnyPath) {
          return finish(errorResponse("Listing copy paths missing", 400));
        }
        await ctx.runAction(internal.assetStoreActions.copyListMedia, {
          publicAssetId: prepared.publicAssetId,
          sellerUserId: auth.userId,
          sourceBunnyPath: prepared.sourceBunnyPath,
          destBunnyPath: prepared.destBunnyPath,
          mimeType: prepared.mimeType,
        });
      }
      const listingId = await ctx.runMutation(
        internal.assetStore.commitListOnNetworkForApi,
        {
          userId: auth.userId,
          publicAssetId: prepared.publicAssetId,
          originalAssetId: prepared.originalAssetId,
          existingListingId: prepared.existingListingId,
          title: prepared.title,
          description: prepared.description,
          audioType: prepared.audioType,
          durationSeconds: prepared.durationSeconds,
          generateCredits: prepared.generateCredits,
          priceCredits: prepared.priceCredits,
        },
      );
      return finish(jsonResponse({ listingId }));
    }

    const listingPreparePurchaseMatch = route.match(
      /^network\/listings\/([^/]+)\/prepare-purchase$/,
    );
    if (request.method === "POST" && listingPreparePurchaseMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const prepared = await ctx.runMutation(
        internal.assetStore.preparePurchaseForApi,
        {
          userId: auth.userId,
          listingId: asId("assetListings", listingPreparePurchaseMatch[1]!),
        },
      );
      return finish(jsonResponse({ prepared }));
    }

    const listingPurchaseMatch = route.match(
      /^network\/listings\/([^/]+)\/purchase$/,
    );
    if (request.method === "POST" && listingPurchaseMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const prepared = await ctx.runMutation(
        internal.assetStore.preparePurchaseForApi,
        {
          userId: auth.userId,
          listingId: asId("assetListings", listingPurchaseMatch[1]!),
        },
      );
      if (prepared.alreadyOwned) {
        return finish(
          jsonResponse({
            purchaseId: prepared.purchaseId,
            buyerAssetId: prepared.buyerAssetId,
            alreadyOwned: true,
          }),
        );
      }
      await ctx.runAction(internal.assetStoreActions.copyPurchaseMedia, {
        purchaseId: prepared.purchaseId,
        buyerUserId: auth.userId,
        sourceBunnyPath: prepared.sourceBunnyPath,
        destBunnyPath: prepared.destBunnyPath,
        mimeType: prepared.mimeType,
      });
      return finish(
        jsonResponse({
          purchaseId: prepared.purchaseId,
          buyerAssetId: prepared.buyerAssetId,
          alreadyOwned: false,
        }),
      );
    }

    if (request.method === "GET" && route.startsWith("network/listings/")) {
      const listingId = route.slice("network/listings/".length);
      if (listingId && !listingId.includes("/") && listingId !== "quote") {
        const auth = await authFor("marketplace");
        if (auth instanceof Response) return finish(auth);
        const listing = await ctx.runQuery(internal.assetStore.getListingForApi, {
          userId: auth.userId,
          listingId: asId("assetListings", listingId),
          expiresUnix,
        });
        if (!listing) {
          return finish(errorResponse("Listing not found", 404));
        }
        return finish(jsonResponse({ listing }));
      }
    }

    const finalizePurchaseMatch = route.match(
      /^network\/purchases\/([^/]+)\/finalize$/,
    );
    if (request.method === "POST" && finalizePurchaseMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        bunnyPath?: string;
        byteSize?: number;
        mimeType?: string;
      }>(request);
      if (
        !body.bunnyPath ||
        body.byteSize == null ||
        !Number.isFinite(body.byteSize) ||
        !body.mimeType
      ) {
        return finish(
          errorResponse("bunnyPath, byteSize, and mimeType are required", 400),
        );
      }
      const assetId = await ctx.runMutation(
        internal.assetStore.finalizePurchaseCopyForApi,
        {
          userId: auth.userId,
          purchaseId: asId("assetPurchases", finalizePurchaseMatch[1]!),
          bunnyPath: body.bunnyPath,
          byteSize: body.byteSize,
          mimeType: body.mimeType,
        },
      );
      return finish(jsonResponse({ assetId }));
    }



    if (request.method === "POST" && route === "network/me/listings/fail-copy") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        publicAssetId?: string;
        error?: string;
      }>(request);
      if (!body.publicAssetId || !body.error) {
        return finish(errorResponse("publicAssetId and error are required", 400));
      }
      await ctx.runMutation(internal.assetStore.failListCopyForApi, {
        userId: auth.userId,
        publicAssetId: asId("assets", body.publicAssetId),
        error: body.error,
      });
      return finish(jsonResponse({ ok: true }));
    }

    const failPurchaseMatch = route.match(
      /^network\/purchases\/([^/]+)\/fail$/,
    );
    if (request.method === "POST" && failPurchaseMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ error?: string }>(request);
      if (!body.error) {
        return finish(errorResponse("error is required", 400));
      }
      await ctx.runMutation(internal.assetStore.failPurchaseCopyForApi, {
        userId: auth.userId,
        purchaseId: asId("assetPurchases", failPurchaseMatch[1]!),
        error: body.error,
      });
      return finish(jsonResponse({ ok: true }));
    }

    // —— Seller KYC apply ——

    if (request.method === "POST" && route === "network/me/seller/docs/prepare") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const uploadUrl = await ctx.runMutation(
        internal.marketplace.prepareSellerDocUploadForApi,
        { userId: auth.userId },
      );
      return finish(jsonResponse({ uploadUrl }));
    }

    if (request.method === "POST" && route === "network/me/seller/docs/commit") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        storageId?: string;
        filename?: string;
        docKind?: string;
        mimeType?: string;
        byteSize?: number;
      }>(request);
      if (!body.storageId || !body.filename || !body.docKind || !body.mimeType) {
        return finish(
          errorResponse("storageId, filename, docKind, and mimeType are required", 400),
        );
      }
      const result = await ctx.runAction(
        internal.marketplaceActions.commitSellerDocUploadForApi,
        {
          userId: auth.userId,
          storageId: body.storageId as Id<"_storage">,
          filename: body.filename,
          docKind: body.docKind,
          mimeType: body.mimeType,
          byteSize: body.byteSize,
        },
      );
      return finish(jsonResponse(result));
    }

    if (request.method === "POST" && route === "network/me/seller/apply") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<Record<string, unknown>>(request);
      const sellerId = await ctx.runMutation(
        internal.marketplace.requestSellerAccessForApi,
        {
          userId: auth.userId,
          entityType: body.entityType as "freelancer" | "business",
          businessName: String(body.businessName ?? ""),
          legalName: String(body.legalName ?? ""),
          phone: String(body.phone ?? ""),
          residentialAddress: String(body.residentialAddress ?? ""),
          identityDoc1Kind: body.identityDoc1Kind as
            | "national_id"
            | "passport"
            | "drivers_permit"
            | "birth_certificate",
          identityDoc1BunnyPath: String(body.identityDoc1BunnyPath ?? ""),
          identityDoc1BackBunnyPath: body.identityDoc1BackBunnyPath
            ? String(body.identityDoc1BackBunnyPath)
            : undefined,
          identityDoc2Kind: body.identityDoc2Kind as
            | "national_id"
            | "passport"
            | "drivers_permit"
            | "birth_certificate",
          identityDoc2BunnyPath: String(body.identityDoc2BunnyPath ?? ""),
          identityDoc2BackBunnyPath: body.identityDoc2BackBunnyPath
            ? String(body.identityDoc2BackBunnyPath)
            : undefined,
          proofOfResidentialAddressBunnyPath: String(
            body.proofOfResidentialAddressBunnyPath ?? "",
          ),
          businessType: body.businessType as
            | "sole_trader"
            | "limited_company"
            | "partnership"
            | "other"
            | undefined,
          businessRegistrationNumber: body.businessRegistrationNumber
            ? String(body.businessRegistrationNumber)
            : undefined,
          birNumber: body.birNumber ? String(body.birNumber) : undefined,
          businessAddress: body.businessAddress
            ? String(body.businessAddress)
            : undefined,
          businessRegistrationBunnyPath: body.businessRegistrationBunnyPath
            ? String(body.businessRegistrationBunnyPath)
            : undefined,
          proofOfBusinessAddressBunnyPath: body.proofOfBusinessAddressBunnyPath
            ? String(body.proofOfBusinessAddressBunnyPath)
            : undefined,
        },
      );
      return finish(jsonResponse({ sellerId }));
    }

    if (request.method === "POST" && route === "network/me/seller/cancel") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.marketplace.cancelSellerRequestForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ ok: true }));
    }

    // —— Seller payout bank ——

    if (request.method === "GET" && route === "network/me/payout") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const payout = await ctx.runQuery(internal.marketplace.getMyPayoutAccountForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ payout }));
    }

    if (request.method === "PUT" && route === "network/me/payout") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        bankName?: string;
        accountName?: string;
        accountNumber?: string;
        accountType?: "chequing" | "savings";
        branch?: string;
        note?: string;
      }>(request);
      if (!body.bankName || !body.accountName || !body.accountNumber || !body.accountType) {
        return finish(
          errorResponse("bankName, accountName, accountNumber, and accountType are required", 400),
        );
      }
      await ctx.runMutation(internal.marketplace.saveMyPayoutAccountForApi, {
        userId: auth.userId,
        bankName: body.bankName,
        accountName: body.accountName,
        accountNumber: body.accountNumber,
        accountType: body.accountType,
        branch: body.branch,
        note: body.note,
      });
      return finish(jsonResponse({ ok: true }));
    }

    const releaseListingMatch = route.match(
      /^network\/me\/listings\/([^/]+)\/release$/,
    );
    if (request.method === "POST" && releaseListingMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.assetStore.releaseListingToPlatformForApi, {
        userId: auth.userId,
        listingId: asId("assetListings", releaseListingMatch[1]!),
      });
      return finish(jsonResponse({ ok: true }));
    }

    // —— Admin marketplace (role-gated in ForApi) ——

    if (request.method === "GET" && route === "network/admin/sellers") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const status = url.searchParams.get("status") as
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | null;
      const sellers = await ctx.runQuery(internal.marketplace.adminListSellersForApi, {
        userId: auth.userId,
        status: status || undefined,
      });
      return finish(jsonResponse({ sellers }));
    }

    const adminSellerMatch = route.match(/^network\/admin\/sellers\/([^/]+)$/);
    if (request.method === "GET" && adminSellerMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const seller = await ctx.runQuery(
        internal.marketplace.adminGetSellerApplicationForApi,
        {
          userId: auth.userId,
          sellerId: asId("marketplaceSellers", adminSellerMatch[1]!),
        },
      );
      if (!seller) return finish(errorResponse("Seller not found", 404));
      return finish(jsonResponse({ seller }));
    }

    const adminSellerDecideMatch = route.match(
      /^network\/admin\/sellers\/([^/]+)\/decide$/,
    );
    if (request.method === "POST" && adminSellerDecideMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        decision?: "approve" | "reject" | "suspend";
        reason?: string;
      }>(request);
      if (!body.decision) {
        return finish(errorResponse("decision is required", 400));
      }
      await ctx.runMutation(internal.marketplace.adminDecideSellerForApi, {
        userId: auth.userId,
        sellerId: asId("marketplaceSellers", adminSellerDecideMatch[1]!),
        decision: body.decision,
        reason: body.reason,
      });
      return finish(jsonResponse({ ok: true }));
    }

    if (request.method === "GET" && route === "network/admin/offers") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const status = url.searchParams.get("status") as
        | "draft"
        | "published"
        | "paused"
        | "archived"
        | null;
      const offers = await ctx.runQuery(internal.marketplace.adminListOffersForApi, {
        userId: auth.userId,
        status: status || undefined,
      });
      return finish(jsonResponse({ offers }));
    }

    const adminOfferStatusMatch = route.match(
      /^network\/admin\/offers\/([^/]+)\/status$/,
    );
    if (request.method === "POST" && adminOfferStatusMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        status?: "paused" | "published" | "archived";
      }>(request);
      if (!body.status) return finish(errorResponse("status is required", 400));
      await ctx.runMutation(internal.marketplace.adminSetOfferStatusForApi, {
        userId: auth.userId,
        offerId: asId("marketplaceOffers", adminOfferStatusMatch[1]!),
        status: body.status,
      });
      return finish(jsonResponse({ ok: true }));
    }

    if (request.method === "GET" && route === "network/admin/jobs") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const status = url.searchParams.get("status") || undefined;
      const jobs = await ctx.runQuery(internal.marketplace.adminListJobsForApi, {
        userId: auth.userId,
        status: status as
          | "pending_payment"
          | "in_escrow"
          | "in_progress"
          | "delivered"
          | "completed"
          | "cancelled"
          | "refunded"
          | undefined,
      });
      return finish(jsonResponse({ jobs }));
    }

    const adminJobRefundMatch = route.match(
      /^network\/admin\/jobs\/([^/]+)\/refund$/,
    );
    if (request.method === "POST" && adminJobRefundMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ reason?: string }>(request);
      await ctx.runMutation(internal.marketplace.adminRefundJobForApi, {
        userId: auth.userId,
        jobId: asId("marketplaceJobs", adminJobRefundMatch[1]!),
        reason: body.reason,
      });
      return finish(jsonResponse({ ok: true }));
    }

    if (request.method === "GET" && route === "network/admin/payouts") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const status = url.searchParams.get("status") as "owed" | "paid" | null;
      const payouts = await ctx.runQuery(internal.marketplace.adminListPayoutsForApi, {
        userId: auth.userId,
        status: status || undefined,
      });
      return finish(jsonResponse({ payouts }));
    }

    const adminPayoutPaidMatch = route.match(
      /^network\/admin\/payouts\/([^/]+)\/paid$/,
    );
    if (request.method === "POST" && adminPayoutPaidMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ adminNote?: string }>(request);
      await ctx.runMutation(internal.marketplace.adminMarkPayoutPaidForApi, {
        userId: auth.userId,
        payoutId: asId("sellerPayouts", adminPayoutPaidMatch[1]!),
        adminNote: body.adminNote,
      });
      return finish(jsonResponse({ ok: true }));
    }

    if (request.method === "GET" && route === "network/admin/listings") {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const filter = url.searchParams.get("filter") || undefined;
      const listings = await ctx.runQuery(
        internal.assetStore.adminListAssetSubmissionsForApi,
        {
          userId: auth.userId,
          filter: filter as
            | "pending_review"
            | "listed"
            | "rejected"
            | "unlisted"
            | "removed"
            | "platform_owned"
            | "all"
            | undefined,
          expiresUnix,
        },
      );
      return finish(jsonResponse({ listings }));
    }

    const adminListingApproveMatch = route.match(
      /^network\/admin\/listings\/([^/]+)\/approve$/,
    );
    if (request.method === "POST" && adminListingApproveMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.assetStore.adminApproveListingForApi, {
        userId: auth.userId,
        listingId: asId("assetListings", adminListingApproveMatch[1]!),
      });
      return finish(jsonResponse({ ok: true }));
    }

    const adminListingRejectMatch = route.match(
      /^network\/admin\/listings\/([^/]+)\/reject$/,
    );
    if (request.method === "POST" && adminListingRejectMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ reason?: string }>(request);
      if (!body.reason?.trim()) {
        return finish(errorResponse("reason is required", 400));
      }
      await ctx.runMutation(internal.assetStore.adminRejectListingForApi, {
        userId: auth.userId,
        listingId: asId("assetListings", adminListingRejectMatch[1]!),
        reason: body.reason,
      });
      return finish(jsonResponse({ ok: true }));
    }

    const adminListingRemoveMatch = route.match(
      /^network\/admin\/listings\/([^/]+)\/remove$/,
    );
    if (request.method === "POST" && adminListingRemoveMatch) {
      const auth = await authFor("marketplace");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{ reason?: string }>(request);
      await ctx.runMutation(internal.assetStore.adminRemoveListingForApi, {
        userId: auth.userId,
        listingId: asId("assetListings", adminListingRemoveMatch[1]!),
        reason: body.reason,
      });
      return finish(jsonResponse({ ok: true }));
    }


    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /Admin access/i.test(message)
      ? 403
      : /not found|unauthorized|cannot|required|invalid|insufficient|not available|must|approved/i.test(
            message,
          )
        ? message.toLowerCase().includes("not found")
          ? 404
          : 400
        : 500;
    return finish(errorResponse(message, status));
  }
});

export const studioApiNetworkOptions = httpAction(async () =>
  optionsResponse(),
);
