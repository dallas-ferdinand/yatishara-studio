import { v } from "convex/values";
import { styleSheetSystemInstructions } from "./lib/styleSheetGuides";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath, LQIP_TRANSFORM, signBunnyCdnUrl, signBunnyFullUrl, THUMB_TRANSFORM } from "./lib/bunny";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import {
  CREDIT_PRICE_TTD,
  creditCostForGeneration,
  imageCreditCost,
  textCreditCost,
} from "./lib/generationPricing";
import {
  billingTierForMode,
  validateVideoModelCapabilities,
  videoPricingModelFromGatewayId,
} from "./lib/videoModels";
import {
  canReuseAssistanceMediaJob,
  parseAssistanceGenerationPlan,
} from "./lib/assistanceGenerationPlan";

const generationMode = v.union(v.literal("image"), v.literal("video"));
const generationTier = v.union(
  v.literal("image"),
  v.literal("pro_video"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
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
  assistanceEnabled: v.optional(v.boolean()),
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
    v.literal("assistant"),
    v.literal("question"),
    v.literal("review"),
    v.literal("approval"),
  ),
  order: v.number(),
  prompt: v.optional(v.string()),
  stage: v.optional(generationStage),
  generationJobId: v.optional(v.id("generationJobs")),
  assetIds: v.optional(v.array(v.id("assets"))),
  fromFolderId: v.optional(v.id("folders")),
  toFolderId: v.optional(v.id("folders")),
  briefId: v.optional(v.id("guidedBriefs")),
  briefRevision: v.optional(v.number()),
  message: v.optional(v.string()),
  questionsJson: v.optional(v.string()),
  briefSnapshotJson: v.optional(v.string()),
  approvalId: v.optional(v.id("assistanceApprovals")),
  createdAt: v.number(),
  error: v.optional(v.string()),
  jobMode: v.optional(generationMode),
  resultAssets: v.optional(v.array(v.object({
    _id: v.id("assets"),
    name: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("document")),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
    signedReadUrl: v.optional(v.string()),
    signedThumbnailUrl: v.optional(v.string()),
    signedThumbnailLqipUrl: v.optional(v.string()),
  }))),
});

/** Cap history queries — unbounded collect() exceeds Convex's 1s query limit. */
const LIST_THREADS_LIMIT = 100;

export const listThreads = authedQuery({
  args: {},
  returns: v.array(threadReturn),
  handler: async (ctx) => {
    // Newest first within non-archived (archivedAt is unused today but keep the filter).
    return await ctx.db
      .query("generationThreads")
      .withIndex("by_owner_and_archived", (q) =>
        q.eq("ownerId", ctx.user._id).eq("archivedAt", undefined),
      )
      .order("desc")
      .take(LIST_THREADS_LIMIT);
  },
});

