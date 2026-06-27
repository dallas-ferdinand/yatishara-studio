import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath } from "./lib/bunny";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";

const generationMode = v.union(v.literal("image"), v.literal("video"));
const generationTier = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("pro_video"),
);
const generationStage = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("saving"),
  v.literal("done"),
  v.literal("failed"),
);

const sendPushForNotificationRef = makeFunctionReference<
  "action",
  { notificationId: Id<"notifications"> },
  number
>("notificationsActions:sendPushForNotification") as unknown as FunctionReference<
  "action",
  "internal",
  { notificationId: Id<"notifications"> },
  number
>;

const threadReturn = v.object({
  _id: v.id("generationThreads"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  linkedFolderId: v.id("folders"),
  title: v.string(),
  sortOrder: v.number(),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const eventReturn = v.object({
  _id: v.id("generationEvents"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  threadId: v.id("generationThreads"),
  kind: v.union(
    v.literal("prompt"),
    v.literal("result"),
    v.literal("folder_switched"),
    v.literal("stage"),
  ),
  order: v.number(),
  prompt: v.optional(v.string()),
  stage: v.optional(generationStage),
  generationJobId: v.optional(v.id("generationJobs")),
  assetIds: v.optional(v.array(v.id("assets"))),
  fromFolderId: v.optional(v.id("folders")),
  toFolderId: v.optional(v.id("folders")),
  createdAt: v.number(),
});

export const listThreads = authedQuery({
  args: {},
  returns: v.array(threadReturn),
  handler: async (ctx) => {
    return await ctx.db
      .query("generationThreads")
      .withIndex("by_owner_and_archived", (q) =>
        q.eq("ownerId", ctx.user._id).eq("archivedAt", undefined),
      )
      .collect();
  },
});

export const listEvents = authedQuery({
  args: { threadId: v.id("generationThreads") },
  returns: v.array(eventReturn),
  handler: async (ctx, args) => {
    await requireThreadOwner(ctx, args.threadId);
    return await ctx.db
      .query("generationEvents")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const createThread = authedMutation({
  args: {
    folderId: v.id("folders"),
    title: v.optional(v.string()),
  },
  returns: v.id("generationThreads"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    return await ctx.db.insert("generationThreads", {
      ownerId: ctx.user._id,
      linkedFolderId: args.folderId,
      title: args.title ?? "New generation",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const switchThreadFolder = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    folderId: v.id("folders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    await ctx.db.patch(thread._id, {
      linkedFolderId: args.folderId,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: thread._id,
      kind: "folder_switched",
      order: now,
      fromFolderId: thread.linkedFolderId,
      toFolderId: args.folderId,
      createdAt: now,
    });
    return null;
  },
});

export const canGenerate = authedQuery({
  args: {
    tier: generationTier,
    now: v.number(),
  },
  returns: v.object({
    canGenerate: v.boolean(),
    creditBalance: v.number(),
    cost: v.number(),
    hasActiveSubscription: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const cost = await creditCostForTier(ctx, args.tier);
    const creditBalance = account?.creditBalance ?? 0;
    const hasActiveSubscription = await hasActiveSubscriptionForUser(
      ctx,
      ctx.user._id,
      args.now,
    );
    const canGenerate = creditBalance >= cost || hasActiveSubscription;
    return {
      canGenerate,
      creditBalance,
      cost,
      hasActiveSubscription,
      reason: canGenerate
        ? undefined
        : `Generation needs ${cost} credits. Top up or activate a subscription.`,
    };
  },
});

export const createQueuedJob = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.id("generationJobs"),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    await requireFolderOwner(ctx, thread.linkedFolderId);
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    const now = Date.now();
    const reservedCreditTransactionId = await reserveCreditsForJob(ctx, args.tier);
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: args.tier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      reservedCreditTransactionId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return jobId;
  },
});

export const getJobRunContext = internalQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    job: v.object({
      _id: v.id("generationJobs"),
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
      externalTaskId: v.optional(v.string()),
      error: v.optional(v.string()),
      reservedCreditTransactionId: v.optional(v.id("creditTransactions")),
      spentCreditTransactionId: v.optional(v.id("creditTransactions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    preset: v.object({
      _id: v.id("stylePresets"),
      name: v.string(),
      systemInstructions: v.string(),
      negativePrompt: v.optional(v.string()),
    }),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) {
      throw new Error("Generation job not found");
    }
    const preset = await ctx.db.get("stylePresets", job.stylePresetId);
    if (!preset) {
      throw new Error("Style preset not found");
    }
    return {
      job: {
        _id: job._id,
        ownerId: job.ownerId,
        threadId: job.threadId,
        saveFolderId: job.saveFolderId,
        mode: job.mode,
        tier: job.tier,
        resolvedModel: job.resolvedModel,
        stylePresetId: job.stylePresetId,
        userPrompt: job.userPrompt,
        enhancedPrompt: job.enhancedPrompt,
        negativePrompt: job.negativePrompt,
        stage: job.stage,
        audioEnabled: job.audioEnabled,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        durationSeconds: job.durationSeconds,
        externalTaskId: job.externalTaskId,
        error: job.error,
        reservedCreditTransactionId: job.reservedCreditTransactionId,
        spentCreditTransactionId: job.spentCreditTransactionId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      preset: {
        _id: preset._id,
        name: preset.name,
        systemInstructions: preset.systemInstructions,
        negativePrompt: preset.negativePrompt,
      },
    };
  },
});

export const adminGetJobDebug = adminQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    _id: v.id("generationJobs"),
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    userPrompt: v.string(),
    enhancedPrompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    stage: generationStage,
    error: v.optional(v.string()),
    externalTaskId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Generation job not found");
    }
    return {
      _id: job._id,
      ownerId: job.ownerId,
      threadId: job.threadId,
      mode: job.mode,
      tier: job.tier,
      resolvedModel: job.resolvedModel,
      stylePresetId: job.stylePresetId,
      userPrompt: job.userPrompt,
      enhancedPrompt: job.enhancedPrompt,
      negativePrompt: job.negativePrompt,
      stage: job.stage,
      error: job.error,
      externalTaskId: job.externalTaskId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },
});

export const markStage = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    stage: generationStage,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const now = Date.now();
    await ctx.db.patch(job._id, {
      stage: args.stage,
      error: args.error,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: args.stage,
      generationJobId: job._id,
      createdAt: now,
    });
    return null;
  },
});

