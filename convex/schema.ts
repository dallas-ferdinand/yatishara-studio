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
);

export const generationMode = v.union(v.literal("image"), v.literal("video"));

export const generationSource = v.union(v.literal("ui"), v.literal("api"));

export const apiKeyScope = v.union(
  v.literal("read"),
  v.literal("write"),
  v.literal("generate"),
);

export const generationTier = v.union(
  v.literal("image"),
  v.literal("pro_video"),
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
);

export const paymentMethod = v.union(v.literal("bank"), v.literal("card"));

export const paymentStatus = v.union(
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
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    phoneVerifiedAt: v.optional(v.number()),
    image: v.optional(v.string()),
    role: userRole,
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
    bunnyPath: v.optional(v.string()),
    bunnyStreamVideoId: v.optional(v.string()),
    thumbnailPath: v.optional(v.string()),
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
    sourceAssetIds: v.array(v.id("assets")),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_archived", ["ownerId", "archivedAt"])
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
    createdAt: v.number(),
  })
    .index("by_thread_and_order", ["threadId", "order"])
    .index("by_owner", ["ownerId"])
    .index("by_job", ["generationJobId"]),

  generationJobs: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    saveFolderId: v.id("folders"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    userPrompt: v.string(),
    enhancedPrompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    stage: generationStage,
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    externalTaskId: v.optional(v.string()),
    error: v.optional(v.string()),
    reservedCreditTransactionId: v.optional(v.id("creditTransactions")),
    spentCreditTransactionId: v.optional(v.id("creditTransactions")),
    source: v.optional(generationSource),
    apiKeyId: v.optional(v.id("apiKeys")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_thread", ["threadId"])
    .index("by_stage", ["stage"])
    .index("by_external_task", ["externalTaskId"])
    .index("by_owner_and_created", ["ownerId", "createdAt"]),

  generationInputs: defineTable({
    jobId: v.id("generationJobs"),
    assetId: v.optional(v.id("assets")),
    documentId: v.optional(v.id("documents")),
    elementId: v.optional(v.id("elements")),
    kind: v.union(v.literal("asset"), v.literal("document"), v.literal("element")),
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
    reason: v.optional(v.string()),
    adminId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_payment", ["paymentId"])
    .index("by_generation_job", ["generationJobId"]),

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
    reference: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_method_and_status", ["method", "status"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
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
});