export const listEvents = authedQuery({
  args: {
    threadId: v.id("generationThreads"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(eventReturn),
  handler: async (ctx, args) => {
    await requireThreadOwner(ctx, args.threadId);
    const events = await ctx.db
      .query("generationEvents")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", args.threadId))
      .collect();
    const resultAssetIds = Array.from(new Set(events.flatMap((event) => event.assetIds ?? [])));
    const assets = (await Promise.all(resultAssetIds.map((assetId) => ctx.db.get("assets", assetId))))
      .filter((asset): asset is Doc<"assets"> => asset !== null);
    const assetsById = new Map(assets.map((asset) => [asset._id, asset]));
    const jobIds = Array.from(
      new Set(
        events
          .map((event) => event.generationJobId)
          .filter((jobId): jobId is Id<"generationJobs"> => jobId !== undefined),
      ),
    );
    const jobs = (await Promise.all(jobIds.map((jobId) => ctx.db.get("generationJobs", jobId)))).filter(
      (job): job is Doc<"generationJobs"> => job !== null,
    );
    const jobsById = new Map(jobs.map((job) => [job._id, job]));
    return await Promise.all(events.map(async (event) => {
      const job = event.generationJobId ? jobsById.get(event.generationJobId) : null;
      return {
        ...event,
        ...(job?.mode ? { jobMode: job.mode } : {}),
        ...(event.kind === "stage" && event.stage === "failed" && job?.error
          ? { error: job.error }
          : {}),
        resultAssets: event.assetIds?.length
        ? await Promise.all(
            event.assetIds
              .map((assetId) => assetsById.get(assetId))
              .filter((asset): asset is Doc<"assets"> => asset !== undefined)
              .map(async (asset) => {
                const thumbPath =
                  asset.thumbnailPath ||
                  (asset.bunnyPath && asset.kind === "image" ? asset.bunnyPath : undefined);
                const [signedThumbnailUrl, signedThumbnailLqipUrl] = thumbPath && args.expiresUnix
                  ? await Promise.all([
                      signBunnyCdnUrl(thumbPath, args.expiresUnix, THUMB_TRANSFORM),
                      signBunnyCdnUrl(thumbPath, args.expiresUnix, LQIP_TRANSFORM),
                    ])
                  : [undefined, undefined];
                return {
                  _id: asset._id,
                  name: asset.name,
                  kind: asset.kind,
                  mimeType: asset.mimeType,
                  byteSize: asset.byteSize,
                  signedReadUrl: asset.bunnyPath && args.expiresUnix
                    ? await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind)
                    : undefined,
                  signedThumbnailUrl,
                  signedThumbnailLqipUrl,
                };
              }),
          )
        : undefined,
      };
    }));
  },
});

export const createThread = authedMutation({
  args: {
    folderId: v.id("folders"),
    title: v.optional(v.string()),
    assistanceEnabled: v.optional(v.boolean()),
  },
  returns: v.id("generationThreads"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    // Missing user default → on; only an explicit false opts out.
    const assistanceEnabled =
      args.assistanceEnabled ?? ctx.user.assistanceDefaultEnabled !== false;
    return await ctx.db.insert("generationThreads", {
      ownerId: ctx.user._id,
      linkedFolderId: args.folderId,
      title: args.title ?? "New generation",
      sortOrder: now,
      assistanceEnabled,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setThreadAssistance = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    enabled: v.boolean(),
    /** When true, also update the account default for future chats. */
    updateAccountDefault: v.optional(v.boolean()),
  },
  returns: v.object({
    assistanceEnabled: v.boolean(),
    assistanceDefaultEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    const now = Date.now();
    await ctx.db.patch(thread._id, {
      assistanceEnabled: args.enabled,
      updatedAt: now,
    });
    let assistanceDefaultEnabled = ctx.user.assistanceDefaultEnabled !== false;
    if (args.updateAccountDefault !== false) {
      await ctx.db.patch(ctx.user._id, {
        assistanceDefaultEnabled: args.enabled,
        updatedAt: now,
      });
      assistanceDefaultEnabled = args.enabled;
    }
    return {
      assistanceEnabled: args.enabled,
      assistanceDefaultEnabled,
    };
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
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    audioEnabled: v.optional(v.boolean()),
    videoModel: v.optional(v.string()),
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
    if (args.tier === "pro_video" && args.resolution === "3840x2160") {
      return {
        canGenerate: false,
        creditBalance: account?.creditBalance ?? 0,
        cost: 0,
        hasActiveSubscription: false,
        reason: "4K video isn't available yet. Try 1080p or 720p for now.",
      };
    }
    if (args.tier === "pro_video" && !isSupportedVideoDuration(args.durationSeconds)) {
      return {
        canGenerate: false,
        creditBalance: account?.creditBalance ?? 0,
        cost: 0,
        hasActiveSubscription: false,
        reason: "Video duration must be between 4 and 15 seconds.",
      };
    }
    const cost = generationCreditCost({
      tier: args.tier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      videoModel: args.videoModel,
    });
    const creditBalance = account?.creditBalance ?? 0;
    const hasActiveSubscription = await hasActiveSubscriptionForUser(
      ctx,
      ctx.user._id,
      args.now,
    );
    const canGenerate = creditBalance >= cost;
    return {
      canGenerate,
      creditBalance,
      cost,
      hasActiveSubscription,
      reason: canGenerate ? undefined : insufficientCreditsMessage(cost),
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
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    skipPromptEnhancement: v.optional(v.boolean()),
  },
  returns: v.id("generationJobs"),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    await requireFolderOwner(ctx, thread.linkedFolderId);
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Seedance 2.0 supports up to 1080p through AI Gateway.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "studio",
      });
    }
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    if (args.styleSheetElementId) {
      const sheet = await ctx.db.get("elements", args.styleSheetElementId);
      if (!sheet || sheet.ownerId !== ctx.user._id || sheet.deletedAt || sheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!sheet.styleRules?.trim() && !sheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const now = Date.now();
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForJob(ctx, {
      tier: billingTier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      quality: args.quality,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      reservedCreditTransactionId,
      skipPromptEnhancement: args.skipPromptEnhancement,
      source: "ui",
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

/**
 * Assistance media approval transaction. Every fallible validation and the exact
 * credit reservation happens before the brief is advanced or a job is exposed.
 * Internal-only so clients cannot bypass the action’s media preflight.
 */
export const approveAssistedMedia = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    planFingerprint: v.string(),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    created: v.boolean(),
    replacement: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.ownerId !== args.userId) throw new Error("Brief not found");
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    const plan = parseAssistanceGenerationPlan(brief.generationPlanJson);
    if (
      !plan ||
      plan.fingerprint !== args.planFingerprint ||
      brief.generationPlanFingerprint !== args.planFingerprint ||
      (plan.mode !== "image" && plan.mode !== "video")
    ) {
      throw new Error("The reviewed generation plan is stale. Review the brief again.");
    }
    if (brief.status !== "review_ready" && brief.status !== "failed" && brief.status !== "generating") {
      throw new Error("Brief is not ready to approve.");
    }

    let replacement = false;
    if (brief.approvedJobId && brief.approvedRevision === args.expectedRevision) {
      const previous = await ctx.db.get("generationJobs", brief.approvedJobId);
      if (
        previous &&
        previous.ownerId === args.userId &&
        canReuseAssistanceMediaJob(previous.stage)
      ) {
        return { jobId: previous._id, created: false, replacement: false };
      }
      replacement = true;
    }

    const thread = await requireThreadForUser(ctx, args.userId, brief.threadId);
    await requireFolderForUser(ctx, args.userId, thread.linkedFolderId);
    const stylePresetId = plan.settings.stylePresetId as Id<"stylePresets"> | undefined;
    if (!stylePresetId) throw new Error("Select a style before approving.");
    const preset = await ctx.db.get("stylePresets", stylePresetId);
    if (!preset || !preset.enabled) throw new Error("Style preset not available");

    const styleSheetElementId = plan.settings.styleSheetElementId as
      | Id<"elements">
      | undefined;
    if (styleSheetElementId) {
      const sheet = await ctx.db.get("elements", styleSheetElementId);
      if (
        !sheet ||
        sheet.ownerId !== args.userId ||
        sheet.deletedAt ||
        sheet.type !== "style_sheet" ||
        (!sheet.styleRules?.trim() && !sheet.sheetAssetId) ||
        sheet.name !== plan.style?.name ||
        sheet.styleRules?.slice(0, 20_000) !== plan.style?.styleRules ||
        sheet.renderMode !== plan.style?.renderMode ||
        String(sheet.sheetAssetId ?? "") !== String(plan.style?.sheetAssetId ?? "")
      ) {
        throw new Error("Style Sheet changed after review. Review the brief again.");
      }
    }

    const referenceKinds: Array<"image" | "video" | "audio"> = [];
    for (const reference of plan.references) {
      if (reference.kind === "asset" || reference.kind === "style_sheet_visual") {
        const asset = await ctx.db.get("assets", reference.id as Id<"assets">);
        if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
          throw new Error(`Reviewed reference “${reference.label ?? reference.id}” is unavailable.`);
        }
        if (!asset.bunnyPath) {
          throw new Error(
            `Reviewed reference “${reference.label ?? reference.id}” has no stored media.`,
          );
        }
        if (reference.mediaKind && asset.kind !== reference.mediaKind) {
          throw new Error("A reviewed reference changed after review.");
        }
        if (
          plan.mode === "image" &&
          asset.kind !== "image"
        ) {
          throw new Error("Image jobs accept image references only.");
        }
        if (
          reference.role !== "start_frame" &&
          (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
        ) {
          referenceKinds.push(asset.kind);
        }
      } else if (reference.kind === "document") {
        const document = await ctx.db.get("documents", reference.id as Id<"documents">);
        if (!document || document.ownerId !== args.userId || document.deletedAt) {
          throw new Error(`Reviewed document “${reference.label ?? reference.id}” is unavailable.`);
        }
      } else {
        const element = await ctx.db.get("elements", reference.id as Id<"elements">);
        if (!element || element.ownerId !== args.userId || element.deletedAt) {
          throw new Error(`Reviewed element “${reference.label ?? reference.id}” is unavailable.`);
        }
      }
    }

    const hasStartFrame = plan.references.some(
      (reference) => reference.role === "start_frame" && reference.mediaKind === "image",
    );
    if (plan.mode === "video") {
      validateVideoModelCapabilities(plan.settings.resolvedModel, {
        durationSeconds: plan.settings.durationSeconds,
        hasStartFrame,
        referenceKinds: referenceKinds.filter(
          (kind, index, all) => all.indexOf(kind) === index,
        ),
        surface: "studio",
      });
    }
    if (plan.mode === "video" && plan.settings.resolution === "3840x2160") {
      throw new Error("4K video is not available yet.");
    }

    const tier = billingTierForMode(plan.mode);
    const pricingArgs = {
      tier,
      resolution: plan.settings.resolution,
      quality: plan.settings.quality,
      aspectRatio: plan.settings.aspectRatio,
      durationSeconds: plan.settings.durationSeconds,
      hasReferenceInput: plan.estimate.inputs.hasReferenceInput,
      hasVideoReferenceInput: plan.estimate.inputs.hasVideoReferenceInput,
      hasNonVideoReferenceInput: plan.estimate.inputs.hasNonVideoReferenceInput,
      audioEnabled: plan.settings.audioEnabled,
      resolvedModel: plan.settings.resolvedModel,
    };
    const exactCost = generationCreditCost(pricingArgs);
    if (
      exactCost !== plan.estimate.credits ||
      (brief.estimatedCredits !== undefined && exactCost !== brief.estimatedCredits)
    ) {
      throw new Error("Generation pricing changed after review. Review the brief again.");
    }
    const reservedCreditTransactionId = await reserveCreditsForUser(
      ctx,
      args.userId,
      pricingArgs,
    );
    const now = Date.now();
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: brief.threadId,
      saveFolderId: thread.linkedFolderId,
      mode: plan.mode,
      tier,
      resolvedModel: plan.settings.resolvedModel,
      stylePresetId,
      styleSheetElementId,
      userPrompt: plan.finalPrompt,
      stage: "queued",
      audioEnabled: plan.mode === "video" ? plan.settings.audioEnabled : undefined,
      aspectRatio: plan.settings.aspectRatio,
      resolution: plan.settings.resolution,
      quality: plan.settings.quality,
      durationSeconds: plan.settings.durationSeconds,
      hasReferenceInput: plan.estimate.inputs.hasReferenceInput,
      hasVideoReferenceInput:
        plan.mode === "video" ? plan.estimate.inputs.hasVideoReferenceInput : undefined,
      hasNonVideoReferenceInput:
        plan.mode === "video" ? plan.estimate.inputs.hasNonVideoReferenceInput : undefined,
      reservedCreditTransactionId,
      skipPromptEnhancement: plan.settings.skipPromptEnhancement,
      source: "ui",
      createdAt: now,
      updatedAt: now,
    });
    for (const reference of plan.references) {
      await ctx.db.insert("generationInputs", {
        jobId,
        assetId:
          reference.kind === "asset" || reference.kind === "style_sheet_visual"
            ? (reference.id as Id<"assets">)
            : undefined,
        documentId:
          reference.kind === "document"
            ? (reference.id as Id<"documents">)
            : undefined,
        elementId:
          reference.kind === "element" ? (reference.id as Id<"elements">) : undefined,
        kind:
          reference.kind === "asset" || reference.kind === "style_sheet_visual"
            ? "asset"
            : reference.kind,
        role: reference.role,
        sortOrder: reference.sortOrder,
      });
    }
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: brief.threadId,
      kind: "prompt",
      order: now,
      prompt: plan.finalPrompt,
      generationJobId: jobId,
      briefId: brief._id,
      briefRevision: brief.revision,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: brief.threadId,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      briefId: brief._id,
      briefRevision: brief.revision,
      createdAt: now,
    });
    await ctx.db.patch(brief._id, {
      status: "generating",
      approvedRevision: brief.revision,
      approvedJobId: jobId,
      approvedAt: now,
      error: undefined,
      updatedAt: now,
    });
    // Schedule execution in the same transaction so a crashed action cannot
    // leave a charged queued job permanently unscheduled.
    const runAssistedApprovedJobRef = makeFunctionReference<
      "action",
      { jobId: Id<"generationJobs">; briefId: Id<"guidedBriefs"> },
      null
    >("guidedVideoActions:runAssistedApprovedJob");
    await ctx.scheduler.runAfter(0, runAssistedApprovedJobRef, {
      jobId,
      briefId: brief._id,
    });
    return { jobId, created: true, replacement };
  },
});

