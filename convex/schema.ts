import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const userRole = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("super_admin"),
);

export const assetKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("document"),
);

export const elementType = v.union(
  v.literal("character"),
  v.literal("prop"),
  v.literal("location"),
  v.literal("doc"),
  v.literal("style_sheet"),
);

export const elementRenderMode = v.union(
  v.literal("photoreal"),
  v.literal("illustrated_2d"),
  v.literal("illustrated_3d"),
  v.literal("mixed"),
);

export const generationMode = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
);

export const audioGenType = v.union(
  v.literal("voiceover"),
  v.literal("sfx"),
  v.literal("music"),
);

/** Music create path: structured plan (default), plain prompt, or extend/inpaint. */
export const musicWorkflow = v.union(
  v.literal("composition_plan"),
  v.literal("prompt"),
  v.literal("extend"),
);

export const musicModelId = v.union(v.literal("music_v1"), v.literal("music_v2"));

export const generationSource = v.union(v.literal("ui"), v.literal("api"));

export const apiKeyScope = v.union(
  v.literal("read"),
  v.literal("write"),
  v.literal("generate"),
  v.literal("messages"),
  v.literal("social"),
  v.literal("marketplace"),
);

export const generationTier = v.union(
  v.literal("image"),
  v.literal("pro_video"),
  v.literal("audio"),
  // Legacy image tiers on older jobs
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const generationStage = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("saving"),
  v.literal("done"),
  v.literal("failed"),
);

export const generationEventKind = v.union(
  v.literal("prompt"),
  v.literal("result"),
  v.literal("folder_switched"),
  v.literal("stage"),
  /** Assistance co-pilot replies, question cards, and review/approval cards. */
  v.literal("assistant"),
  v.literal("question"),
  v.literal("review"),
  v.literal("approval"),
);

export const assistedMode = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("script"),
  v.literal("element"),
);

export const videoType = v.union(
  v.literal("standard"),
  v.literal("hypermotion_ad"),
);

export const guidedBriefStatus = v.union(
  v.literal("collecting"),
  v.literal("awaiting_input"),
  v.literal("review_ready"),
  v.literal("approved"),
  v.literal("generating"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("abandoned"),
);

export const guidedAttachmentRole = v.union(
  v.literal("product"),
  v.literal("logo"),
  v.literal("style"),
  v.literal("motion"),
  v.literal("audio"),
  v.literal("start_frame"),
  v.literal("supporting"),
  v.literal("reference"),
);

export const paymentMethod = v.union(
  v.literal("bank"),
  v.literal("card"),
  v.literal("paywise"),
  v.literal("wam"),
);

export const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("needs_review"),
  v.literal("checkout_failed"),
  v.literal("cancelled"),
  v.literal("receipt_uploaded"),
  v.literal("receipt_received"),
  v.literal("payment_completed"),
  v.literal("rejected"),
);

export const creditTransactionKind = v.union(
  v.literal("top_up"),
  v.literal("reserved"),
  v.literal("spent"),
  v.literal("refunded"),
  v.literal("admin_adjustment"),
  v.literal("subscription_grant"),
  v.literal("marketplace_escrow_hold"),
  v.literal("marketplace_escrow_release"),
  v.literal("marketplace_escrow_refund"),
  v.literal("storage_charge"),
  /** Creative Network stock audio (music/SFX) one-time purchase. */
  v.literal("asset_purchase"),
  /** Studio Academy course one-time purchase (lifetime access). */
  v.literal("course_purchase"),
  /** Feed Boost: 5 TTD cents from viewer wallet to post author. */
  v.literal("boost_sent"),
  v.literal("boost_received"),
);

/** Protected system folders in the explorer. */
export const folderSystemKind = v.union(
  v.literal("messages"),
  v.literal("purchased_assets"),
  /** Seller catalog copies of listed stock audio (locked). */
  v.literal("public_assets"),
  /** Live-link items others shared with this user (virtual listing). */
  v.literal("shared_with_me"),
);

/** Studio item kinds that can be live-shared to another user. */
export const studioShareItemKind = v.union(
  v.literal("asset"),
  v.literal("document"),
  v.literal("element"),
  v.literal("videoEdit"),
  v.literal("folder"),
);

/** Locked Creative Network asset licenses. */
export const assetLicenseKind = v.union(
  /** Buyer pay-once copy in Purchased. */
  v.literal("purchased_network"),
  /** Seller catalog copy in Public (source for purchases). */
  v.literal("listed_network"),
);

export const assetListingStatus = v.union(
  v.literal("pending_review"),
  v.literal("listed"),
  v.literal("unlisted"),
  v.literal("rejected"),
  v.literal("removed"),
);

export const assetListingAudioType = v.union(v.literal("music"), v.literal("sfx"));

export const marketplaceSellerStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("suspended"),
);

export const marketplaceSellerEntityType = v.union(
  v.literal("freelancer"),
  v.literal("business"),
);

export const marketplaceSellerBusinessType = v.union(
  v.literal("sole_trader"),
  v.literal("limited_company"),
  v.literal("partnership"),
  v.literal("other"),
);

export const marketplaceSellerPhotoIdKind = v.union(
  v.literal("national_id"),
  v.literal("passport"),
  v.literal("drivers_permit"),
);

/** Any of two identity docs the applicant may submit (must be different kinds). */
export const marketplaceSellerIdentityDocKind = v.union(
  v.literal("national_id"),
  v.literal("passport"),
  v.literal("drivers_permit"),
  v.literal("birth_certificate"),
);

export const marketplaceOfferStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("paused"),
  v.literal("archived"),
);