export const setEnhancedPrompt = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    enhancedPrompt: v.string(),
    negativePrompt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    await ctx.db.patch(job._id, {
      enhancedPrompt: args.enhancedPrompt,
      negativePrompt: args.negativePrompt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setVideoTask = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    externalTaskId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    await ctx.db.patch(job._id, {
      externalTaskId: args.externalTaskId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createGeneratedAsset = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    name: v.string(),
    kind: v.union(v.literal("image"), v.literal("video")),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: job.ownerId,
      folderId: job.saveFolderId,
      name: args.name,
      kind: args.kind,
      mimeType: args.mimeType,
      sourceGenerationJobId: job._id,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: job.ownerId,
      folderId: job.saveFolderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const completeWithOutputs = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    assetIds: v.array(v.id("assets")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const now = Date.now();
    for (const [index, assetId] of args.assetIds.entries()) {
      await ctx.db.insert("generationOutputs", {
        jobId: job._id,
        assetId,
        sortOrder: index,
        createdAt: now,
      });
    }
    const spentCreditTransactionId = job.reservedCreditTransactionId
      ? await settleReservedCredits(ctx, job)
      : undefined;
    await ctx.db.patch(job._id, {
      stage: "done",
      spentCreditTransactionId,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "result",
      order: now,
      generationJobId: job._id,
      assetIds: args.assetIds,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert("notifications", {
      userId: job.ownerId,
      kind: "generation_completed",
      title: "Generation complete",
      body: "Your generated media is ready.",
      generationJobId: job._id,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
      notificationId,
    });
    return null;
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const now = Date.now();
    if (job.reservedCreditTransactionId) {
      await refundReservedCredits(ctx, job, args.error);
    }
    await ctx.db.patch(job._id, {
      stage: "failed",
      error: args.error,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: "failed",
      generationJobId: job._id,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert("notifications", {
      userId: job.ownerId,
      kind: "generation_failed",
      title: "Generation failed",
      body: "Credits were refunded automatically.",
      generationJobId: job._id,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
      notificationId,
    });
    return null;
  },
});

async function requireThreadOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  threadId: Id<"generationThreads">,
) {
  const thread = await ctx.db.get("generationThreads", threadId);
  if (!thread || thread.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return thread;
}

async function requireFolderOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return folder;
}

async function requireJob(ctx: QueryCtx | MutationCtx, jobId: Id<"generationJobs">) {
  const job = await ctx.db.get("generationJobs", jobId);
  if (!job) {
    throw new Error("Generation job not found");
  }
  return job;
}

async function reserveCreditsForJob(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  tier: "low" | "medium" | "high" | "pro_video",
): Promise<Id<"creditTransactions">> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
    .unique();
  const cost = await creditCostForTier(ctx, tier);
  const now = Date.now();
  const hasSubscription = await hasActiveSubscriptionForUser(ctx, ctx.user._id, now);
  if (!account) {
    if (!hasSubscription) {
      throw new Error(`Generation needs ${cost} credits. Top up or activate a subscription.`);
    }
    const billingAccountId = await ctx.db.insert("billingAccounts", {
      userId: ctx.user._id,
      creditBalance: 0,
      reservedCredits: 0,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId,
      kind: "reserved",
      amount: 0,
      balanceAfter: 0,
      reason: `Reserved via subscription entitlement for ${tier} generation`,
      createdAt: now,
    });
  }
  if (account.creditBalance < cost) {
    if (hasSubscription) {
      return await ctx.db.insert("creditTransactions", {
        userId: ctx.user._id,
        billingAccountId: account._id,
        kind: "reserved",
        amount: 0,
        balanceAfter: account.creditBalance,
        reason: `Reserved via subscription entitlement for ${tier} generation`,
        createdAt: now,
      });
    }
    throw new Error(`Generation needs ${cost} credits. Top up or activate a subscription.`);
  }
  const balanceAfter = account.creditBalance - cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: account.reservedCredits + cost,
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId: ctx.user._id,
    billingAccountId: account._id,
    kind: "reserved",
    amount: -cost,
    balanceAfter,
    reason: `Reserved for ${tier} generation`,
    createdAt: now,
  });
}

async function creditCostForTier(
  ctx: QueryCtx | MutationCtx,
  tier: "low" | "medium" | "high" | "pro_video",
): Promise<number> {
  const settings = await ctx.db
    .query("pricingSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  if (tier === "low") return settings?.imageLowCredits ?? 2;
  if (tier === "medium") return settings?.imageMediumCredits ?? 5;
  if (tier === "high") return settings?.imageHighCredits ?? 9;
  return settings?.videoCredits ?? 35;
}

async function hasActiveSubscriptionForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<boolean> {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .first();
  return Boolean(
    subscription &&
      subscription.currentPeriodStart <= now &&
      subscription.currentPeriodEnd >= now,
  );
}

async function settleReservedCredits(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
): Promise<Id<"creditTransactions"> | undefined> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", job.ownerId))
    .unique();
  if (!account) {
    return undefined;
  }
  const cost = await creditCostForTier(ctx, job.tier);
  const now = Date.now();
  await ctx.db.patch(account._id, {
    reservedCredits: Math.max(0, account.reservedCredits - cost),
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "spent",
    amount: 0,
    balanceAfter: account.creditBalance,
    generationJobId: job._id,
    reason: "Generation completed",
    createdAt: now,
  });
}

async function refundReservedCredits(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<void> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", job.ownerId))
    .unique();
  if (!account) {
    return;
  }
  const cost = await creditCostForTier(ctx, job.tier);
  const now = Date.now();
  const balanceAfter = account.creditBalance + cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: Math.max(0, account.reservedCredits - cost),
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "refunded",
    amount: cost,
    balanceAfter,
    generationJobId: job._id,
    reason,
    createdAt: now,
  });
}
