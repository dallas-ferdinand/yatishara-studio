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

export const generationSource = v.union(v.literal("ui"), v.literal("api"));

export const apiKeyScope = v.union(
  v.literal("read"),
  v.literal("write"),
  v.literal("generate"),
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
);

export const notificationKind = v.union(
  v.literal("generation_completed"),
  v.literal("generation_failed"),
  v.literal("payment_status"),
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
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
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
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_parent", ["ownerId", "parentId"])
    .index("by_owner_and_deleted", ["ownerId", "deletedAt"]),

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
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_folder", ["folderId"])
    .index("by_folder_and_kind", ["folderId", "kind"])
    .index("by_owner_and_deleted", ["ownerId", "deletedAt"])
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
    assetId: v.optional(v.id("assets")),
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
    paymentId: v.optional(v.id("payments")),
    reversesTransactionId: v.optional(v.id("creditTransactions")),
    reason: v.optional(v.string()),
    adminId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_payment", ["paymentId"])
    .index("by_generation_job", ["generationJobId"])
    .index("by_reversed_transaction", ["reversesTransactionId"]),

  subscriptionPlans: defineTable({
    name: v.string(),
    slug: v.string(),
    monthlyPriceCents: v.number(),
    originalMonthlyPriceCents: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
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
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),

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
    accountType: v.union(v.literal("chequing"), v.literal("savings")),
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
    bankAccountId: v.optional(v.id("bankAccounts")),
    externalPaymentId: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    lastStatusCheckedAt: v.optional(v.number()),
    nextStatusCheckAt: v.optional(v.number()),
    statusCheckAttempts: v.optional(v.number()),
    reconciliationLeaseUntil: v.optional(v.number()),
    callbackToken: v.optional(v.string()),
    reference: v.optional(v.string()),
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
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_folder", ["folderId"])
    .index("by_source_asset", ["sourceAssetId"]),

  /** Public creative identity — separate from private account details on users. */
  profiles: defineTable({
    userId: v.id("users"),
    /** Unique browser-friendly handle, stored lowercase. */
    username: v.string(),
    displayName: v.optional(v.string()),
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
    caption: v.optional(v.string()),
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
    unpublishedAt: v.optional(v.number()),
  })
    .index("by_profile_and_published", ["profileId", "publishedAt"])
    .index("by_published", ["publishedAt"])
    .index("by_asset", ["assetId"])
    .index("by_owner", ["ownerId"]),

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
});
