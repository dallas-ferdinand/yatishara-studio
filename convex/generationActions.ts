"use node";

import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { putObject } from "./lib/bunny";
import {
  enhancePrompt,
  generateImage,
  generateScript as generateScriptWithGateway,
  generateVideo,
  imageModelForRequest,
} from "./lib/aiGateway";
import { referenceInputValidator } from "./lib/referenceInput";
import { isDirectPromptMode, shouldSkipPromptEnhancement } from "./lib/skipPromptEnhancement";
import {
  normalizeScriptType,
  scriptDocumentTitle,
} from "./lib/composerScriptTypes";
import { normalizeReferenceIntent } from "./lib/referenceIntent";
import {
  extractCreativeVideoPrompt,
  finalizeGatewayVideoPrompt,
} from "./lib/videoGeneration";
import { resolveVideoModel } from "./lib/videoModels";
import { friendlyGenerationErrorText } from "./lib/generationUserErrors";
import { styleSheetSystemInstructions } from "./lib/styleSheetGuides";

function finalizeVideoPrompt(
  prompt: string,
  args: {
    startFrameUrl?: string;
    referenceImageCount: number;
    gatewayModelId: string;
    skipPromptEnhancement?: boolean;
    presetSlug?: string;
  },
): string {
  const directPrompt = isDirectPromptMode({
    skipPromptEnhancement: args.skipPromptEnhancement,
    presetSlug: args.presetSlug,
  });
  return finalizeGatewayVideoPrompt({
    prompt,
    startFrameUrl: args.startFrameUrl,
    referenceImageCount: args.referenceImageCount,
    gatewayModelId: args.gatewayModelId,
    creativePrompt: extractCreativeVideoPrompt(prompt),
    directPrompt,
  });
}

const createQueuedJobRef = makeFunctionReference<
  "mutation",
  {
    threadId: Id<"generationThreads">;
    mode: "image" | "video";
    tier: "image" | "pro_video" | "low" | "medium" | "high";
    resolvedModel: string;
    stylePresetId: Id<"stylePresets">;
    styleSheetElementId?: Id<"elements">;
    userPrompt: string;
    audioEnabled?: boolean;
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    skipPromptEnhancement?: boolean;
  },
  Id<"generationJobs">
>("generation:createQueuedJob");

const markStageRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    stage: "queued" | "generating" | "saving" | "done" | "failed";
    error?: string;
  },
  null
>("generation:markStage");

const getJobRunContextRef = internalQueryRef<
  { jobId: Id<"generationJobs"> },
  {
    job: {
      _id: Id<"generationJobs">;
      userPrompt: string;
      mode: "image" | "video";
      resolvedModel: string;
      durationSeconds?: number;
      resolution?: string;
      aspectRatio?: string;
      skipPromptEnhancement?: boolean;
    };
    preset: {
      slug: string;
      name: string;
      systemInstructions: string;
      scriptInstructions?: string;
      storytelling?: boolean;
      negativePrompt?: string;
    };
  }
>("generation:getJobRunContext");

const setEnhancedPromptRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    enhancedPrompt: string;
    negativePrompt?: string;
  },
  null
>("generation:setEnhancedPrompt");

const createGeneratedAssetRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    name: string;
    kind: "image" | "video";
    mimeType: string;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>("generation:createGeneratedAsset");

const completeWithOutputsRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    assetIds: Id<"assets">[];
  },
  null
>("generation:completeWithOutputs");

const failJobRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    error: string;
  },
  null
>("generation:failJob");

const chargeTextGenerationRef = publicMutationRef<
  {
    folderId: Id<"folders">;
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const refundTextGenerationRef = publicMutationRef<
  {
    transactionId: Id<"creditTransactions">;
    reason?: string;
  },
  null
>("generation:refundTextGeneration");

const createDocumentRef = publicMutationRef<
  {
    folderId: Id<"folders">;
    title: string;
    contentMarkdown?: string;
  },
  Id<"documents">
>("documents:create");

const chargeTextForApiRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
  },
  { transactionId: Id<"creditTransactions">; cost: number }
>("studioApiInternal:chargeTextGenerationForApi");

const createDocumentForApiRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    title: string;
    contentMarkdown?: string;
  },
  Id<"documents">
