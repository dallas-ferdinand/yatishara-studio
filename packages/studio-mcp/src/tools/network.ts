/**
 * Creative Network + asset store MCP tools.
 *
 * Intended HTTP paths (Wave 3 domain ready; HTTP registration owned elsewhere):
 *
 * Offers / seller
 *   GET    /network/offers                         list public offers
 *   GET    /network/offers/:slug                   get public offer by slug
 *   GET    /network/sellers/:username/offers       list public offers by username
 *   GET    /network/sellers/:username/hire         viewerCanSeeSellerOffers
 *   GET    /network/sellers/approved/:userId       isApprovedSellerUser
 *   GET    /network/me/seller                      getMySellerStatus
 *   POST   /network/me/seller/docs/prepare         prepareSellerDocUpload
 *   POST   /network/me/seller/docs/commit          commitSellerDocUpload
 *   POST   /network/me/seller/apply                requestSellerAccess
 *   POST   /network/me/seller/cancel               cancelSellerRequest
 *   GET|PUT /network/me/payout                     payout bank
 *   /network/admin/*                              admin (role-gated)
 *   GET    /network/me/offers                      listMyOffers
 *   POST   /network/me/offers                      createOffer
 *   PATCH  /network/me/offers/:offerId             updateOffer
 *   POST   /network/me/offers/:offerId/status      setOfferStatus
 *   GET    /network/offers/:offerId/reviews        listPublicOfferReviews
 *
 * Jobs
 *   GET    /network/offers/:offerId/quote          quoteBookOffer
 *   POST   /network/offers/:offerId/book           bookOffer
 *   GET    /network/jobs/seller                    listMySellerJobs
 *   GET    /network/jobs/buyer                     listMyBuyerJobs
 *   GET    /network/jobs/with/:peerUserId           listJobsWithPeer
 *   GET    /network/jobs/:jobId                    getJob
 *   POST   /network/jobs/:jobId/deliver            deliverJobAssets
 *   POST   /network/jobs/:jobId/accept             acceptJobDelivery
 *   POST   /network/jobs/:jobId/cancel             cancelJobBeforeDelivery
 *   POST   /network/jobs/:jobId/review             submitJobReview
 *
 * Asset store (stock audio listings)
 *   GET    /network/listings                       browseListings
 *   GET    /network/listings/:listingId            getListing
 *   GET    /network/listings/quote?assetId=        quoteListPrice
 *   GET    /network/me/listings                    listMyListings
 *   GET    /network/me/listings/for-asset/:assetId getMyListingForAsset
 *   GET    /network/me/listings/summary            myAssetStoreSummary
 *   GET    /network/me/listings/:listingId         getMyListingDetail
 *   POST   /network/me/listings/prepare            prepareListOnNetwork
 *   POST   /network/me/listings/commit             commitListOnNetwork
 *   POST   /network/me/listings/fail-copy          failListCopy
 *   POST   /network/purchases/:id/fail             failPurchaseCopy
 *   POST   /network/listings                       listOnNetwork orchestrate (prepare→copy→commit)
 *   POST   /network/me/listings/:listingId/unlist  unlistFromNetwork
 *   POST   /network/listings/:listingId/prepare-purchase  preparePurchase
 *   POST   /network/listings/:listingId/purchase   purchase orchestrate (prepare→copy→finalize)
 *   POST   /network/purchases/:purchaseId/finalize finalizePurchaseCopy
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";

function expiresUnix(hours = 1): number {
  return Math.floor(Date.now() / 1000) + hours * 3600;
}

export function registerNetworkTools(server: McpServer) {
  // —— Public offers ——
  server.tool(
    "studio_list_network_offers",
    "List published Creative Network offers (public catalog). Optional category filter.",
    {
      category: z.string().optional(),
      limit: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ category, limit, compact }) => {
      const q = new URLSearchParams();
      q.set("expiresUnix", String(expiresUnix()));
      if (category) q.set("category", category);
      if (limit != null) q.set("limit", String(limit));
      return jsonResult(await studioFetch(`/network/offers?${q}`), compact);
    },
  );

  server.tool(
    "studio_get_network_offer",
    "Get a published Creative Network offer by slug (full gallery).",
    { slug: z.string(), compact: z.boolean().optional() },
    async ({ slug, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      return jsonResult(
        await studioFetch(`/network/offers/${encodeURIComponent(slug)}?${q}`),
        compact,
      );
    },
  );

  server.tool(
    "studio_list_network_offers_by_username",
    "List published offers for a seller username (Hire Me / profile).",
    { username: z.string(), compact: z.boolean().optional() },
    async ({ username, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      return jsonResult(
        await studioFetch(
          `/network/sellers/${encodeURIComponent(username)}/offers?${q}`,
        ),
        compact,
      );
    },
  );

  server.tool(
    "studio_network_hire_label",
    "Whether a username has hireable published offers; returns Hire Me / Hire Us label or null.",
    { username: z.string(), compact: z.boolean().optional() },
    async ({ username, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/sellers/${encodeURIComponent(username)}/hire`,
        ),
        compact,
      ),
  );

  server.tool(
    "studio_is_approved_seller",
    "Check whether a userId is an approved Creative Network seller.",
    { targetUserId: z.string(), compact: z.boolean().optional() },
    async ({ targetUserId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/sellers/approved/${encodeURIComponent(targetUserId)}`,
        ),
        compact,
      ),
  );

  server.tool(
    "studio_get_my_seller_status",
    "Get the API key owner's Creative Network seller application status (or null if never applied).",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(await studioFetch("/network/me/seller"), compact),
  );

  // —— My offers (approved seller) ——
  server.tool(
    "studio_list_my_offers",
    "List the seller's own Creative Network offers (all statuses). Requires approved seller.",
    { compact: z.boolean().optional() },
    async ({ compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      return jsonResult(await studioFetch(`/network/me/offers?${q}`), compact);
    },
  );

  server.tool(
    "studio_create_offer",
    "Create a draft Creative Network offer. Requires approved seller + marketplace write scope.",
    {
      title: z.string(),
      description: z.string(),
      priceCents: z.number(),
      deliveryDays: z.number(),
      category: z.string().optional(),
      packages: z
        .array(
          z.object({
            name: z.string(),
            description: z.string(),
            priceCents: z.number(),
            deliveryDays: z.number(),
            revisions: z.number(),
            features: z.array(z.string()),
          }),
        )
        .optional(),
      coverAssetId: z.string().optional(),
      sampleAssetIds: z.array(z.string()).optional(),
      compact: z.boolean().optional(),
    },
    async (args) => {
      const { compact, ...body } = args;
      return jsonResult(
        await studioFetch("/network/me/offers", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      );
    },
  );

  server.tool(
    "studio_update_offer",
    "Update an owned Creative Network offer. Requires approved seller.",
    {
      offerId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priceCents: z.number().optional(),
      category: z.string().optional(),
      deliveryDays: z.number().optional(),
      packages: z
        .union([
          z.array(
            z.object({
              name: z.string(),
              description: z.string(),
              priceCents: z.number(),
              deliveryDays: z.number(),
              revisions: z.number(),
              features: z.array(z.string()),
            }),
          ),
          z.null(),
        ])
        .optional(),
      coverAssetId: z.union([z.string(), z.null()]).optional(),
      sampleAssetIds: z.array(z.string()).optional(),
      compact: z.boolean().optional(),
    },
    async (args) => {
      const { offerId, compact, ...body } = args;
      return jsonResult(
        await studioFetch(`/network/me/offers/${encodeURIComponent(offerId)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
        compact,
      );
    },
  );

  server.tool(
    "studio_set_offer_status",
    "Set offer status: draft | published | paused | archived. Requires approved seller.",
    {
      offerId: z.string(),
      status: z.enum(["draft", "published", "paused", "archived"]),
      compact: z.boolean().optional(),
    },
    async ({ offerId, status, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/me/offers/${encodeURIComponent(offerId)}/status`,
          { method: "POST", body: JSON.stringify({ status }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_list_offer_reviews",
    "List verified-purchase reviews for a published offer.",
    {
      offerId: z.string(),
      limit: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ offerId, limit, compact }) => {
      const q = new URLSearchParams();
      if (limit != null) q.set("limit", String(limit));
      const qs = q.toString();
      return jsonResult(
        await studioFetch(
          `/network/offers/${encodeURIComponent(offerId)}/reviews${qs ? `?${qs}` : ""}`,
        ),
        compact,
      );
    },
  );

  // —— Jobs ——
  server.tool(
    "studio_quote_book_offer",
    "Quote escrow price/credits to book an offer (optional packageIndex).",
    {
      offerId: z.string(),
      packageIndex: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ offerId, packageIndex, compact }) => {
      const q = new URLSearchParams();
      if (packageIndex != null) q.set("packageIndex", String(packageIndex));
      const qs = q.toString();
      return jsonResult(
        await studioFetch(
          `/network/offers/${encodeURIComponent(offerId)}/quote${qs ? `?${qs}` : ""}`,
        ),
        compact,
      );
    },
  );

  server.tool(
    "studio_book_offer",
    "Book a published offer — holds payment in escrow and starts the job. Requires marketplace scope + balance.",
    {
      offerId: z.string(),
      packageIndex: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ offerId, packageIndex, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/offers/${encodeURIComponent(offerId)}/book`,
          {
            method: "POST",
            body: JSON.stringify({ packageIndex }),
          },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_list_my_seller_jobs",
    "List jobs where the API key owner is the seller. Optional offerId filter.",
    { offerId: z.string().optional(), compact: z.boolean().optional() },
    async ({ offerId, compact }) => {
      const q = new URLSearchParams();
      if (offerId) q.set("offerId", offerId);
      const qs = q.toString();
      return jsonResult(
        await studioFetch(`/network/jobs/seller${qs ? `?${qs}` : ""}`),
        compact,
      );
    },
  );

  server.tool(
    "studio_list_my_buyer_jobs",
    "List jobs where the API key owner is the buyer.",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(await studioFetch("/network/jobs/buyer"), compact),
  );

  server.tool(
    "studio_list_jobs_with_peer",
    "Jobs between the viewer and a peer (DM sidebar). Returns asBuyer / asSeller / sellerTotals.",
    { peerUserId: z.string(), compact: z.boolean().optional() },
    async ({ peerUserId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/jobs/with/${encodeURIComponent(peerUserId)}`,
        ),
        compact,
      ),
  );

  server.tool(
    "studio_get_job",
    "Get a marketplace job detail (events, deliverables, review eligibility).",
    { jobId: z.string(), compact: z.boolean().optional() },
    async ({ jobId, compact }) =>
      jsonResult(
        await studioFetch(`/network/jobs/${encodeURIComponent(jobId)}`),
        compact,
      ),
  );

  server.tool(
    "studio_deliver_job",
    "Seller delivers assetIds for a job (moves status to delivered).",
    {
      jobId: z.string(),
      assetIds: z.array(z.string()),
      note: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ jobId, assetIds, note, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/jobs/${encodeURIComponent(jobId)}/deliver`,
          { method: "POST", body: JSON.stringify({ assetIds, note }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_accept_job_delivery",
    "Buyer accepts delivered work — releases escrow to platform/seller payout.",
    { jobId: z.string(), compact: z.boolean().optional() },
    async ({ jobId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/jobs/${encodeURIComponent(jobId)}/accept`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_cancel_job",
    "Cancel a job before delivery (buyer or seller) — refunds escrow.",
    {
      jobId: z.string(),
      reason: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ jobId, reason, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/jobs/${encodeURIComponent(jobId)}/cancel`,
          { method: "POST", body: JSON.stringify({ reason }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_submit_job_review",
    "Buyer leaves a 1–5 star review after a completed job (optional body).",
    {
      jobId: z.string(),
      rating: z.number().min(1).max(5),
      body: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ jobId, rating, body, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/jobs/${encodeURIComponent(jobId)}/review`,
          { method: "POST", body: JSON.stringify({ rating, body }) },
        ),
        compact,
      ),
  );

  // —— Asset store ——
  server.tool(
    "studio_browse_network_listings",
    "Browse listed Creative Network stock audio (music/sfx).",
    {
      audioType: z.enum(["music", "sfx"]).optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ audioType, search, limit, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      if (audioType) q.set("audioType", audioType);
      if (search) q.set("search", search);
      if (limit != null) q.set("limit", String(limit));
      return jsonResult(await studioFetch(`/network/listings?${q}`), compact);
    },
  );

  server.tool(
    "studio_get_network_listing",
    "Get a single listed stock-audio listing card (preview URL, ownership).",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      return jsonResult(
        await studioFetch(
          `/network/listings/${encodeURIComponent(listingId)}?${q}`,
        ),
        compact,
      );
    },
  );

  server.tool(
    "studio_quote_list_price",
    "Quote whether an owned audio asset can be listed and at what price.",
    { assetId: z.string(), compact: z.boolean().optional() },
    async ({ assetId, compact }) => {
      const q = new URLSearchParams({ assetId });
      return jsonResult(
        await studioFetch(`/network/listings/quote?${q}`),
        compact,
      );
    },
  );

  server.tool(
    "studio_list_my_listings",
    "List the seller's stock-audio listings (manage pane).",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(await studioFetch("/network/me/listings"), compact),
  );

  server.tool(
    "studio_get_my_listing_for_asset",
    "Find the seller's listing row for a given assetId (if any).",
    { assetId: z.string(), compact: z.boolean().optional() },
    async ({ assetId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/me/listings/for-asset/${encodeURIComponent(assetId)}`,
        ),
        compact,
      ),
  );

  server.tool(
    "studio_my_asset_store_summary",
    "Seller asset-store summary: listed/pending counts and funds (TTD cents).",
    { compact: z.boolean().optional() },
    async ({ compact }) => {
      const q = new URLSearchParams({ nowMs: String(Date.now()) });
      return jsonResult(
        await studioFetch(`/network/me/listings/summary?${q}`),
        compact,
      );
    },
  );

  server.tool(
    "studio_get_my_listing_detail",
    "Seller listing detail with orders and unlist/release flags.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      return jsonResult(
        await studioFetch(
          `/network/me/listings/${encodeURIComponent(listingId)}?${q}`,
        ),
        compact,
      );
    },
  );

  server.tool(
    "studio_list_on_network",
    "List owned stock audio on Creative Network (prepare → Bunny copy → commit). Requires approved seller.",
    {
      assetId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ assetId, title, description, compact }) =>
      jsonResult(
        await studioFetch("/network/listings", {
          method: "POST",
          body: JSON.stringify({ assetId, title, description }),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_prepare_list_on_network",
    "Step 1 of listing stock audio: prepare Public catalog copy paths. Prefer studio_list_on_network for the full pipeline. On copy failure call studio_fail_list_copy.",
    {
      assetId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/listings/prepare", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_commit_list_on_network",
    "Step 3 of listing stock audio: commit listing after Bunny copy is ready. Use fields returned from prepare (+ copy).",
    {
      publicAssetId: z.string(),
      originalAssetId: z.string(),
      title: z.string(),
      audioType: z.enum(["music", "sfx"]),
      generateCredits: z.number(),
      priceCredits: z.number(),
      description: z.string().optional(),
      existingListingId: z.string().optional(),
      durationSeconds: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/listings/commit", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_fail_list_copy",
    "Mark a failed Public catalog copy after studio_prepare_list_on_network (cleanup pending asset).",
    {
      publicAssetId: z.string(),
      error: z.string(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/listings/fail-copy", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_prepare_purchase_listing",
    "Step 1 of purchase: debit/escrow + return copy paths. Prefer studio_purchase_network_listing for the full pipeline.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/listings/${encodeURIComponent(listingId)}/prepare-purchase`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_finalize_purchase_copy",
    "Step 3 of purchase: finalize buyer asset after Bunny copy succeeded.",
    {
      purchaseId: z.string(),
      bunnyPath: z.string(),
      byteSize: z.number(),
      mimeType: z.string(),
      compact: z.boolean().optional(),
    },
    async ({ purchaseId, compact, ...body }) =>
      jsonResult(
        await studioFetch(
          `/network/purchases/${encodeURIComponent(purchaseId)}/finalize`,
          { method: "POST", body: JSON.stringify(body) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_fail_purchase_copy",
    "Refund/void a purchase when Bunny copy fails after prepare-purchase.",
    {
      purchaseId: z.string(),
      error: z.string(),
      compact: z.boolean().optional(),
    },
    async ({ purchaseId, error, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/purchases/${encodeURIComponent(purchaseId)}/fail`,
          { method: "POST", body: JSON.stringify({ error }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_unlist_from_network",
    "Unlist / withdraw a seller listing (no purchases). Does not delete the asset.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/me/listings/${encodeURIComponent(listingId)}/unlist`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_purchase_network_listing",
    "Purchase a stock-audio listing (prepare → Bunny copy → finalize). Debits balance.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/listings/${encodeURIComponent(listingId)}/purchase`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );


  // —— Seller KYC ——
  server.tool(
    "studio_prepare_seller_doc_upload",
    "Get a Convex staging upload URL for a seller KYC document. Upload the file to uploadUrl, then studio_commit_seller_doc_upload.",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(
        await studioFetch("/network/me/seller/docs/prepare", {
          method: "POST",
          body: "{}",
        }),
        compact,
      ),
  );

  server.tool(
    "studio_commit_seller_doc_upload",
    "Promote a staged KYC blob to Bunny. Returns { bunnyPath } for studio_request_seller_access.",
    {
      storageId: z.string(),
      filename: z.string(),
      docKind: z.string().describe("e.g. national_id, passport, residential_proof"),
      mimeType: z.string(),
      byteSize: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/seller/docs/commit", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  const identityKind = z.enum([
    "national_id",
    "passport",
    "drivers_permit",
    "birth_certificate",
  ]);

  server.tool(
    "studio_request_seller_access",
    "Submit Creative Network seller KYC application. Upload docs via prepare→commit first; pass returned bunnyPaths. Paths must be under users/{userId}/marketplace-kyc/.",
    {
      entityType: z.enum(["freelancer", "business"]),
      businessName: z.string(),
      legalName: z.string(),
      phone: z.string(),
      residentialAddress: z.string(),
      identityDoc1Kind: identityKind,
      identityDoc1BunnyPath: z.string(),
      identityDoc1BackBunnyPath: z.string().optional(),
      identityDoc2Kind: identityKind,
      identityDoc2BunnyPath: z.string(),
      identityDoc2BackBunnyPath: z.string().optional(),
      proofOfResidentialAddressBunnyPath: z.string(),
      businessType: z
        .enum(["sole_trader", "limited_company", "partnership", "other"])
        .optional(),
      businessRegistrationNumber: z.string().optional(),
      birNumber: z.string().optional(),
      businessAddress: z.string().optional(),
      businessRegistrationBunnyPath: z.string().optional(),
      proofOfBusinessAddressBunnyPath: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/seller/apply", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_cancel_seller_request",
    "Withdraw a pending seller application (before admin approval).",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(
        await studioFetch("/network/me/seller/cancel", {
          method: "POST",
          body: "{}",
        }),
        compact,
      ),
  );

  // —— Payout bank ——
  server.tool(
    "studio_get_my_payout_account",
    "Get the seller payout bank details (Settings → Payouts).",
    { compact: z.boolean().optional() },
    async ({ compact }) =>
      jsonResult(await studioFetch("/network/me/payout"), compact),
  );

  server.tool(
    "studio_save_my_payout_account",
    "Save seller payout bank details. Requires an existing seller application/row.",
    {
      bankName: z.string(),
      accountName: z.string(),
      accountNumber: z.string(),
      accountType: z.enum(["chequing", "savings"]),
      branch: z.string().optional(),
      note: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ compact, ...body }) =>
      jsonResult(
        await studioFetch("/network/me/payout", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_release_listing_to_platform",
    "Release a sold stock listing to the platform (future profits = platform). Seller only.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/me/listings/${encodeURIComponent(listingId)}/release`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );

  // —— Admin (API key owner must be admin | super_admin) ——
  server.tool(
    "studio_admin_list_sellers",
    "Admin: list seller applications. Optional status filter.",
    {
      status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
      compact: z.boolean().optional(),
    },
    async ({ status, compact }) => {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      const suffix = q.toString() ? `?${q}` : "";
      return jsonResult(await studioFetch(`/network/admin/sellers${suffix}`), compact);
    },
  );

  server.tool(
    "studio_admin_get_seller_application",
    "Admin: get one seller application with signed KYC document URLs.",
    { sellerId: z.string(), compact: z.boolean().optional() },
    async ({ sellerId, compact }) =>
      jsonResult(
        await studioFetch(`/network/admin/sellers/${encodeURIComponent(sellerId)}`),
        compact,
      ),
  );

  server.tool(
    "studio_admin_decide_seller",
    "Admin: approve | reject | suspend a seller. Reject requires reason.",
    {
      sellerId: z.string(),
      decision: z.enum(["approve", "reject", "suspend"]),
      reason: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ sellerId, decision, reason, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/sellers/${encodeURIComponent(sellerId)}/decide`,
          { method: "POST", body: JSON.stringify({ decision, reason }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_list_offers",
    "Admin: list marketplace offers.",
    {
      status: z.enum(["draft", "published", "paused", "archived"]).optional(),
      compact: z.boolean().optional(),
    },
    async ({ status, compact }) => {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      const suffix = q.toString() ? `?${q}` : "";
      return jsonResult(await studioFetch(`/network/admin/offers${suffix}`), compact);
    },
  );

  server.tool(
    "studio_admin_set_offer_status",
    "Admin: set offer status to paused | published | archived.",
    {
      offerId: z.string(),
      status: z.enum(["paused", "published", "archived"]),
      compact: z.boolean().optional(),
    },
    async ({ offerId, status, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/offers/${encodeURIComponent(offerId)}/status`,
          { method: "POST", body: JSON.stringify({ status }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_list_jobs",
    "Admin: list hire jobs (booked offers).",
    {
      status: z
        .enum([
          "pending_payment",
          "in_escrow",
          "in_progress",
          "delivered",
          "completed",
          "cancelled",
          "refunded",
        ])
        .optional(),
      compact: z.boolean().optional(),
    },
    async ({ status, compact }) => {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      const suffix = q.toString() ? `?${q}` : "";
      return jsonResult(await studioFetch(`/network/admin/jobs${suffix}`), compact);
    },
  );

  server.tool(
    "studio_admin_refund_job",
    "Admin: refund escrow on a job (delivered/in_progress/in_escrow).",
    {
      jobId: z.string(),
      reason: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ jobId, reason, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/jobs/${encodeURIComponent(jobId)}/refund`,
          { method: "POST", body: JSON.stringify({ reason }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_list_payouts",
    "Admin: list seller payouts (owed/paid).",
    {
      status: z.enum(["owed", "paid"]).optional(),
      compact: z.boolean().optional(),
    },
    async ({ status, compact }) => {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      const suffix = q.toString() ? `?${q}` : "";
      return jsonResult(await studioFetch(`/network/admin/payouts${suffix}`), compact);
    },
  );

  server.tool(
    "studio_admin_mark_payout_paid",
    "Admin: mark a seller payout as paid (manual bank transfer).",
    {
      payoutId: z.string(),
      adminNote: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ payoutId, adminNote, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/payouts/${encodeURIComponent(payoutId)}/paid`,
          { method: "POST", body: JSON.stringify({ adminNote }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_list_asset_submissions",
    "Admin: list stock-audio listing submissions.",
    {
      filter: z
        .enum([
          "pending_review",
          "listed",
          "rejected",
          "unlisted",
          "removed",
          "platform_owned",
          "all",
        ])
        .optional(),
      compact: z.boolean().optional(),
    },
    async ({ filter, compact }) => {
      const q = new URLSearchParams({ expiresUnix: String(expiresUnix()) });
      if (filter) q.set("filter", filter);
      return jsonResult(await studioFetch(`/network/admin/listings?${q}`), compact);
    },
  );

  server.tool(
    "studio_admin_approve_listing",
    "Admin: approve a pending stock listing.",
    { listingId: z.string(), compact: z.boolean().optional() },
    async ({ listingId, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/listings/${encodeURIComponent(listingId)}/approve`,
          { method: "POST", body: "{}" },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_reject_listing",
    "Admin: reject a pending stock listing (reason required).",
    {
      listingId: z.string(),
      reason: z.string(),
      compact: z.boolean().optional(),
    },
    async ({ listingId, reason, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/listings/${encodeURIComponent(listingId)}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) },
        ),
        compact,
      ),
  );

  server.tool(
    "studio_admin_remove_listing",
    "Admin: remove a listing and profit-ban it.",
    {
      listingId: z.string(),
      reason: z.string().optional(),
      compact: z.boolean().optional(),
    },
    async ({ listingId, reason, compact }) =>
      jsonResult(
        await studioFetch(
          `/network/admin/listings/${encodeURIComponent(listingId)}/remove`,
          { method: "POST", body: JSON.stringify({ reason }) },
        ),
        compact,
      ),
  );

}