export const internalCreateThread = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    title: v.optional(v.string()),
  },
  returns: v.id("generationThreads"),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    const now = Date.now();
    return await ctx.db.insert("generationThreads", {
      ownerId: args.userId,
      linkedFolderId: args.folderId,
      title: args.title ?? "API generation",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const internalCreateQueuedJob = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    apiKeyId: v.optional(v.id("apiKeys")),
  },
  returns: v.id("generationJobs"),
  handler: async (ctx, args) => {
    const thread = await requireThreadForUser(ctx, args.userId, args.threadId);
    await requireFolderForUser(ctx, args.userId, thread.linkedFolderId);
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Seedance 2.0 supports up to 1080p through AI Gateway.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "internal",
      });
    }
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    const now = Date.now();
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForUser(ctx, args.userId, {
      tier: billingTier,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: args.threadId,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      reservedCreditTransactionId,
      source: "api",
      apiKeyId: args.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: args.threadId,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
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

export const prepareApiGeneration = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    title: v.optional(v.string()),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    skipPromptEnhancement: v.optional(v.boolean()),
  },
  returns: v.object({
    threadId: v.id("generationThreads"),
    jobId: v.id("generationJobs"),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Seedance 2.0 supports up to 1080p through AI Gateway.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "api",
      });
    }
    const now = Date.now();
    const threadId = await ctx.db.insert("generationThreads", {
      ownerId: args.userId,
      linkedFolderId: args.folderId,
      title: args.title ?? "API generation",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const thread = await requireThreadForUser(ctx, args.userId, threadId);
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    if (args.styleSheetElementId) {
      const sheet = await ctx.db.get("elements", args.styleSheetElementId);
      if (!sheet || sheet.ownerId !== args.userId || sheet.deletedAt || sheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!sheet.styleRules?.trim() && !sheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForUser(ctx, args.userId, {
      tier: billingTier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: thread._id,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      quality: args.quality,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      reservedCreditTransactionId,
      source: "api",
      apiKeyId: args.apiKeyId,
      skipPromptEnhancement: args.skipPromptEnhancement,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return { threadId, jobId };
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
      quality: v.optional(v.string()),
      durationSeconds: v.optional(v.number()),
      externalTaskId: v.optional(v.string()),
      error: v.optional(v.string()),
      reservedCreditTransactionId: v.optional(v.id("creditTransactions")),
      spentCreditTransactionId: v.optional(v.id("creditTransactions")),
      skipPromptEnhancement: v.optional(v.boolean()),
      styleSheetElementId: v.optional(v.id("elements")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    preset: v.object({
      _id: v.id("stylePresets"),
      slug: v.string(),
      name: v.string(),
      systemInstructions: v.string(),
      scriptInstructions: v.optional(v.string()),
      storytelling: v.optional(v.boolean()),
      negativePrompt: v.optional(v.string()),
    }),
    styleSheet: v.optional(
      v.object({
        _id: v.id("elements"),
        name: v.string(),
        styleRules: v.optional(v.string()),
        renderMode: v.optional(v.string()),
        sheetAssetId: v.optional(v.id("assets")),
      }),
    ),
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
    const styleSheet = job.styleSheetElementId
      ? await ctx.db.get("elements", job.styleSheetElementId)
      : null;
    const presetInstructions =
      styleSheet && styleSheet.type === "style_sheet"
        ? styleSheetSystemInstructions({
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
            hasVisualReference: Boolean(styleSheet.sheetAssetId),
          })
        : preset.systemInstructions;
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
        styleSheetElementId: job.styleSheetElementId,
        userPrompt: job.userPrompt,
        enhancedPrompt: job.enhancedPrompt,
        negativePrompt: job.negativePrompt,
        stage: job.stage,
        audioEnabled: job.audioEnabled,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        quality: job.quality,
        durationSeconds: job.durationSeconds,
        externalTaskId: job.externalTaskId,
        error: job.error,
        reservedCreditTransactionId: job.reservedCreditTransactionId,
        spentCreditTransactionId: job.spentCreditTransactionId,
        skipPromptEnhancement: job.skipPromptEnhancement,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      preset: {
        _id: preset._id,
        slug: preset.slug,
        name: styleSheet?.name ?? preset.name,
        systemInstructions: presetInstructions,
        scriptInstructions: preset.scriptInstructions,
        storytelling: preset.storytelling,
        negativePrompt: preset.negativePrompt,
      },
      styleSheet: styleSheet
        ? {
            _id: styleSheet._id,
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
            sheetAssetId: styleSheet.sheetAssetId,
          }
        : undefined,
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
    styleSheetElementId: v.optional(v.id("elements")),
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
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
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

/**
 * Atomically claim a queued job for provider execution.
 * Returns acquired=false when another worker already claimed it.
 */
export const claimJobExecution = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    attemptId: v.string(),
  },
  returns: v.object({
    acquired: v.boolean(),
    stage: generationStage,
  }),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.stage === "done" || job.stage === "failed") {
      return {
        acquired: false,
        stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
      };
    }
    if (job.executionAttemptId) {
      return {
        acquired: job.executionAttemptId === args.attemptId,
        stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
      };
    }
    if (job.stage !== "queued") {
      return {
        acquired: false,
        stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
      };
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      stage: "generating",
      executionAttemptId: args.attemptId,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: "generating",
      generationJobId: job._id,
      createdAt: now,
    });
    return { acquired: true, stage: "generating" as const };
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
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
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
    const guidedBrief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_job", (q) => q.eq("approvedJobId", job._id))
      .first();
    if (guidedBrief) {
      await ctx.db.patch(guidedBrief._id, {
        status: "done",
        error: undefined,
        updatedAt: now,
      });
    }
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
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
    const now = Date.now();
    if (job.reservedCreditTransactionId) {
      await refundReservedCredits(ctx, job, args.error);
    }
    await ctx.db.patch(job._id, {
      stage: "failed",
      error: args.error,
      updatedAt: now,
    });
    const guidedBrief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_job", (q) => q.eq("approvedJobId", job._id))
      .first();
    if (guidedBrief) {
      await ctx.db.patch(guidedBrief._id, {
        status: "failed",
        error: args.error,
        updatedAt: now,
      });
    }
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

function insufficientCreditsMessage(cost: number): string {
  const amount = cost * CREDIT_PRICE_TTD;
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/, "");
  return `You need $${formatted} TTD to generate this. Top up to continue.`;
}

function resolveVideoPricingModel(args: {
  tier: "image" | "pro_video" | "low" | "medium" | "high";
  videoModel?: string;
  resolvedModel?: string;
}): "seedance-2.0" | "google-omni-flash" | "kling-3.0-i2v" | undefined {
  if (args.tier !== "pro_video") {
    return undefined;
  }
  if (
    args.videoModel === "seedance-2.0" ||
    args.videoModel === "google-omni-flash" ||
    args.videoModel === "kling-3.0-i2v"
  ) {
    return args.videoModel;
  }
  if (args.resolvedModel) {
    return videoPricingModelFromGatewayId(args.resolvedModel);
  }
  return "seedance-2.0";
}

function generationCreditCost(args: {
  tier: "image" | "pro_video" | "low" | "medium" | "high";
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  hasReferenceInput?: boolean;
  hasVideoReferenceInput?: boolean;
  hasNonVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: string;
  resolvedModel?: string;
}): number {
  return creditCostForGeneration({
    tier: args.tier,
    resolution: args.resolution,
    quality: args.quality,
    aspectRatio: args.aspectRatio,
    durationSeconds: args.durationSeconds,
    hasReferenceInput: args.hasReferenceInput,
    hasVideoReferenceInput: args.hasVideoReferenceInput,
    hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
    audioEnabled: args.audioEnabled,
    videoModel: resolveVideoPricingModel(args),
  });
}

async function reserveCreditsForJob(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  args: {
    tier: "image" | "pro_video" | "low" | "medium" | "high";
    resolution?: string;
    quality?: string;
    aspectRatio?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    audioEnabled?: boolean;
    videoModel?: string;
    resolvedModel?: string;
  },
): Promise<Id<"creditTransactions">> {
  return await reserveCreditsForUser(ctx, ctx.user._id, args);
}

async function reserveCreditsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    tier: "image" | "pro_video" | "low" | "medium" | "high";
    resolution?: string;
    quality?: string;
    aspectRatio?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    audioEnabled?: boolean;
    videoModel?: string;
    resolvedModel?: string;
  },
): Promise<Id<"creditTransactions">> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const cost = generationCreditCost(args);
  const now = Date.now();
  if (!account || account.creditBalance < cost) {
    throw new Error(insufficientCreditsMessage(cost));
  }
  const balanceAfter = account.creditBalance - cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: account.reservedCredits + cost,
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId,
    billingAccountId: account._id,
    kind: "reserved",
    amount: -cost,
    balanceAfter,
    reason: `Reserved for ${args.tier} generation`,
    createdAt: now,
  });
}