>("studioApiInternal:createDocumentForApi");

const refundTextForApiRef = internalMutationRef<
  {
    userId: Id<"users">;
    transactionId: Id<"creditTransactions">;
    reason?: string;
  },
  null
>("studioApiInternal:refundTextGenerationForApi");

const internalCreateThreadRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    title?: string;
  },
  Id<"generationThreads">
>("generation:internalCreateThread");

const internalCreateQueuedJobRef = internalMutationRef<
  {
    userId: Id<"users">;
    threadId: Id<"generationThreads">;
    mode: "image" | "video";
    tier: "image" | "pro_video" | "low" | "medium" | "high";
    resolvedModel: string;
    stylePresetId: Id<"stylePresets">;
    userPrompt: string;
    audioEnabled?: boolean;
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    apiKeyId?: Id<"apiKeys">;
  },
  Id<"generationJobs">
>("generation:internalCreateQueuedJob");

const prepareApiGenerationRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    apiKeyId?: Id<"apiKeys">;
    mode: "image" | "video";
    tier: "image" | "pro_video" | "low" | "medium" | "high";
    resolvedModel: string;
    stylePresetId: Id<"stylePresets">;
    styleSheetElementId?: Id<"elements">;
    userPrompt: string;
    title?: string;
    audioEnabled?: boolean;
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    skipPromptEnhancement?: boolean;
  },
  { threadId: Id<"generationThreads">; jobId: Id<"generationJobs"> }
>("generation:prepareApiGeneration");