export const marketplaceJobStatus = v.union(
  v.literal("pending_payment"),
  v.literal("in_escrow"),
  v.literal("in_progress"),
  v.literal("delivered"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("refunded"),
);

export const platformEscrowHoldStatus = v.union(
  v.literal("held"),
  v.literal("released"),
  v.literal("refunded"),
);

export const sellerPayoutStatus = v.union(
  v.literal("owed"),
  v.literal("paid"),
);

export const bankAccountType = v.union(
  v.literal("chequing"),
  v.literal("savings"),
);

export const notificationKind = v.union(
  v.literal("generation_completed"),
  v.literal("generation_failed"),
  v.literal("payment_status"),
  v.literal("dm_message"),
  v.literal("followed_post"),
);

const modelHints = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    phoneVerifiedAt: v.optional(v.number()),
    image: v.optional(v.string()),
    role: userRole,
    /** Active Style Sheet for composer styled generation */
    activeStyleSheetId: v.optional(v.id("elements")),
    /**
     * Account default for Assistance mode. Missing → treated as true.
     * Per-thread value is stored on generationThreads.assistanceEnabled.
     */
    assistanceDefaultEnabled: v.optional(v.boolean()),
    /**
     * First Studio workspace tab when no open-tabs session is restored.
     * Missing → agent (Agent Mode).
     */
    defaultStudioTab: v.optional(
      v.union(
        v.literal("composer"),
        v.literal("feed"),
        v.literal("network"),
        v.literal("messages"),
        v.literal("agent"),
      ),
    ),
    /** Set when signup intent chooser (or silent backfill) completes. */
    studioIntentChosenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    /**
     * Studio tab liveness (connect/visibility). No heartbeat poller —
     * queries treat online as stale after ~3 minutes.
     */
    studioOnline: v.optional(v.boolean()),
    studioOnlineAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_role", ["role"]),

  adminInvites: defineTable({
    email: v.string(),
    role: userRole,
    invitedBy: v.id("users"),
    acceptedBy: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_accepted_by", ["acceptedBy"]),

  folders: defineTable({
    ownerId: v.id("users"),
    parentId: v.optional(v.id("folders")),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
    sortOrder: v.number(),
    /**
     * Protected system folders (Messages for DM media, Purchased for Creative
     * Network audio). Cannot be renamed, moved, or trashed.
     */
    systemKind: v.optional(folderSystemKind),
    /** Owner emoji sticker in the file manager (not Lucide icon). */
    reactionEmoji: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_parent", ["ownerId", "parentId"])
    .index("by_owner_and_deleted", ["ownerId", "deletedAt"])
    .index("by_owner_and_system_kind", ["ownerId", "systemKind"]),

  assets: defineTable({
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: assetKind,
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
    storageStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    ),
    bunnyPath: v.optional(v.string()),
    bunnyStreamVideoId: v.optional(v.string()),
    thumbnailPath: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    videoCodec: v.optional(v.string()),
    videoProfile: v.optional(v.string()),
    audioCodec: v.optional(v.string()),
    proxyKeyframeIntervalSeconds: v.optional(v.number()),
    rotation: v.optional(v.number()),
    editProxyStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    ),
    editProxyPath: v.optional(v.string()),
    editProxyByteSize: v.optional(v.number()),
    editProxy1080Path: v.optional(v.string()),
    editProxy1080ByteSize: v.optional(v.number()),
    editProxyError: v.optional(v.string()),
    editProxyUpdatedAt: v.optional(v.number()),
    sourceGenerationJobId: v.optional(v.id("generationJobs")),
    /** ElevenLabs music song id (store_for_inpainting) for extend/stems. */
    elevenMusicSongId: v.optional(v.string()),
    /** Creative Network listing this copy was purchased from. */
    sourceListingId: v.optional(v.id("assetListings")),
    /** When set, trash/delete/move-out is blocked (pay-once Network license). */
    licenseKind: v.optional(assetLicenseKind),
    /** Owner emoji sticker in the file manager. */
    reactionEmoji: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    /**
     * Hard-deleted: Bunny objects are being removed and the bytes are already
     * released from billing. The row is kept as a tombstone because many tables
     * reference `assets` by id; it is hidden from trash and folder listings.
     */
    purgedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_folder", ["folderId"])
    .index("by_folder_and_kind", ["folderId", "kind"])
    .index("by_owner_and_deleted", ["ownerId", "deletedAt"])
    .index("by_deleted_at", ["deletedAt"])
    // `duplicate` reuses the source object, so purges must check for other referrers.
    .index("by_bunny_path", ["bunnyPath"])
    .index("by_generation_job", ["sourceGenerationJobId"]),

  mediaProxyJobs: defineTable({
    assetId: v.id("assets"),
    ownerId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    attemptCount: v.number(),
    leaseUntil: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_asset", ["assetId"])
    .index("by_status", ["status"])
    .index("by_status_and_lease", ["status", "leaseUntil"]),

  documents: defineTable({
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.string(),
    /** script (default) = .md; post = Create-post draft (.post file). */
    kind: v.optional(v.union(v.literal("script"), v.literal("post"))),
    assetId: v.optional(v.id("assets")),
    /** Owner emoji sticker in the file manager. */
    reactionEmoji: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_folder", ["folderId"])
    .index("by_asset", ["assetId"]),

  elements: defineTable({
    ownerId: v.id("users"),
    folderId: v.optional(v.id("folders")),
    type: elementType,
    name: v.string(),
    description: v.optional(v.string()),
    /**
     * photographic = real subject; sheet must match uploaded reference photos (min refs).
     * designed = fictional prop/character/location; direct sheet from description — no photo refs required.
     */
    sourceMode: v.optional(
      v.union(v.literal("photographic"), v.literal("designed")),
    ),
    /** @deprecated Use referenceAssetIds — kept for legacy rows only */
    sourceAssetIds: v.array(v.id("assets")),
    /** Uploaded photos used only to build the sheet — not sent to generation */
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    /** Built reference sheet image — used when element is attached to generation */
    sheetAssetId: v.optional(v.id("assets")),
    /** Style Sheet only — markdown rules (palette, line weight, forbidden, etc.) */
    styleRules: v.optional(v.string()),
    /** Style Sheet only — render mode hint for generation */
    renderMode: v.optional(elementRenderMode),
    builtAt: v.optional(v.number()),
    sourceDocumentId: v.optional(v.id("documents")),
    /** Owner emoji sticker in the file manager. */
    reactionEmoji: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_type", ["ownerId", "type"])
    .index("by_folder", ["folderId"]),

  stylePresets: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("any")),
    systemInstructions: v.string(),
    scriptInstructions: v.optional(v.string()),
    storytelling: v.optional(v.boolean()),
    tagline: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    modelHints: v.optional(modelHints),
    thumbnailAssetId: v.optional(v.id("assets")),
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_enabled_and_sort", ["enabled", "sortOrder"]),

  generationThreads: defineTable({
    ownerId: v.id("users"),
    linkedFolderId: v.id("folders"),
    title: v.string(),
    sortOrder: v.number(),
    archivedAt: v.optional(v.number()),
    /** Thread-sticky Assistance mode. Undefined → fall back to user default. */
    assistanceEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_archived", ["ownerId", "archivedAt"])
    .index("by_owner_archived_updated", ["ownerId", "archivedAt", "updatedAt"])
    .index("by_folder", ["linkedFolderId"]),

  generationEvents: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    kind: generationEventKind,
    order: v.number(),
    prompt: v.optional(v.string()),
    stage: v.optional(generationStage),
    generationJobId: v.optional(v.id("generationJobs")),
    assetIds: v.optional(v.array(v.id("assets"))),
    fromFolderId: v.optional(v.id("folders")),
    toFolderId: v.optional(v.id("folders")),
    /** Assistance card linkage */
    briefId: v.optional(v.id("guidedBriefs")),
    briefRevision: v.optional(v.number()),
    /** Assistant prose / review summary */
    message: v.optional(v.string()),
    /** Serialized guided questions for question cards */
    questionsJson: v.optional(v.string()),
    /** Immutable Assistance review data for historical confirmation cards. */
    briefSnapshotJson: v.optional(v.string()),
    /** Generic paid/destructive Assistance approval linkage. */
    approvalId: v.optional(v.id("assistanceApprovals")),
    createdAt: v.number(),
  })
    .index("by_thread_and_order", ["threadId", "order"])
    .index("by_owner", ["ownerId"])
    .index("by_job", ["generationJobId"])
    .index("by_brief", ["briefId"]),

  /**
   * Durable Assistance brief — one active draft per thread (mode + optional video type).
   * Accumulates edits until the user Approves; generation then snapshots into generationJobs.
   */
  guidedBriefs: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    mode: assistedMode,
    /** Only meaningful when mode === "video". */
    videoType: v.optional(videoType),
    status: guidedBriefStatus,
    revision: v.number(),
    /** Latest user prompt / notes that fed the brief. */
    userPrompt: v.string(),
    /** Structured pending request payload (JSON-compatible object). */
    payload: v.any(),
    lockedFields: v.array(v.string()),
    inferredFields: v.array(v.string()),
    assumptions: v.array(v.string()),
    warnings: v.array(v.string()),
    offeredOptionalIds: v.array(v.string()),
    skippedOptionalIds: v.array(v.string()),
    pendingQuestionsJson: v.optional(v.string()),
    /** @deprecated Prefer agentStateJson. Kept readable for compatibility. */
    agentPlanJson: v.optional(v.string()),
    /** Sanitized multi-turn Assistance agent state (no private reasoning). */
    agentStateJson: v.optional(v.string()),
    compiledPrompt: v.optional(v.string()),
    /** Immutable normalized inputs shown at review and consumed by approval. */
    generationPlanJson: v.optional(v.string()),
    generationPlanFingerprint: v.optional(v.string()),
    estimatedCredits: v.optional(v.number()),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    approvedRevision: v.optional(v.number()),
    approvedJobId: v.optional(v.id("generationJobs")),
    approvedDocumentId: v.optional(v.id("documents")),
    approvedElementId: v.optional(v.id("elements")),
    approvedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_job", ["approvedJobId"]),

  guidedBriefAttachments: defineTable({
    briefId: v.id("guidedBriefs"),
    ownerId: v.id("users"),
    assetId: v.optional(v.id("assets")),
    documentId: v.optional(v.id("documents")),
    elementId: v.optional(v.id("elements")),
    role: guidedAttachmentRole,
    label: v.optional(v.string()),
    sortOrder: v.number(),
    briefRevision: v.number(),
    createdAt: v.number(),
  })
    .index("by_brief", ["briefId"])
    .index("by_asset", ["assetId"])
    .index("by_document", ["documentId"])
    .index("by_element", ["elementId"]),

  /**
   * Idempotent Assistance chat turns. Begin → analyze → commit/fail.
   * Brief mutations and chat events happen only on commit.
   */
  assistanceTurns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    briefId: v.id("guidedBriefs"),
    clientTurnId: v.string(),
    phase: v.union(
      v.literal("begun"),
      v.literal("committed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    briefRevisionAtBegin: v.number(),
    briefRevisionAtCommit: v.optional(v.number()),
    userPrompt: v.string(),
    requestJson: v.optional(v.string()),
    analysisJson: v.optional(v.string()),
    resultJson: v.optional(v.string()),
    creditTransactionId: v.optional(v.id("creditTransactions")),
    modelId: v.optional(v.string()),
    repaired: v.optional(v.boolean()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brief_and_client_turn", ["briefId", "clientTurnId"])
    .index("by_thread", ["threadId"])
    .index("by_brief", ["briefId"])
    .index("by_owner", ["ownerId"]),

  assistanceToolCalls: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    turnId: v.id("assistanceTurns"),
    toolCallId: v.string(),
    toolName: v.string(),
    argumentsJson: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    outputJson: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_turn_and_call", ["turnId", "toolCallId"])
    .index("by_turn", ["turnId"])
    .index("by_owner", ["ownerId"]),

  assistanceApprovals: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    briefId: v.id("guidedBriefs"),
    turnId: v.id("assistanceTurns"),
    toolCallId: v.string(),
    action: v.union(
      v.literal("trash"),
      v.literal("move"),
      v.literal("generation"),
      v.literal("element_build"),
    ),
    title: v.string(),
    summary: v.string(),
    argumentsJson: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    estimatedCredits: v.optional(v.number()),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    executedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_turn_and_call", ["turnId", "toolCallId"])
    .index("by_thread_and_status", ["threadId", "status"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_brief", ["briefId"]),

  generationJobs: defineTable({

    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    saveFolderId: v.id("folders"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    enhancedPrompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    stage: generationStage,
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    /** Image quality for GPT Image 2: low | medium | high */
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    /** Audio gen subtype: voiceover | sfx | music */
    audioType: v.optional(audioGenType),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
    /** Music: force instrumental output (ElevenLabs force_instrumental). */
    forceInstrumental: v.optional(v.boolean()),
    /** Music workflow: composition_plan (default) | prompt | extend. */
    musicWorkflow: v.optional(musicWorkflow),
    /** Eleven Music model: music_v1 | music_v2 (default). */
    musicModelId: v.optional(musicModelId),
    /** Optional music finetune id. */
    musicFinetuneId: v.optional(v.string()),
    /** Optional custom lyrics injected into plan/prompt (not a separate EL endpoint). */
    musicCustomLyrics: v.optional(v.string()),
    /** Optional pre-built composition plan JSON (music_v2 chunks). */
    musicCompositionPlanJson: v.optional(v.string()),
    /** Store song for later extend/inpaint (compose_detailed). */
    musicStoreForInpainting: v.optional(v.boolean()),
    /** Source song id when extending / inpainting. */
    musicSourceSongId: v.optional(v.string()),
    /** Milliseconds of source song to keep when extending. */
    musicKeepMs: v.optional(v.number()),
    /** Result song id from store_for_inpainting / detailed compose. */
    elevenMusicSongId: v.optional(v.string()),
    /** Result / source composition plan JSON after music gen. */
    musicPlanResultJson: v.optional(v.string()),
    externalTaskId: v.optional(v.string()),
    error: v.optional(v.string()),
    reservedCreditTransactionId: v.optional(v.id("creditTransactions")),
    spentCreditTransactionId: v.optional(v.id("creditTransactions")),
    source: v.optional(generationSource),
    apiKeyId: v.optional(v.id("apiKeys")),
    skipPromptEnhancement: v.optional(v.boolean()),
    /** Atomic execution claim so duplicate schedules cannot run the provider twice. */
    executionAttemptId: v.optional(v.string()),
    /** Soft lease deadline for the current execution attempt (watchdog reclaim). */
    executionLeaseUntil: v.optional(v.number()),
    /** How many times this job has been claimed for execution. */
    executionAttemptCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_thread", ["threadId"])
    .index("by_stage", ["stage"])
    .index("by_external_task", ["externalTaskId"])
    .index("by_owner_and_created", ["ownerId", "createdAt"])
    .index("by_api_key_and_stage", ["apiKeyId", "stage"]),

  /** Studio-owned “My Voices” — library picks saved per user. */
  savedVoices: defineTable({
    ownerId: v.id("users"),
    voiceId: v.string(),
    publicOwnerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    language: v.optional(v.string()),
    accent: v.optional(v.string()),
    gender: v.optional(v.string()),
    age: v.optional(v.string()),
    useCase: v.optional(v.string()),
    /** ElevenLabs category (premade | professional | …). */
    category: v.optional(v.string()),
    addedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_voice", ["ownerId", "voiceId"]),

  generationInputs: defineTable({
    jobId: v.id("generationJobs"),
    assetId: v.optional(v.id("assets")),
    documentId: v.optional(v.id("documents")),
    elementId: v.optional(v.id("elements")),
    kind: v.union(v.literal("asset"), v.literal("document"), v.literal("element")),
    role: v.optional(guidedAttachmentRole),
    sortOrder: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_asset", ["assetId"])
    .index("by_document", ["documentId"])
    .index("by_element", ["elementId"]),

  generationOutputs: defineTable({
    jobId: v.id("generationJobs"),
    assetId: v.id("assets"),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_asset", ["assetId"]),

  billingAccounts: defineTable({
    userId: v.id("users"),
    creditBalance: v.number(),
    reservedCredits: v.number(),
    /** Balance after last top-up / positive grant — ring 100%. Resets on next grant. */
    creditBalanceHigh: v.optional(v.number()),
    activeSubscriptionId: v.optional(v.id("subscriptions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  creditTransactions: defineTable({
    userId: v.id("users"),
    billingAccountId: v.id("billingAccounts"),
    kind: creditTransactionKind,
    amount: v.number(),
    balanceAfter: v.number(),
    generationJobId: v.optional(v.id("generationJobs")),
    marketplaceJobId: v.optional(v.id("marketplaceJobs")),
    assetPurchaseId: v.optional(v.id("assetPurchases")),
    coursePurchaseId: v.optional(v.id("academyPurchases")),
    paymentId: v.optional(v.id("payments")),
    reversesTransactionId: v.optional(v.id("creditTransactions")),
    reason: v.optional(v.string()),
    /** Measured token breakdown for text charges (audit / exact COGS). */
    usageJson: v.optional(v.string()),
    adminId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_payment", ["paymentId"])
    .index("by_generation_job", ["generationJobId"])
    .index("by_marketplace_job", ["marketplaceJobId"])
    .index("by_asset_purchase", ["assetPurchaseId"])
    .index("by_course_purchase", ["coursePurchaseId"])
    .index("by_reversed_transaction", ["reversesTransactionId"]),

  /**
   * Per-user Bunny storage meter. `currentBytes` tracks what is stored;
   * the monthly cron charges the full rate for that snapshot on the 1st.
   */
  storageBilling: defineTable({
    userId: v.id("users"),
    currentBytes: v.number(),
    outstandingCredits: v.number(),
    outstandingSince: v.optional(v.number()),
    lastMonthlyChargeAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_outstanding_since", ["outstandingSince"])
    .index("by_last_monthly_charge", ["lastMonthlyChargeAt"]),

  subscriptionPlans: defineTable({
    name: v.string(),
    slug: v.string(),
    /** Discounted monthly charge (what they pay on a monthly plan). */
    monthlyPriceCents: v.number(),
    /** Face monthly dollars in cents (what they receive each month). */
    originalMonthlyPriceCents: v.optional(v.number()),
    /** Monthly-plan discount percent. */
    discountPercent: v.optional(v.number()),
    /** Prepaid-year discount percent. Credits still grant monthly. */
    annualDiscountPercent: v.optional(v.number()),
    includedMonthlyCredits: v.number(),
    topUpCreditPriceCents: v.number(),
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_enabled_and_sort", ["enabled", "sortOrder"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    planId: v.id("subscriptionPlans"),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    interval: v.optional(v.union(v.literal("month"), v.literal("year"))),
    wamSubscriptionId: v.optional(v.string()),
    wamPaymentMethodId: v.optional(v.string()),
    customerReference: v.optional(v.string()),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    /** Annual term end — yearly Wam charge is due here. */
    termEnd: v.optional(v.number()),
    monthsGrantedThisTerm: v.optional(v.number()),
    lastGrantAt: v.optional(v.number()),
    pastDueSince: v.optional(v.number()),
    /** Stop the next charge; access stays until currentPeriodEnd. */
    cancelAtPeriodEnd: v.optional(v.boolean()),
    cancelScheduledAt: v.optional(v.number()),
    sourcePaymentId: v.optional(v.id("payments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_wam_subscription", ["wamSubscriptionId"])
    .index("by_status_and_period_end", ["status", "currentPeriodEnd"])
    .index("by_status_and_past_due", ["status", "pastDueSince"]),

  pricingSettings: defineTable({
    key: v.string(),
    creditPriceCents: v.number(),
    imageCredits: v.optional(v.number()),
    videoCredits: v.optional(v.number()),
    imageLowCredits: v.optional(v.number()),
    imageMediumCredits: v.optional(v.number()),
    imageHighCredits: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  bankAccounts: defineTable({
    label: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    accountNumber: v.string(),
    accountType: bankAccountType,
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_enabled_and_sort", ["enabled", "sortOrder"]),

  payments: defineTable({
    userId: v.id("users"),
    method: paymentMethod,
    status: paymentStatus,
    amountCents: v.number(),
    creditsGranted: v.optional(v.number()),
    subscriptionPlanId: v.optional(v.id("subscriptionPlans")),
    billingInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
    bankAccountId: v.optional(v.id("bankAccounts")),
    externalPaymentId: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    /** Short public id for studio.yatishara.com/pay/<code> (Sophie + hosted checkout). */
    publicPayCode: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    lastStatusCheckedAt: v.optional(v.number()),
    nextStatusCheckAt: v.optional(v.number()),
    statusCheckAttempts: v.optional(v.number()),
    reconciliationLeaseUntil: v.optional(v.number()),
    callbackToken: v.optional(v.string()),
    reference: v.optional(v.string()),
    /** When set, auto-purchase this Academy course after PayWise credits land. */
    academyCourseId: v.optional(v.id("academyCourses")),
    rejectionReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_method_and_status", ["method", "status"])
    .index("by_client_request", ["clientRequestId"])
    .index("by_external_payment", ["externalPaymentId"])
    .index("by_public_pay_code", ["publicPayCode"])
    .index("by_status_and_next_check", ["status", "nextStatusCheckAt"])
    .index("by_method_status_and_next_check", ["method", "status", "nextStatusCheckAt"]),

  paywiseCallbackEvents: defineTable({
    paymentId: v.id("payments"),
    endpoint: v.union(v.literal("notify"), v.literal("callback")),
    method: v.string(),
    requestId: v.optional(v.string()),
    bodySha256: v.optional(v.string()),
    accepted: v.boolean(),
    failureReason: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_payment", ["paymentId"])
    .index("by_received_at", ["receivedAt"]),

  paymentReceipts: defineTable({
    paymentId: v.id("payments"),
    userId: v.id("users"),
    assetId: v.optional(v.id("assets")),
    bunnyPath: v.string(),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_payment", ["paymentId"])
    .index("by_user", ["userId"]),

  notifications: defineTable({
    userId: v.id("users"),
    kind: notificationKind,
    title: v.string(),
    body: v.string(),
    readAt: v.optional(v.number()),
    generationJobId: v.optional(v.id("generationJobs")),
    paymentId: v.optional(v.id("payments")),
    conversationId: v.optional(v.id("dmConversations")),
    postId: v.optional(v.id("profilePosts")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "readAt"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  whatsappAuthRequests: defineTable({
    phone: v.string(),
    code: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("consumed"),
      v.literal("expired"),
    ),
    attempts: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_phone_and_created", ["phone", "createdAt"])
    .index("by_status_and_expires", ["status", "expiresAt"]),

  apiKeys: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    scopes: v.array(v.string()),
    sandboxFolderId: v.optional(v.id("folders")),
    defaultFolderId: v.optional(v.id("folders")),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_hash", ["keyHash"]),

  apiRequestLog: defineTable({
    apiKeyId: v.id("apiKeys"),
    userId: v.id("users"),
    method: v.string(),
    route: v.string(),
    status: v.number(),
    latencyMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_key_and_created", ["apiKeyId", "createdAt"]),

  adminAuditEvents: defineTable({
    adminId: v.id("users"),
    kind: v.string(),
    targetUserId: v.optional(v.id("users")),
    paymentId: v.optional(v.id("payments")),
    generationJobId: v.optional(v.id("generationJobs")),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_admin", ["adminId"])
    .index("by_target_user", ["targetUserId"])
    .index("by_payment", ["paymentId"])
    .index("by_generation_job", ["generationJobId"]),

  videoEditProjects: defineTable({
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    name: v.string(),
    projectJson: v.string(),
    sourceAssetId: v.optional(v.id("assets")),
    outputAssetId: v.optional(v.id("assets")),
    /** Owner emoji sticker in the file manager. */
    reactionEmoji: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_folder", ["folderId"])
    .index("by_source_asset", ["sourceAssetId"]),

  /** Live progress for editor Export (video/audio). Client polls by id. */
  exportJobs: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("videoEditProjects")),
    kind: v.union(v.literal("video"), v.literal("audio")),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("error"),
    ),
    phase: v.string(),
    progress: v.number(),
    error: v.optional(v.string()),
    resultAssetId: v.optional(v.id("assets")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  /** Public creative identity — separate from private account details on users. */
  profiles: defineTable({
    userId: v.id("users"),
    /** Unique browser-friendly handle, stored lowercase. */
    username: v.string(),
    /**
     * True when Studio picked the handle from the account name / fallback.
     * False after they claim or change it — never auto-overwrite a custom handle.
     */
    usernameAutoAssigned: v.optional(v.boolean()),
    /** @deprecated Legacy freeform label — public reads ignore this. */
    displayName: v.optional(v.string()),
    /**
     * When true and the user is an approved marketplace seller, public name
     * uses KYC businessName / trading name instead of account first+last.
     */
    useSellerDisplayName: v.optional(v.boolean()),
    bio: v.optional(v.string()),
    avatarAssetId: v.optional(v.id("assets")),
    /** Public contact / social links shown on the profile. */
    contactLinks: v.array(
      v.object({
        type: v.union(
          v.literal("website"),
          v.literal("phone"),
          v.literal("email"),
          v.literal("other"),
        ),
        label: v.string(),
        value: v.string(),
      }),
    ),
    isPublic: v.boolean(),
    followerCount: v.number(),
    followingCount: v.number(),
    postCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),

  /** Assets the owner chose to publish on their public profile. */
  profilePosts: defineTable({
    profileId: v.id("profiles"),
    ownerId: v.id("users"),
    assetId: v.id("assets"),
    /** Extra media after `assetId`. Max 6 including primary. Mixed image/video/audio. */
    assetIds: v.optional(v.array(v.id("assets"))),
    caption: v.optional(v.string()),
    /** Voice note under the caption (not one of the gallery items). */
    voiceAssetId: v.optional(v.id("assets")),
    voiceDurationSec: v.optional(v.number()),
    /** Normalized discovery keywords (not shown as #hashtags). */
    keywords: v.optional(v.array(v.string())),
    likeCount: v.number(),
    /** Total opens/views; optional for posts created before this field existed. */
    viewCount: v.optional(v.number()),
    /** Comment count; optional for posts created before this field existed. */
    commentCount: v.optional(v.number()),
    /** Bookmark / save count; optional for older posts. */
    saveCount: v.optional(v.number()),
    /** Share action count; optional for older posts. */
    shareCount: v.optional(v.number()),
    publishedAt: v.number(),
    /** Set when the owner edits the caption/description after publish. */
    editedAt: v.optional(v.number()),
    unpublishedAt: v.optional(v.number()),
  })
    .index("by_profile_and_published", ["profileId", "publishedAt"])
    .index("by_published", ["publishedAt"])
    .index("by_asset", ["assetId"])
    .index("by_owner", ["ownerId"]),

  /** Global hashtag catalog (normalized tag without #). */
  hashtags: defineTable({
    tag: v.string(),
    displayTag: v.string(),
    postCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tag", ["tag"])
    .index("by_post_count", ["postCount"]),

  /** Links a published profile post to hashtags. */
  profilePostHashtags: defineTable({
    postId: v.id("profilePosts"),
    hashtagId: v.id("hashtags"),
    profileId: v.id("profiles"),
    ownerId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_hashtag", ["hashtagId"])
    .index("by_owner_and_hashtag", ["ownerId", "hashtagId"])
    .index("by_profile_and_hashtag", ["profileId", "hashtagId"]),

  /** Per-viewer interest in hashtags from likes/saves/shares/views. */
  userHashtagAffinity: defineTable({
    userId: v.id("users"),
    hashtagId: v.id("hashtags"),
    score: v.number(),
    likeCount: v.number(),
    saveCount: v.number(),
    shareCount: v.number(),
    viewCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_hashtag", ["userId", "hashtagId"])
    .index("by_user_and_score", ["userId", "score"]),

  /** Per-viewer interest in freeform keywords. */
  userKeywordAffinity: defineTable({
    userId: v.id("users"),
    keyword: v.string(),
    score: v.number(),
    likeCount: v.number(),
    saveCount: v.number(),
    shareCount: v.number(),
    viewCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_keyword", ["userId", "keyword"])
    .index("by_user_and_score", ["userId", "score"]),

  /** How consistently a creator posts with a given hashtag (identity signal). */
  creatorHashtagStats: defineTable({
    profileId: v.id("profiles"),
    hashtagId: v.id("hashtags"),
    postCount: v.number(),
    consistencyScore: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profile_and_hashtag", ["profileId", "hashtagId"])
    .index("by_hashtag_and_consistency", ["hashtagId", "consistencyScore"]),

  /** @mentions on a profile post. */
  profilePostMentions: defineTable({
    postId: v.id("profilePosts"),
    mentionedProfileId: v.id("profiles"),
    mentionedUsername: v.string(),
    ownerId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_mentioned", ["mentionedProfileId"])
    .index("by_post_and_mentioned", ["postId", "mentionedProfileId"]),

  profileFollows: defineTable({
    followerUserId: v.id("users"),
    followingProfileId: v.id("profiles"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerUserId"])
    .index("by_following", ["followingProfileId"])
    .index("by_pair", ["followerUserId", "followingProfileId"]),

  profileLikes: defineTable({
    userId: v.id("users"),
    postId: v.id("profilePosts"),
    createdAt: v.number(),
  })
    .index("by_user_and_post", ["userId", "postId"])
    .index("by_post", ["postId"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  /** Paid Boost (5 TTD cents). Replaces post likes. Undoable for 60s. */
  profileBoosts: defineTable({
    userId: v.id("users"),
    postId: v.id("profilePosts"),
    createdAt: v.number(),
    amountCredits: v.number(),
    senderTransactionId: v.id("creditTransactions"),
    receiverTransactionId: v.id("creditTransactions"),
    status: v.union(v.literal("active"), v.literal("undone")),
    undoneAt: v.optional(v.number()),
  })
    .index("by_user_and_post", ["userId", "postId"])
    .index("by_user_post_status", ["userId", "postId", "status"])
    .index("by_post", ["postId"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  profileSaves: defineTable({
    userId: v.id("users"),
    postId: v.id("profilePosts"),
    createdAt: v.number(),
  })
    .index("by_user_and_post", ["userId", "postId"])
    .index("by_post", ["postId"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  profileShares: defineTable({
    userId: v.id("users"),
    postId: v.id("profilePosts"),
    createdAt: v.number(),
  })
    .index("by_user_and_post", ["userId", "postId"])
    .index("by_post", ["postId"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  profileComments: defineTable({
    postId: v.id("profilePosts"),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    /** Reply target; omitted/undefined for top-level comments. */
    parentId: v.optional(v.id("profileComments")),
    likeCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    /** Optional single image attachment. */
    imageAssetId: v.optional(v.id("assets")),
    /** Optional voice note. */
    audioAssetId: v.optional(v.id("assets")),
    audioDurationSec: v.optional(v.number()),
  })
    .index("by_post_and_created", ["postId", "createdAt"])
    .index("by_parent_and_created", ["parentId", "createdAt"])
    .index("by_user", ["userId"]),

  profileCommentLikes: defineTable({
    userId: v.id("users"),
    commentId: v.id("profileComments"),
    createdAt: v.number(),
  })
    .index("by_user_and_comment", ["userId", "commentId"])
    .index("by_comment", ["commentId"]),

  /** Person-to-person DMs — exactly one conversation per user pair (sorted ids). */
  dmConversations: defineTable({
    userLowId: v.id("users"),
    userHighId: v.id("users"),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id("users")),
    /** Per-member read watermarks (low/high = same ordering as the pair ids). */
    lowLastReadAt: v.number(),
    highLastReadAt: v.number(),
    /**
     * Per-member delivery watermarks — peer’s client acknowledged receipt
     * (WhatsApp double gray). Missing → 0.
     */
    lowLastDeliveredAt: v.optional(v.number()),
    highLastDeliveredAt: v.optional(v.number()),
    /** Per-member typing pings (WhatsApp-style); clients treat >~4s as idle. */
    lowTypingAt: v.optional(v.number()),
    highTypingAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_pair", ["userLowId", "userHighId"])
    .index("by_low_and_time", ["userLowId", "lastMessageAt"])
    .index("by_high_and_time", ["userHighId", "lastMessageAt"]),

  dmMessages: defineTable({
    conversationId: v.id("dmConversations"),
    senderId: v.id("users"),
    /** Caption for images; empty for voice notes; optional note for feed shares. */
    body: v.string(),
    /** Absent = "text" (rows pre-dating media kinds). */
    kind: v.optional(
      v.union(
        v.literal("text"),
        v.literal("voice"),
        v.literal("image"),
        v.literal("video"),
        v.literal("post"),
        v.literal("comment"),
        /** Live Studio file/folder share ping. */
        v.literal("studio_share"),
      ),
    ),
    /** Billable Studio asset (Bunny) in the sender's Messages folder. */
    assetId: v.optional(v.id("assets")),
    /** MIME type for image attachments (e.g. image/jpeg). */
    contentType: v.optional(v.string()),
    /** Voice note length in seconds (client-measured). */
    durationSec: v.optional(v.number()),
    /** WhatsApp-style reply target in the same conversation. */
    replyToMessageId: v.optional(v.id("dmMessages")),
    /** Shared profile post (kind post|comment). */
    sharedPostId: v.optional(v.id("profilePosts")),
    /** Shared profile comment (kind comment). */
    sharedCommentId: v.optional(v.id("profileComments")),
    /** Live Studio items shared in this message (kind studio_share). */
    sharedItems: v.optional(
      v.array(
        v.object({
          itemKind: studioShareItemKind,
          itemId: v.string(),
          name: v.string(),
          /** File-delivery: original asset id (sender) when itemId is the peer copy. */
          sourceItemId: v.optional(v.string()),
        }),
      ),
    ),
    /** Set when sender edits text/caption. */
    editedAt: v.optional(v.number()),
    /** Delete-for-everyone tombstone (row kept for reply integrity). */
    deletedAt: v.optional(v.number()),
    /** Delete-for-me: hide from these members only. */
    hiddenForUserIds: v.optional(v.array(v.id("users"))),
    createdAt: v.number(),
  })
    .index("by_conversation_and_created", ["conversationId", "createdAt"])
    .index("by_asset", ["assetId"])
    .searchIndex("search_body", {
      searchField: "body",
    }),

  /**
   * Live-link grants: recipient sees the sender's original in Shared with me.
   * No Bunny copy — if the owner trashes/deletes the source, it disappears.
   */
  studioShares: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    itemKind: studioShareItemKind,
    itemId: v.string(),
    /** Live-link permission. Missing = view (legacy grants). */
    permission: v.optional(v.union(v.literal("view"), v.literal("edit"))),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_to_and_created", ["toUserId", "createdAt"])
    .index("by_from_and_to", ["fromUserId", "toUserId"])
    .index("by_from_and_created", ["fromUserId", "createdAt"])
    .index("by_item", ["itemKind", "itemId"])
    .index("by_to_and_item", ["toUserId", "itemKind", "itemId"]),

  /**
   * WhatsApp-style DM labels (lists). Owner-scoped; people can sit in
   * multiple labels via dmLabelMembers.
   */
  dmLabels: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    /** Allowlisted Lucide icon key (e.g. "briefcase"). */
    icon: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_and_order", ["ownerUserId", "sortOrder"]),

  dmLabelMembers: defineTable({
    labelId: v.id("dmLabels"),
    /** Denormalized owner for peer→labels lookups. */
    ownerUserId: v.id("users"),
    peerUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_label_and_peer", ["labelId", "peerUserId"])
    .index("by_label", ["labelId"])
    .index("by_owner_and_peer", ["ownerUserId", "peerUserId"]),

  /**
   * Private CRM notes on a DM peer. Owner-only — never visible to the peer.
   */
  dmPeerNotes: defineTable({
    ownerUserId: v.id("users"),
    peerUserId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_and_peer", ["ownerUserId", "peerUserId"]),

  /**
   * One-way DM block. When A blocks B, B cannot send messages to A.
   */
  dmBlocks: defineTable({
    blockerUserId: v.id("users"),
    blockedUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker_and_blocked", ["blockerUserId", "blockedUserId"])
    .index("by_blocked", ["blockedUserId"]),

  marketplaceSellers: defineTable({
    userId: v.id("users"),
    status: marketplaceSellerStatus,
    /** Public / trading name shown on offers. */
    businessName: v.string(),
    entityType: v.optional(marketplaceSellerEntityType),
    /** Legal name of the applicant / director. */
    legalName: v.optional(v.string()),
    phone: v.optional(v.string()),
    residentialAddress: v.optional(v.string()),
    businessType: v.optional(marketplaceSellerBusinessType),
    businessRegistrationNumber: v.optional(v.string()),
    birNumber: v.optional(v.string()),
    businessAddress: v.optional(v.string()),
    /** Two different identity documents (any pair of kinds). */
    identityDoc1Kind: v.optional(marketplaceSellerIdentityDocKind),
    identityDoc1BunnyPath: v.optional(v.string()),
    identityDoc1BackBunnyPath: v.optional(v.string()),
    identityDoc2Kind: v.optional(marketplaceSellerIdentityDocKind),
    identityDoc2BunnyPath: v.optional(v.string()),
    identityDoc2BackBunnyPath: v.optional(v.string()),
    proofOfResidentialAddressBunnyPath: v.optional(v.string()),
    businessRegistrationBunnyPath: v.optional(v.string()),
    proofOfBusinessAddressBunnyPath: v.optional(v.string()),
    /** Where the seller wants payouts sent (self-served in Settings → Payouts). */
    payoutBankName: v.optional(v.string()),
    payoutAccountName: v.optional(v.string()),
    payoutAccountNumber: v.optional(v.string()),
    payoutAccountType: v.optional(bankAccountType),
    payoutBranch: v.optional(v.string()),
    payoutNote: v.optional(v.string()),
    payoutUpdatedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    /** Set when an application is rejected (pending → rejected). */
    rejectionReason: v.optional(v.string()),
    rejectedBy: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    /** Optional note when an approved seller is suspended. */
    suspendReason: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  marketplaceOffers: defineTable({
    sellerId: v.id("marketplaceSellers"),
    sellerUserId: v.id("users"),
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    // Starting-at price/delivery (mirrors the cheapest package when packages exist).
    priceCents: v.number(),
    category: v.optional(v.string()),
    status: marketplaceOfferStatus,
    deliveryDays: v.number(),
    // Up to 3 Fiverr-style tiers; absent = single flat-rate offer.
    packages: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          priceCents: v.number(),
          deliveryDays: v.number(),
          revisions: v.number(),
          features: v.array(v.string()),
        }),
      ),
    ),
    coverAssetId: v.optional(v.id("assets")),
    sampleAssetIds: v.optional(v.array(v.id("assets"))),
    /** Completed bookings (verified purchases). */
    purchaseCount: v.optional(v.number()),
    /** Sum of 1–5 star ratings from verified buyers. */
    ratingSum: v.optional(v.number()),
    ratingCount: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_seller", ["sellerId"])
    .index("by_seller_user", ["sellerUserId"])
    .index("by_status", ["status"])
    .index("by_status_and_published", ["status", "publishedAt"]),

  marketplaceJobs: defineTable({
    offerId: v.id("marketplaceOffers"),
    sellerId: v.id("marketplaceSellers"),
    sellerUserId: v.id("users"),
    buyerUserId: v.id("users"),
    priceCredits: v.number(),
    priceCents: v.number(),
    creditPriceCents: v.number(),
    // Snapshot of the booked package (absent for flat-rate bookings).
    packageName: v.optional(v.string()),
    deliveryDays: v.optional(v.number()),
    revisions: v.optional(v.number()),
    status: marketplaceJobStatus,
    escrowHoldId: v.optional(v.id("platformEscrowHolds")),
    escrowCreditTransactionId: v.optional(v.id("creditTransactions")),
    workFolderId: v.optional(v.id("folders")),
    deliveredAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    /** Set when the buyer leaves a verified-purchase review. */
    reviewId: v.optional(v.id("marketplaceReviews")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_seller", ["sellerUserId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_offer", ["offerId"])
    .index("by_status", ["status"])
    .index("by_status_and_delivered", ["status", "deliveredAt"]),

  marketplaceJobEvents: defineTable({
    jobId: v.id("marketplaceJobs"),
    actorUserId: v.optional(v.id("users")),
    kind: v.string(),
    message: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]),

  marketplaceDeliverables: defineTable({
    jobId: v.id("marketplaceJobs"),
    assetId: v.id("assets"),
    note: v.optional(v.string()),
    deliveredBy: v.id("users"),
    deliveredAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_asset", ["assetId"]),

  /** Buyer reviews — one per completed job (verified purchase only). */
  marketplaceReviews: defineTable({
    jobId: v.id("marketplaceJobs"),
    offerId: v.id("marketplaceOffers"),
    sellerUserId: v.id("users"),
    buyerUserId: v.id("users"),
    rating: v.number(),
    body: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_offer", ["offerId"])
    .index("by_offer_and_created", ["offerId", "createdAt"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_seller", ["sellerUserId"]),

  platformEscrowHolds: defineTable({
    jobId: v.id("marketplaceJobs"),
    buyerUserId: v.id("users"),
    credits: v.number(),
    holdCreditTransactionId: v.id("creditTransactions"),
    releaseCreditTransactionId: v.optional(v.id("creditTransactions")),
    refundCreditTransactionId: v.optional(v.id("creditTransactions")),
    status: platformEscrowHoldStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"])
    .index("by_buyer", ["buyerUserId"]),

  sellerPayouts: defineTable({
    sellerUserId: v.id("users"),
    /** Service job payout (Creative Network offers). */
    jobId: v.optional(v.id("marketplaceJobs")),
    /** Stock audio purchase payout (music/SFX listings). */
    assetPurchaseId: v.optional(v.id("assetPurchases")),
    amountCents: v.number(),
    status: sellerPayoutStatus,
    paidAt: v.optional(v.number()),
    adminNote: v.optional(v.string()),
    markedPaidBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_seller", ["sellerUserId"])
    .index("by_job", ["jobId"])
    .index("by_asset_purchase", ["assetPurchaseId"])
    .index("by_status", ["status"]),

  /**
   * Creative Network stock audio listings (music / SFX). Separate from service offers.
   */
  assetListings: defineTable({
    sellerId: v.id("marketplaceSellers"),
    sellerUserId: v.id("users"),
    /** Locked Public-folder catalog copy (Bunny source for purchases). */
    sourceAssetId: v.id("assets"),
    /** Seller's working original; kept when sourceAssetId is the Public copy. */
    originalAssetId: v.optional(v.id("assets")),
    audioType: assetListingAudioType,
    title: v.string(),
    description: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    /** What generate would cost the buyer (Studio audioCreditCost). */
    generateCredits: v.number(),
    /** Fixed list price = generateCredits × 3. */
    priceCredits: v.number(),
    status: assetListingStatus,
    purchaseCount: v.number(),
    /** Each submit / resubmit timestamp (moderation queue sort). */
    submittedAt: v.optional(v.number()),
    listedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    /** Seller released ownership; listing stays live, future profits = platform. */
    platformOwnedAt: v.optional(v.number()),
    releasedAt: v.optional(v.number()),
    /** Storage unpaid ≥90d (or admin): banned from earning on this listing. */
    profitBannedAt: v.optional(v.number()),
    profitBanReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_status_and_listed", ["status", "listedAt"])
    .index("by_status_and_submitted", ["status", "submittedAt"])
    .index("by_seller", ["sellerId"])
    .index("by_seller_user", ["sellerUserId"])
    .index("by_seller_user_and_updated", ["sellerUserId", "updatedAt"])
    .index("by_source_asset", ["sourceAssetId"])
    .index("by_original_asset", ["originalAssetId"])
    .index("by_audio_type_and_status", ["audioType", "status"]),

  assetPurchases: defineTable({
    listingId: v.id("assetListings"),
    buyerUserId: v.id("users"),
    sellerUserId: v.id("users"),
    sellerId: v.id("marketplaceSellers"),
    priceCredits: v.number(),
    platformCredits: v.number(),
    sellerCredits: v.number(),
    creditPriceCents: v.number(),
    sellerPayoutCents: v.number(),
    buyerAssetId: v.id("assets"),
    creditTransactionId: v.id("creditTransactions"),
    createdAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_buyer_and_listing", ["buyerUserId", "listingId"])
    .index("by_seller", ["sellerUserId"]),

  /**
   * Studio Academy courses — overview + free intro video + paid multi-lesson body.
   * Wallet debit uses credits; buyer UI is TTD only.
   */
  academyCourses: defineTable({
    title: v.string(),
    slug: v.string(),
    descriptionMarkdown: v.string(),
    /** Base / list price in credits (TT$0.50 each). */
    priceCredits: v.number(),
    /** Optional list/compare-at credits when on sale (defaults to priceCredits). */
    listPriceCredits: v.optional(v.number()),
    /** Optional sale price in credits while saleEndsAt is in the future. */
    salePriceCredits: v.optional(v.number()),
    /** Unix ms — sale ends at this instant (America/Port_of_Spain midnight typically). */
    saleEndsAt: v.optional(v.number()),
    coverBunnyPath: v.optional(v.string()),
    /** Free preview / intro Stream video (no purchase required). */
    introBunnyStreamVideoId: v.optional(v.string()),
    /** @deprecated Prefer introBunnyStreamVideoId (pre-multi-lesson). */
    bunnyStreamVideoId: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("coming_soon"),
    ),
    sortOrder: v.number(),
    purchaseCount: v.number(),
    /** Top-level + reply comments on the course discussion. */
    commentCount: v.optional(v.number()),
    createdByAdminId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_sort", ["status", "sortOrder"])
    .index("by_updated", ["updatedAt"]),

  /** Lessons inside an Academy course — each has banner, Stream video, description. */
  academyLessons: defineTable({
    courseId: v.id("academyCourses"),
    title: v.string(),
    slug: v.string(),
    descriptionMarkdown: v.string(),
    coverBunnyPath: v.optional(v.string()),
    bunnyStreamVideoId: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    sortOrder: v.number(),
    /** Discussion thread count for this lesson. */
    commentCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course_and_sort", ["courseId", "sortOrder"])
    .index("by_course_and_slug", ["courseId", "slug"])
    .index("by_updated", ["updatedAt"]),

  /** Lifetime course entitlement after credit purchase (or admin grant). */
  academyPurchases: defineTable({
    userId: v.id("users"),
    courseId: v.id("academyCourses"),
    priceCredits: v.number(),
    creditTransactionId: v.optional(v.id("creditTransactions")),
    grantedByAdminId: v.optional(v.id("users")),
    purchasedAt: v.number(),
  })
    .index("by_user_and_course", ["userId", "courseId"])
    .index("by_course", ["courseId"])
    .index("by_user_and_purchased", ["userId", "purchasedAt"]),

  /**
   * CSR-only Academy course deposit / installment plan (Sophie).
   * Course stays locked until status=completed; Academy UI shows Partially paid.
   */
  academyCoursePaymentPlans: defineTable({
    userId: v.id("users"),
    courseId: v.id("academyCourses"),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    /** List / regular price snapshot (credits) at deposit. */
    listPriceCredits: v.number(),
    /** Sale total locked at deposit; omit when deposited off-sale. */
    lockedSalePriceCredits: v.optional(v.number()),
    saleEndsAt: v.optional(v.number()),
    /** saleEndsAt + 15d — within this window, unlock at locked sale total. */
    saleHoldEndsAt: v.optional(v.number()),
    /** First soft-accepted deposit amount (cents). */
    depositCents: v.number(),
    /** Sum of all soft-accepted payments on this plan (cents). */
    totalPaidCents: v.number(),
    /** First deposit soft-accept time. */
    depositAt: v.number(),
    /** depositAt + 90d — after this, plan expires and must restart. */
    expiresAt: v.number(),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    purchaseId: v.optional(v.id("academyPurchases")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_course", ["userId", "courseId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_status_and_expires", ["status", "expiresAt"])
    .index("by_course", ["courseId"]),

  /**
   * Lesson (or course-overview) discussion — same shape as profileComments.
   * Prefer lessonId for per-lesson threads; omit lessonId for course overview Q&A.
   */
  academyComments: defineTable({
    courseId: v.id("academyCourses"),
    lessonId: v.optional(v.id("academyLessons")),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    parentId: v.optional(v.id("academyComments")),
    likeCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    imageAssetId: v.optional(v.id("assets")),
    /** Optional voice note. */
    audioAssetId: v.optional(v.id("assets")),
    audioDurationSec: v.optional(v.number()),
    /** Playback position (seconds) when the comment was posted on intro or lesson video. */
    videoTimeSec: v.optional(v.number()),
  })
    .index("by_course_and_created", ["courseId", "createdAt"])
    .index("by_lesson_and_created", ["lessonId", "createdAt"])
    .index("by_parent_and_created", ["parentId", "createdAt"])
    .index("by_user", ["userId"]),

  academyCommentLikes: defineTable({
    userId: v.id("users"),
    commentId: v.id("academyComments"),
    createdAt: v.number(),
  })
    .index("by_user_and_comment", ["userId", "commentId"])
    .index("by_comment", ["commentId"]),

  /** Timed emoji bursts on an intro or lesson video (many per user). */
  academyVideoReactions: defineTable({
    courseId: v.id("academyCourses"),
    targetKey: v.string(),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
    videoTimeSec: v.optional(v.number()),
  })
    .index("by_target_and_user", ["targetKey", "userId"])
    .index("by_target", ["targetKey"]),

  /** Studio Sophie CS — email OTP codes (agent never reads these; verify returns ok only). */
  studioCsOtps: defineTable({
    email: v.string(),
    codeHash: v.string(),
    phone: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  /** One-time Studio login links (Sophie WA). Single-use; 5 min TTL. */
  magicLoginTokens: defineTable({
    userId: v.id("users"),
    phone: v.optional(v.string()),
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("consumed"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
    source: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_and_status", ["userId", "status"]),

  /** Agent Mode threads (Pi-style Studio operator chat). */
  agentThreads: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    /** Multi todo-list board JSON — see agentPlan board shape */
    todosJson: v.optional(v.string()),
    /** Working scratch: cwd + recent doc/asset/element ids for Prior continuity. */
    workingScratchJson: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_archived", ["ownerId", "archivedAt"])
    .index("by_owner_archived_updated", ["ownerId", "archivedAt", "updatedAt"]),

  agentMessages: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("tool"),
      v.literal("system"),
      v.literal("approval"),
      v.literal("question"),
    ),
    content: v.string(),
    attachmentsJson: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    approvalId: v.optional(v.id("agentApprovals")),
    questionId: v.optional(v.id("agentQuestions")),
    status: v.optional(
      v.union(
        v.literal("streaming"),
        v.literal("complete"),
        v.literal("error"),
      ),
    ),
    createdAt: v.number(),
  })
    .index("by_thread_and_created", ["threadId", "createdAt"])
    .index("by_owner", ["ownerId"])
    .index("by_approval", ["approvalId"])
    .index("by_question", ["questionId"]),

  agentApprovals: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    action: v.string(),
    /** Catalog tool name when approval is for invoke(tool). */
    toolName: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    payloadJson: v.string(),
    catalogVersion: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    estimatedCredits: v.optional(v.number()),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
    executionStartedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread_and_status", ["threadId", "status"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_idempotency", ["ownerId", "idempotencyKey"])
    .index("by_run", ["runId"]),

  /** BYOK for Agent Mode reasoning models (not media generation). */
  userAgentKeys: defineTable({
    ownerId: v.id("users"),
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("zai"),
      v.literal("openrouter"),
    ),
    /** AES-GCM ciphertext (base64) — never log. */
    encryptedKey: v.string(),
    /** base64 IV */
    iv: v.string(),
    keyHint: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  agentPreferences: defineTable({
    ownerId: v.id("users"),
    autoApprove: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  /** Short-lived Agent Mode API capability (hashed bearer `ysa_cap_…`). */
  agentCapabilitySessions: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    tokenHash: v.string(),
    scopes: v.array(v.string()),
    role: userRole,
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_owner", ["ownerId"])
    .index("by_thread", ["threadId"])
    .index("by_run", ["runId"])
    .index("by_expires", ["expiresAt"]),

  /** Durable Agent Mode run records (Pi worker turns). */
  agentRuns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("awaiting_approval"),
      v.literal("awaiting_question"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    userMessage: v.string(),
    assistantText: v.optional(v.string()),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    usedByok: v.optional(v.boolean()),
    creditsSpent: v.optional(v.number()),
    catalogVersion: v.optional(v.string()),
    /** Measured LLM usage JSON for this run (exact billing audit). */
    usageJson: v.optional(v.string()),
    /** Latest multi-step TODO JSON for reinjection across ask pauses */
    planJson: v.optional(v.string()),
    cancelRequestedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread_and_created", ["threadId", "createdAt"])
    .index("by_owner_and_created", ["ownerId", "createdAt"])
    .index("by_owner_and_status", ["ownerId", "status"]),

  /** Structured Agent Mode clarifying questions (multi-choice + custom). */
  agentQuestions: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    intro: v.optional(v.string()),
    /** [{ id, prompt, options:[{id,label}], allowCustom? }] */
    questionsJson: v.string(),
    /** [{ questionId, optionId?, optionLabel?, customText? }] */
    answersJson: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("answered"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    answeredAt: v.optional(v.number()),
  })
    .index("by_thread_and_status", ["threadId", "status"])
    .index("by_owner", ["ownerId"])
    .index("by_run", ["runId"]),

  agentToolCalls: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.id("agentRuns"),
    toolName: v.string(),
    argsJson: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("pending_approval"),
      v.literal("pending_question"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
    approvalId: v.optional(v.id("agentApprovals")),
    questionId: v.optional(v.id("agentQuestions")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_run_and_started", ["runId", "startedAt"])
    .index("by_thread_and_started", ["threadId", "startedAt"])
    .index("by_owner", ["ownerId"]),

  /** Owner/project-scoped durable Agent memories (never cross-user). */
  agentMemories: defineTable({
    ownerId: v.id("users"),
    projectFolderId: v.optional(v.id("folders")),
    kind: v.union(
      v.literal("note"),
      v.literal("preference"),
      v.literal("decision"),
      v.literal("summary"),
    ),
    title: v.string(),
    body: v.string(),
    pinned: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    sourceThreadId: v.optional(v.id("agentThreads")),
    /** Hash-embed JSON float[] for hybrid retrieve (optional; backfilled on write). */
    embeddingJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated", ["ownerId", "updatedAt"])
    .index("by_owner_and_project", ["ownerId", "projectFolderId"])
    .index("by_owner_archived", ["ownerId", "archivedAt"]),
});