async function requireFolderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== userId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  return folder;
}

async function requireThreadForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  threadId: Id<"generationThreads">,
) {
  const thread = await ctx.db.get("generationThreads", threadId);
  if (!thread || thread.ownerId !== userId) {
    throw new Error("Unauthorized");
  }
  return thread;
}

export const chargeTextGeneration = authedMutation({
  args: {
    folderId: v.id("folders"),
    imageReferenceCount: v.optional(v.number()),
    videoReferenceCount: v.optional(v.number()),
    audioReferenceCount: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  returns: v.id("creditTransactions"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const cost = textCreditCost(args);
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      throw new Error(insufficientCreditsMessage(cost));
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    return await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Text generation",
      createdAt: now,
    });
  },
});

export const chargeImageGeneration = authedMutation({
  args: {
    folderId: v.id("folders"),
    resolution: v.optional(v.string()),
    hasReferenceInput: v.optional(v.boolean()),
  },
  returns: v.id("creditTransactions"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const cost = imageCreditCost({
      resolution: args.resolution,
      hasReferenceInput: args.hasReferenceInput,
    });
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      throw new Error(insufficientCreditsMessage(cost));
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    return await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Image generation",
      createdAt: now,
    });
  },
});

export const refundTextGeneration = authedMutation({
  args: {
    transactionId: v.id("creditTransactions"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get("creditTransactions", args.transactionId);
    if (
      !transaction ||
      transaction.userId !== ctx.user._id ||
      transaction.kind !== "spent" ||
      transaction.amount >= 0
    ) {
      return null;
    }
    const existingRefund = await ctx.db
      .query("creditTransactions")
      .withIndex("by_reversed_transaction", (q) =>
        q.eq("reversesTransactionId", transaction._id),
      )
      .unique();
    if (existingRefund) return null;
    const account = await ctx.db.get("billingAccounts", transaction.billingAccountId);
    if (!account || account.userId !== ctx.user._id) {
      return null;
    }
    const refundAmount = Math.abs(transaction.amount);
    const now = Date.now();
    const balanceAfter = account.creditBalance + refundAmount;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "refunded",
      amount: refundAmount,
      balanceAfter,
      reversesTransactionId: transaction._id,
      reason: args.reason ?? "Text generation failed",
      createdAt: now,
    });
    return null;
  },
});