const generationTier = v.union(
  v.literal("image"),
  v.literal("pro_video"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const generateScript = action({
  args: {
    folderId: v.id("folders"),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    attachedScriptMarkdown: v.optional(v.array(v.string())),
    referenceInputs: v.optional(v.array(referenceInputValidator)),
    skipPromptEnhancement: v.optional(v.boolean()),
    scriptType: v.optional(v.string()),
    referenceIntent: v.optional(v.string()),
    hasRawImageReference: v.optional(v.boolean()),
    hasElementReference: v.optional(v.boolean()),
  },
  returns: v.object({
    documentId: v.id("documents"),
  }),
  handler: async (ctx, args): Promise<{ documentId: Id<"documents"> }> => {
    const referenceInputs = args.referenceInputs ?? [];
    const preset = await ctx.runQuery(api.stylePresets.get, {
      presetId: args.stylePresetId,
    });
    if (!preset) {
      throw new Error("Selected creative preset is not available.");
    }
    let styleSheet;
    if (args.styleSheetElementId) {
      styleSheet = await ctx.runQuery(api.elements.get, {
        elementId: args.styleSheetElementId,
      });
      if (!styleSheet || styleSheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!styleSheet.styleRules?.trim() && !styleSheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const presetInstructions =
      styleSheet && styleSheet.type === "style_sheet"
        ? styleSheetSystemInstructions({
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
          })
        : preset.systemInstructions;
    const transactionId = await ctx.runMutation(chargeTextGenerationRef, {
      folderId: args.folderId,
      imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
      videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
      audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
    });
    try {
      const skipEnhancement = args.styleSheetElementId
        ? args.skipPromptEnhancement === true
        : shouldSkipPromptEnhancement({
            skipPromptEnhancement: args.skipPromptEnhancement,
            presetSlug: preset.slug,
          });
      const contentMarkdown = skipEnhancement
        ? args.userPrompt.trim()
        : await generateScriptWithGateway({
            userPrompt: args.userPrompt,
            presetName: styleSheet?.name ?? preset.name,
            presetInstructions,
            scriptInstructions: preset.scriptInstructions,
            scriptType: normalizeScriptType(args.scriptType),
            presetSlug: preset.slug,
            referenceIntent: normalizeReferenceIntent(args.referenceIntent),
            storytellingEnabled: preset.storytelling,
            negativePrompt: preset.negativePrompt,
            attachedScriptMarkdown: args.attachedScriptMarkdown,
            referenceInputs,
            hasRawImageReference: args.hasRawImageReference,
            hasElementReference: args.hasElementReference,
          });
      const documentId = await ctx.runMutation(createDocumentRef, {
        folderId: args.folderId,
        title: scriptDocumentTitle(
          normalizeScriptType(args.scriptType),
          args.userPrompt,
          contentMarkdown,
        ),
        contentMarkdown,
      });
      return { documentId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Script generation failed";
      await ctx.runMutation(refundTextGenerationRef, {
        transactionId,
        reason: message,
      });
      throw error;
    }
  },
});

export const runFlow = action({
  args: {
    threadId: v.id("generationThreads"),
    mode: v.union(v.literal("image"), v.literal("video")),
    tier: generationTier,
    stylePresetId: v.id("stylePresets"),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    referenceUrls: v.optional(v.array(v.string())),
    referenceInputs: v.optional(v.array(referenceInputValidator)),
    attachedScriptMarkdown: v.optional(v.array(v.string())),
    referenceSummaries: v.optional(v.array(v.string())),
    startFrameUrl: v.optional(v.string()),
    videoModel: v.optional(v.string()),
    skipPromptEnhancement: v.optional(v.boolean()),
    styleSheetElementId: v.optional(v.id("elements")),
    referenceIntent: v.optional(v.string()),
    hasRawImageReference: v.optional(v.boolean()),
    hasElementReference: v.optional(v.boolean()),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    assetIds: v.optional(v.array(v.id("assets"))),
    externalTaskId: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    jobId: Id<"generationJobs">;
    assetIds?: Id<"assets">[];
    externalTaskId?: string;
  }> => {
    const resolvedModel = modelForRequest(args.mode, args.videoModel);
    const referenceInputs = args.referenceInputs ?? [];
    const jobId = await ctx.runMutation(createQueuedJobRef, {
      threadId: args.threadId,
      mode: args.mode,
      tier: args.tier,
      resolvedModel,
      stylePresetId: args.stylePresetId,
      userPrompt: args.userPrompt,
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput:
        args.mode === "video"
          ? Boolean(referenceInputs.length || args.startFrameUrl)
          : Boolean(args.referenceUrls?.length),
      hasVideoReferenceInput:
        args.mode === "video" && referenceInputs.some((input) => input.kind === "video"),
      hasNonVideoReferenceInput:
        args.mode === "video" &&
        referenceInputs.some((input) => input.kind === "image" || input.kind === "audio"),
      skipPromptEnhancement: args.skipPromptEnhancement,
      styleSheetElementId: args.styleSheetElementId,
    });

    try {
      await ctx.runMutation(markStageRef, {
        jobId,
        stage: "generating",
      });
      const { job, preset } = await ctx.runQuery(getJobRunContextRef, {
        jobId,
      });
      const skipEnhancement = shouldSkipPromptEnhancement({
        skipPromptEnhancement: job.skipPromptEnhancement,
        presetSlug: preset.slug,
      });
      const enhancedPrompt = skipEnhancement
        ? job.userPrompt
        : await enhancePromptWithFallback({
            userPrompt: job.userPrompt,
            presetName: preset.name,
            presetInstructions: preset.systemInstructions,
            scriptInstructions: preset.scriptInstructions,
            negativePrompt: preset.negativePrompt,
            outputKind: job.mode === "video" ? "video_prompt" : "image_prompt",
            storytellingEnabled: preset.storytelling,
            presetSlug: preset.slug,
            referenceIntent: normalizeReferenceIntent(args.referenceIntent),
            durationSeconds: job.durationSeconds ?? args.durationSeconds,
            resolution: job.resolution ?? args.resolution,
            aspectRatio: job.aspectRatio ?? args.aspectRatio,
            hasVideoReference: referenceInputs.some((input) => input.kind === "video"),
            hasImageReference:
              referenceInputs.some((input) => input.kind === "image") ||
              Boolean(args.referenceUrls?.length),
            hasRawImageReference: args.hasRawImageReference,
            hasElementReference: args.hasElementReference,
            attachedScriptMarkdown: args.attachedScriptMarkdown,
            referenceSummaries: args.referenceSummaries,
          });
      await ctx.runMutation(setEnhancedPromptRef, {
        jobId,
        enhancedPrompt,
        negativePrompt: skipEnhancement ? undefined : preset.negativePrompt,
      });

      if (args.mode === "video") {
        const referenceImageUrls = referenceInputs
          .filter((input) => input.kind === "image")
          .map((input) => input.url);
        const videoPrompt = finalizeVideoPrompt(enhancedPrompt, {
          startFrameUrl: args.startFrameUrl,
          referenceImageCount: referenceImageUrls.length,
          gatewayModelId: job.resolvedModel,
          skipPromptEnhancement: job.skipPromptEnhancement,
          presetSlug: preset.slug,
        });
        const video = await generateVideo({
          prompt: videoPrompt,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          durationSeconds: args.durationSeconds,
          generateAudio: args.audioEnabled ?? false,
          modelId: job.resolvedModel,
          startFrameUrl: args.startFrameUrl,
          referenceImageUrls,
          referenceVideoUrls: referenceInputs
            .filter((input) => input.kind === "video")
            .map((input) => input.url),
          referenceAudioUrls: referenceInputs
            .filter((input) => input.kind === "audio")
            .map((input) => input.url),
        });
        await ctx.runMutation(markStageRef, {
          jobId,
          stage: "saving",
        });
        const assetId = await saveGeneratedMedia(ctx, {
          jobId,
          kind: "video",
          name: `generated-video-${jobId.slice(-6)}.${extensionForContentType(video.mediaType)}`,
          mediaType: video.mediaType,
          body: video.data,
        });
        await ctx.runMutation(completeWithOutputsRef, {
          jobId,
          assetIds: [assetId],
        });
        return { jobId, assetIds: [assetId] };
      }

      const imageResult = await generateImage({
        prompt: enhancedPrompt,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        referenceUrls: args.referenceUrls ?? [],
      });
      await ctx.runMutation(markStageRef, {
        jobId,
        stage: "saving",
      });
      const assetIds: Id<"assets">[] = [];
      for (const [index, image] of imageResult.images.entries()) {
        const assetId = await saveGeneratedMedia(ctx, {
          jobId,
          kind: "image",
          name: `generated-image-${index + 1}.${extensionForContentType(image.mediaType)}`,
          mediaType: image.mediaType,
          body: image.data,
        });
        assetIds.push(assetId);
      }
      await ctx.runMutation(completeWithOutputsRef, {
        jobId,
        assetIds,
      });
      return { jobId, assetIds };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      await ctx.runMutation(failJobRef, {
        jobId,
        error: friendlyGenerationErrorText(message, args.mode === "video" ? "video" : "image"),
      });
      throw error;
    }
  },
});

export const executeApiJob = action({
  args: {
    jobId: v.id("generationJobs"),
    mode: v.union(v.literal("image"), v.literal("video")),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioEnabled: v.optional(v.boolean()),
    referenceUrls: v.optional(v.array(v.string())),
    referenceInputs: v.optional(v.array(referenceInputValidator)),
    startFrameUrl: v.optional(v.string()),
    referenceIntent: v.optional(v.string()),
    hasRawImageReference: v.optional(v.boolean()),
    hasElementReference: v.optional(v.boolean()),
    attachedScriptMarkdown: v.optional(v.array(v.string())),
    referenceSummaries: v.optional(v.array(v.string())),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    assetIds: v.optional(v.array(v.id("assets"))),
  }),
  handler: async (ctx, args) => executeQueuedApiJob(ctx, args),
});

async function executeQueuedApiJob(
  ctx: ActionCtx,
  args: {
    jobId: Id<"generationJobs">;
    mode: "image" | "video";
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    audioEnabled?: boolean;
    referenceUrls?: string[];
    referenceInputs?: Array<{ kind: "image" | "video" | "audio"; url: string; mimeType?: string }>;
    startFrameUrl?: string;
    referenceIntent?: string;
    hasRawImageReference?: boolean;
    hasElementReference?: boolean;
    attachedScriptMarkdown?: string[];
    referenceSummaries?: string[];
  },
): Promise<{ jobId: Id<"generationJobs">; assetIds?: Id<"assets">[] }> {
  const referenceInputs = args.referenceInputs ?? [];
  try {
    await ctx.runMutation(markStageRef, { jobId: args.jobId, stage: "generating" });
    const { job, preset } = await ctx.runQuery(getJobRunContextRef, { jobId: args.jobId });
    const skipEnhancement = shouldSkipPromptEnhancement({
      skipPromptEnhancement: job.skipPromptEnhancement,
      presetSlug: preset.slug,
    });
    const enhancedPrompt = skipEnhancement
      ? job.userPrompt
      : await enhancePromptWithFallback({
          userPrompt: job.userPrompt,
          presetName: preset.name,
          presetInstructions: preset.systemInstructions,
          scriptInstructions: preset.scriptInstructions,
          negativePrompt: preset.negativePrompt,
          outputKind: job.mode === "video" ? "video_prompt" : "image_prompt",
          storytellingEnabled: preset.storytelling,
          presetSlug: preset.slug,
          referenceIntent: normalizeReferenceIntent(args.referenceIntent),
          durationSeconds: job.durationSeconds ?? args.durationSeconds,
          resolution: job.resolution ?? args.resolution,
          aspectRatio: job.aspectRatio ?? args.aspectRatio,
          hasVideoReference: referenceInputs.some((input) => input.kind === "video"),
          hasImageReference:
            referenceInputs.some((input) => input.kind === "image") ||
            Boolean(args.referenceUrls?.length),
          hasRawImageReference: args.hasRawImageReference,
          hasElementReference: args.hasElementReference,
          attachedScriptMarkdown: args.attachedScriptMarkdown,
          referenceSummaries: args.referenceSummaries,
        });
    await ctx.runMutation(setEnhancedPromptRef, {
      jobId: args.jobId,
      enhancedPrompt,
      negativePrompt: skipEnhancement ? undefined : preset.negativePrompt,
    });

    if (args.mode === "video") {
      const referenceImageUrls = referenceInputs
        .filter((input) => input.kind === "image")
        .map((input) => input.url);
      const videoPrompt = finalizeVideoPrompt(enhancedPrompt, {
        startFrameUrl: args.startFrameUrl,
        referenceImageCount: referenceImageUrls.length,
        gatewayModelId: job.resolvedModel,
        skipPromptEnhancement: job.skipPromptEnhancement,
        presetSlug: preset.slug,
      });
      const video = await generateVideo({
        prompt: videoPrompt,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        durationSeconds: args.durationSeconds,
        generateAudio: args.audioEnabled ?? false,
        modelId: job.resolvedModel,
        startFrameUrl: args.startFrameUrl,
        referenceImageUrls,
        referenceVideoUrls: referenceInputs
          .filter((input) => input.kind === "video")
          .map((input) => input.url),
        referenceAudioUrls: referenceInputs
          .filter((input) => input.kind === "audio")
          .map((input) => input.url),
      });
      await ctx.runMutation(markStageRef, { jobId: args.jobId, stage: "saving" });
      const assetId = await saveGeneratedMedia(ctx, {
        jobId: args.jobId,
        kind: "video",
        name: `generated-video-${args.jobId.slice(-6)}.${extensionForContentType(video.mediaType)}`,
        mediaType: video.mediaType,
        body: video.data,
      });
      await ctx.runMutation(completeWithOutputsRef, { jobId: args.jobId, assetIds: [assetId] });
      return { jobId: args.jobId, assetIds: [assetId] };
    }

    const imageResult = await generateImage({
      prompt: enhancedPrompt,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      referenceUrls: args.referenceUrls ?? [],
    });
    await ctx.runMutation(markStageRef, { jobId: args.jobId, stage: "saving" });
    const assetIds: Id<"assets">[] = [];
    for (const [index, image] of imageResult.images.entries()) {
      const assetId = await saveGeneratedMedia(ctx, {
        jobId: args.jobId,
        kind: "image",
        name: `generated-image-${index + 1}.${extensionForContentType(image.mediaType)}`,
        mediaType: image.mediaType,
        body: image.data,
      });
      assetIds.push(assetId);
    }
    await ctx.runMutation(completeWithOutputsRef, { jobId: args.jobId, assetIds });
    return { jobId: args.jobId, assetIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await ctx.runMutation(failJobRef, {
      jobId: args.jobId,
      error: friendlyGenerationErrorText(message, args.mode === "video" ? "video" : "image"),
    });
    throw error;
  }
}

export const runGenerationForApi = action({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    mode: v.union(v.literal("image"), v.literal("video")),
    tier: generationTier,
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    referenceUrls: v.optional(v.array(v.string())),
    referenceInputs: v.optional(v.array(referenceInputValidator)),
    startFrameUrl: v.optional(v.string()),
    skipPromptEnhancement: v.optional(v.boolean()),
    videoModel: v.optional(v.string()),
    referenceIntent: v.optional(v.string()),
    hasRawImageReference: v.optional(v.boolean()),
    hasElementReference: v.optional(v.boolean()),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    threadId: v.id("generationThreads"),
    assetIds: v.optional(v.array(v.id("assets"))),
  }),
  handler: async (ctx, args) => {
    const referenceInputs = args.referenceInputs ?? [];
    const resolvedModel = modelForRequest(args.mode, args.videoModel);
    const prepared = await ctx.runMutation(prepareApiGenerationRef, {
      userId: args.userId,
      folderId: args.folderId,
      apiKeyId: args.apiKeyId,
      mode: args.mode,
      tier: args.tier,
      resolvedModel,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      userPrompt: args.userPrompt,
      title: args.userPrompt.trim().slice(0, 64) || "API generation",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput:
        args.mode === "video"
          ? Boolean(referenceInputs.length || args.startFrameUrl)
          : Boolean(args.referenceUrls?.length),
      hasVideoReferenceInput:
        args.mode === "video" && referenceInputs.some((input) => input.kind === "video"),
      hasNonVideoReferenceInput:
        args.mode === "video" &&
        referenceInputs.some((input) => input.kind === "image" || input.kind === "audio"),
      skipPromptEnhancement: args.skipPromptEnhancement,
    });
    const executed = await executeQueuedApiJob(ctx, {
      jobId: prepared.jobId,
      mode: args.mode,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      audioEnabled: args.audioEnabled,
      referenceUrls: args.referenceUrls,
      referenceInputs,
      referenceIntent: args.referenceIntent,
      hasRawImageReference: args.hasRawImageReference,
      hasElementReference: args.hasElementReference,
    });
    return {
      jobId: prepared.jobId,
      threadId: prepared.threadId,
      assetIds: executed.assetIds,
    };
  },
});

export const runScriptForApi = action({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    referenceInputs: v.optional(v.array(referenceInputValidator)),
    skipScriptEnhancement: v.optional(v.boolean()),
    scriptType: v.optional(v.string()),
    referenceIntent: v.optional(v.string()),
    hasRawImageReference: v.optional(v.boolean()),
    hasElementReference: v.optional(v.boolean()),
  },
  returns: v.object({
    documentId: v.id("documents"),
    title: v.string(),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    documentId: Id<"documents">;
    title: string;
    creditsSpent: number;
  }> => {
    const referenceInputs = args.referenceInputs ?? [];
    const preset = await ctx.runQuery(api.stylePresets.get, {
      presetId: args.stylePresetId,
    });
    if (!preset) {
      throw new Error("Selected creative preset is not available.");
    }
    let styleSheet;
    if (args.styleSheetElementId) {
      styleSheet = await ctx.runQuery(api.elements.get, {
        elementId: args.styleSheetElementId,
      });
      if (!styleSheet || styleSheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!styleSheet.styleRules?.trim() && !styleSheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const presetInstructions =
      styleSheet && styleSheet.type === "style_sheet"
        ? styleSheetSystemInstructions({
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
          })
        : preset.systemInstructions;
    const charged = await ctx.runMutation(chargeTextForApiRef, {
      userId: args.userId,
      folderId: args.folderId,
      imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
      videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
      audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
    });
    try {
      const skipScript = args.styleSheetElementId
        ? args.skipScriptEnhancement === true
        : shouldSkipPromptEnhancement({
            skipPromptEnhancement: args.skipScriptEnhancement,
            presetSlug: preset.slug,
          });
      const contentMarkdown = skipScript
        ? args.userPrompt.trim()
        : await generateScriptWithGateway({
            userPrompt: args.userPrompt,
            presetName: styleSheet?.name ?? preset.name,
            presetInstructions,
            scriptInstructions: preset.scriptInstructions,
            scriptType: normalizeScriptType(args.scriptType),
            presetSlug: preset.slug,
            referenceIntent: normalizeReferenceIntent(args.referenceIntent),
            storytellingEnabled: preset.storytelling,
            negativePrompt: preset.negativePrompt,
            referenceInputs,
            hasRawImageReference: args.hasRawImageReference,
            hasElementReference: args.hasElementReference,
          });
      const title = scriptDocumentTitle(
        normalizeScriptType(args.scriptType),
        args.userPrompt,
        contentMarkdown,
      );
      const documentId = await ctx.runMutation(createDocumentForApiRef, {
        userId: args.userId,
        folderId: args.folderId,
        title,
        contentMarkdown,
      });
      return {
        documentId,
        title,
        creditsSpent: charged.cost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Script generation failed";
      await ctx.runMutation(refundTextForApiRef, {
        userId: args.userId,
        transactionId: charged.transactionId,
        reason: message,
      });
      throw error;
    }
  },
});

function modelForRequest(mode: "image" | "video", videoModel?: string): string {
  if (mode === "video") {
    return resolveVideoModel(videoModel).gatewayModelId;
  }
  return imageModelForRequest();
}

async function saveGeneratedMedia(
  ctx: ActionCtx,
  args: {
    jobId: Id<"generationJobs">;
    kind: "image" | "video";
    name: string;
    mediaType: string;
    body: Uint8Array;
  },
): Promise<Id<"assets">> {
  const asset: { assetId: Id<"assets">; bunnyPath: string } = await ctx.runMutation(
    createGeneratedAssetRef,
    {
      jobId: args.jobId,
      name: args.name,
      kind: args.kind,
      mimeType: args.mediaType,
    },
  );
  await putObject({
    path: asset.bunnyPath,
    body: args.body,
    contentType: args.mediaType,
  });
  return asset.assetId;
}

function internalMutationRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"mutation", "internal", Args, Return> {
  return makeFunctionReference<"mutation", Args, Return>(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Args,
    Return
  >;
}

function publicMutationRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"mutation", "public", Args, Return> {
  return makeFunctionReference<"mutation", Args, Return>(name) as unknown as FunctionReference<
    "mutation",
    "public",
    Args,
    Return
  >;
}

function internalQueryRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"query", "internal", Args, Return> {
  return makeFunctionReference<"query", Args, Return>(name) as unknown as FunctionReference<
    "query",
    "internal",
    Args,
    Return
  >;
}


function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("mp4")) return "mp4";
  return "png";
}

async function enhancePromptWithFallback(args: {
  userPrompt: string;
  presetName: string;
  presetInstructions: string;
  scriptInstructions?: string;
  negativePrompt?: string;
  outputKind: "image_prompt" | "video_prompt";
  storytellingEnabled?: boolean;
  presetSlug?: string;
  referenceIntent?: string;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  hasVideoReference?: boolean;
  hasImageReference?: boolean;
  hasRawImageReference?: boolean;
  hasElementReference?: boolean;
  attachedScriptMarkdown?: string[];
  referenceSummaries?: string[];
}): Promise<string> {
  try {
    return await enhancePrompt({
      userPrompt: args.userPrompt,
      presetName: args.presetName,
      presetInstructions: args.presetInstructions,
      scriptInstructions: args.scriptInstructions,
      negativePrompt: args.negativePrompt,
      outputKind: args.outputKind,
      storytellingEnabled: args.storytellingEnabled,
      presetSlug: args.presetSlug,
      referenceIntent: args.referenceIntent,
      durationSeconds: args.durationSeconds,
      resolution: args.resolution,
      aspectRatio: args.aspectRatio,
      hasVideoReference: args.hasVideoReference,
      hasImageReference: args.hasImageReference,
      hasRawImageReference: args.hasRawImageReference,
      hasElementReference: args.hasElementReference,
      attachedScriptMarkdown: args.attachedScriptMarkdown,
      referenceSummaries: args.referenceSummaries ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown enhancement error";
    console.warn("Prompt enhancement failed; using raw prompt with preset hints", {
      error: message,
    });
    return [
      args.presetInstructions,
      args.negativePrompt ? `Avoid: ${args.negativePrompt}` : "",
      args.userPrompt,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