function isSupportedVideoDuration(durationSeconds?: number): boolean {
  const duration = Number(durationSeconds ?? 4);
  return Number.isFinite(duration) && duration >= 4 && duration <= 15;
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
  if (!job.reservedCreditTransactionId) {
    return undefined;
  }
  if (job.spentCreditTransactionId) return job.spentCreditTransactionId;
  const reservation = await ctx.db.get(job.reservedCreditTransactionId);
  if (
    !reservation ||
    reservation.kind !== "reserved" ||
    reservation.userId !== job.ownerId ||
    reservation.amount >= 0
  ) {
    throw new Error("Generation credit reservation is invalid");
  }
  const existingSettlement = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", reservation._id),
    )
    .unique();
  if (existingSettlement) {
    if (existingSettlement.kind !== "spent") {
      throw new Error("Generation credit reservation was already reversed");
    }
    return existingSettlement._id;
  }
  const account = await ctx.db.get(reservation.billingAccountId);
  if (!account || account.userId !== job.ownerId) {
    throw new Error("Generation billing account is invalid");
  }
  const cost = Math.abs(reservation.amount);
  if (account.reservedCredits < cost) {
    throw new Error("Generation reserved credit balance is inconsistent");
  }
  const now = Date.now();
  await ctx.db.patch(account._id, {
    reservedCredits: account.reservedCredits - cost,
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "spent",
    amount: 0,
    balanceAfter: account.creditBalance,
    generationJobId: job._id,
    reversesTransactionId: reservation._id,
    reason: "Generation completed",
    createdAt: now,
  });
}

async function refundReservedCredits(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<void> {
  if (!job.reservedCreditTransactionId) {
    return;
  }
  const reservation = await ctx.db.get(job.reservedCreditTransactionId);
  if (
    !reservation ||
    reservation.kind !== "reserved" ||
    reservation.userId !== job.ownerId ||
    reservation.amount >= 0
  ) {
    throw new Error("Generation credit reservation is invalid");
  }
  const existingReversal = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", reservation._id),
    )
    .unique();
  if (existingReversal) return;
  const account = await ctx.db.get(reservation.billingAccountId);
  if (!account || account.userId !== job.ownerId) {
    throw new Error("Generation billing account is invalid");
  }
  const cost = Math.abs(reservation.amount);
  if (account.reservedCredits < cost) {
    throw new Error("Generation reserved credit balance is inconsistent");
  }
  const now = Date.now();
  const balanceAfter = account.creditBalance + cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: account.reservedCredits - cost,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "refunded",
    amount: cost,
    balanceAfter,
    generationJobId: job._id,
    reversesTransactionId: reservation._id,
    reason,
    createdAt: now,
  });
}

export const chargeImageForUser = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    resolution: v.optional(v.string()),
    hasReferenceInput: v.optional(v.boolean()),
  },
  returns: v.object({
    transactionId: v.id("creditTransactions"),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const creditsSpent = imageCreditCost({
      resolution: args.resolution,
      hasReferenceInput: args.hasReferenceInput,
    });
    const now = Date.now();
    if (!account || account.creditBalance < creditsSpent) {
      throw new Error(insufficientCreditsMessage(creditsSpent));
    }
    const balanceAfter = account.creditBalance - creditsSpent;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    const transactionId = await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      billingAccountId: account._id,
      kind: "spent",
      amount: -creditsSpent,
      balanceAfter,
      reason: "Image generation",
      createdAt: now,
    });
    return { transactionId, creditsSpent };
  },
});

export const refundCreditTransactionForUser = internalMutation({
  args: {
    userId: v.id("users"),
    transactionId: v.id("creditTransactions"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get("creditTransactions", args.transactionId);
    if (
      !transaction ||
      transaction.userId !== args.userId ||
      transaction.kind !== "spent" ||
      transaction.amount >= 0
    ) {
      return null;
    }
    const existingRefund = await ctx.db
      .query("creditTransactions")
      .withIndex("by_reversed_transaction", (q) =>
        q.eq("reversesTransactionId", transaction._id),
      )
      .unique();
    if (existingRefund) return null;
    const account = await ctx.db.get("billingAccounts", transaction.billingAccountId);
    if (!account || account.userId !== args.userId) {
      return null;
    }
    const refundAmount = Math.abs(transaction.amount);
    const now = Date.now();
    const balanceAfter = account.creditBalance + refundAmount;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      billingAccountId: account._id,
      kind: "refunded",
      amount: refundAmount,
      balanceAfter,
      reversesTransactionId: transaction._id,
      reason: args.reason ?? "Generation failed",
      createdAt: now,
    });
    return null;
  },
});
