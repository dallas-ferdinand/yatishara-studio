"use node";

import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { putObject } from "./lib/bunny";
import {
  createVideoTask,
  enhancePrompt,
  generateImage,
  generateScript as generateScriptWithBytePlus,
  retrieveVideoTask,
  type ImageTier,
} from "./lib/byteplus";

const VIDEO_POLL_INITIAL_DELAY_MS = 12_000;
const VIDEO_POLL_LATER_DELAY_MS = 30_000;
const VIDEO_POLL_FAST_ATTEMPTS = 10;
const VIDEO_POLL_MAX_ATTEMPTS = 40;

const createQueuedJobRef = makeFunctionReference<
  "mutation",
  {
    threadId: Id<"generationThreads">;
    mode: "image" | "video";
    tier: "low" | "medium" | "high" | "pro_video";
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
      tier: "low" | "medium" | "high" | "pro_video";
    };
    preset: {
      systemInstructions: string;
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

const setVideoTaskRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    externalTaskId: string;
  },
  null
>("generation:setVideoTask");

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

const pollVideoTaskRef = internalActionRef<
  {
    jobId: Id<"generationJobs">;
    taskId: string;
    attempt: number;
  },
  null
>("generationActions:pollVideoTask");

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

const imageTier = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const generateScript = action({
  args: {
    folderId: v.id("folders"),
    userPrompt: v.string(),
    referenceInputs: v.optional(v.array(v.object({
      kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
      url: v.string(),
    }))),
  },
  returns: v.object({
    documentId: v.id("documents"),
  }),
  handler: async (ctx, args): Promise<{ documentId: Id<"documents"> }> => {
    const referenceInputs = args.referenceInputs ?? [];
    const transactionId = await ctx.runMutation(chargeTextGenerationRef, {
      folderId: args.folderId,
      imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
      videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
      audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
    });
    try {
      const contentMarkdown = await generateScriptWithBytePlus({
        userPrompt: args.userPrompt,
        referenceInputs,
      });
      const documentId = await ctx.runMutation(createDocumentRef, {
        folderId: args.folderId,
        title: scriptTitle(args.userPrompt, contentMarkdown),
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
    tier: v.union(imageTier, v.literal("pro_video")),
    stylePresetId: v.id("stylePresets"),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    referenceUrls: v.optional(v.array(v.string())),
    referenceInputs: v.optional(v.array(v.object({
      kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
      url: v.string(),
    }))),
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
    const resolvedModel = modelForRequest(args.mode, args.tier);
    const referenceInputs = args.referenceInputs ?? [];
    const effectiveReferenceInputs =
      args.mode === "video" && isSeedance1Model(resolvedModel) ? [] : referenceInputs;
    const effectiveAudioEnabled =
      args.mode === "video" && isSeedance1Model(resolvedModel) ? false : args.audioEnabled;
    const jobId = await ctx.runMutation(createQueuedJobRef, {
      threadId: args.threadId,
      mode: args.mode,
      tier: args.tier,
      resolvedModel,
      stylePresetId: args.stylePresetId,
      userPrompt: args.userPrompt,
      audioEnabled: effectiveAudioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: Boolean(effectiveReferenceInputs.length),
      hasVideoReferenceInput: effectiveReferenceInputs.some((input) => input.kind === "video"),
      hasNonVideoReferenceInput: effectiveReferenceInputs.some((input) => input.kind === "image" || input.kind === "audio"),
    });

    try {
      await ctx.runMutation(markStageRef, {
        jobId,
        stage: "generating",
      });
      const { job, preset } = await ctx.runQuery(getJobRunContextRef, {
        jobId,
      });
      const enhancedPrompt = await enhancePromptWithFallback({
        userPrompt: job.userPrompt,
        presetInstructions: preset.systemInstructions,
        negativePrompt: preset.negativePrompt,
      });
      await ctx.runMutation(setEnhancedPromptRef, {
        jobId,
        enhancedPrompt,
        negativePrompt: preset.negativePrompt,
      });

      if (args.mode === "video") {
        const task = await createVideoTask({
          prompt: enhancedPrompt,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          durationSeconds: args.durationSeconds,
          generateAudio: effectiveAudioEnabled ?? false,
          referenceImageUrls: effectiveReferenceInputs
            .filter((input) => input.kind === "image")
            .map((input) => input.url),
          referenceVideoUrls: effectiveReferenceInputs
            .filter((input) => input.kind === "video")
            .map((input) => input.url),
          referenceAudioUrls: effectiveReferenceInputs
            .filter((input) => input.kind === "audio")
            .map((input) => input.url),
        });
        await ctx.runMutation(setVideoTaskRef, {
          jobId,
          externalTaskId: task.taskId,
        });
        await ctx.scheduler.runAfter(VIDEO_POLL_INITIAL_DELAY_MS, pollVideoTaskRef, {
          jobId,
          taskId: task.taskId,
          attempt: 1,
        });
        return { jobId, externalTaskId: task.taskId };
      }

      const imageResult = await generateImage({
        prompt: enhancedPrompt,
        tier: args.tier as ImageTier,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        referenceUrls: args.referenceUrls ?? [],
      });
      await ctx.runMutation(markStageRef, {
        jobId,
        stage: "saving",
      });
      const assetIds: Id<"assets">[] = [];
      for (const [index, url] of imageResult.urls.entries()) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Generated image fetch failed (${response.status})`);
        }
        const contentType = response.headers.get("content-type") ?? "image/png";
        const body = await response.arrayBuffer();
        const name = `generated-image-${index + 1}.${extensionForContentType(contentType)}`;
        const asset: { assetId: Id<"assets">; bunnyPath: string } =
          await ctx.runMutation(createGeneratedAssetRef, {
          jobId,
          name,
          kind: "image",
          mimeType: contentType,
        });
        await putObject({
          path: asset.bunnyPath,
          body,
          contentType,
        });
        assetIds.push(asset.assetId);
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
        error: message,
      });
      throw error;
    }
  },
});

export const pollVideoTask = internalAction({
  args: {
    jobId: v.id("generationJobs"),
    taskId: v.string(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const task = await retrieveVideoTask(args.taskId);
      const status = task.status.toLowerCase();
      if (status === "succeeded" || status === "success" || status === "completed") {
        if (!task.videoUrl) {
          await ctx.runMutation(failJobRef, {
            jobId: args.jobId,
            error: "BytePlus video task completed but no video URL was returned.",
          });
          return null;
        }
        const response = await fetch(task.videoUrl);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`Video download failed (${response.status}): ${text.slice(0, 300)}`);
        }
        const contentType = response.headers.get("content-type") ?? "video/mp4";
        const asset = await ctx.runMutation(createGeneratedAssetRef, {
          jobId: args.jobId,
          name: `generated-video-${args.jobId.slice(-6)}.mp4`,
          kind: "video",
          mimeType: contentType,
        });
        await putObject({
          path: asset.bunnyPath,
          body: await response.arrayBuffer(),
          contentType,
        });
        await ctx.runMutation(completeWithOutputsRef, {
          jobId: args.jobId,
          assetIds: [asset.assetId],
        });
        return null;
      }
      if (status === "failed" || status === "cancelled" || status === "canceled") {
        await ctx.runMutation(failJobRef, {
          jobId: args.jobId,
          error: task.error ?? `BytePlus video task ${status}.`,
        });
        return null;
      }
      if (args.attempt >= VIDEO_POLL_MAX_ATTEMPTS) {
        await ctx.runMutation(failJobRef, {
          jobId: args.jobId,
          error: "BytePlus video task timed out before Studio received a completed MP4.",
        });
        return null;
      }
      await ctx.scheduler.runAfter(
        args.attempt < VIDEO_POLL_FAST_ATTEMPTS
          ? VIDEO_POLL_INITIAL_DELAY_MS
          : VIDEO_POLL_LATER_DELAY_MS,
        pollVideoTaskRef,
        {
          jobId: args.jobId,
          taskId: args.taskId,
          attempt: args.attempt + 1,
        },
      );
      return null;
    } catch (error) {
      if (args.attempt >= VIDEO_POLL_MAX_ATTEMPTS) {
        await ctx.runMutation(failJobRef, {
          jobId: args.jobId,
          error: error instanceof Error ? error.message : "BytePlus video polling failed.",
        });
        return null;
      }
      await ctx.scheduler.runAfter(VIDEO_POLL_LATER_DELAY_MS, pollVideoTaskRef, {
        jobId: args.jobId,
        taskId: args.taskId,
        attempt: args.attempt + 1,
      });
      return null;
    }
  },
});

function modelForRequest(
  mode: "image" | "video",
  tier: "low" | "medium" | "high" | "pro_video",
): string {
  if (mode === "video") {
    if (process.env.BYTEPLUS_DEV_MODE === "true") {
      return process.env.BYTEPLUS_VIDEO_DEV_MODEL_ID ?? requiredEnv("BYTEPLUS_VIDEO_MODEL_ID");
    }
    return requiredEnv("BYTEPLUS_VIDEO_MODEL_ID");
  }
  if (tier === "low") {
    return requiredEnv("BYTEPLUS_IMAGE_LOW_MODEL_ID");
  }
  if (tier === "medium") {
    return requiredEnv("BYTEPLUS_IMAGE_MEDIUM_MODEL_ID");
  }
  return requiredEnv("BYTEPLUS_IMAGE_HIGH_MODEL_ID");
}

function isSeedance1Model(model: string): boolean {
  return model.includes("seedance-1-");
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

function internalActionRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"action", "internal", Args, Return> {
  return makeFunctionReference<"action", Args, Return>(name) as unknown as FunctionReference<
    "action",
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

function scriptTitle(userPrompt: string, contentMarkdown: string): string {
  const markdownTitle = contentMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  const title = markdownTitle?.replace(/^#\s+/, "").trim() || userPrompt.trim();
  return (title || "Generated script").slice(0, 60);
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
  return "png";
}

async function enhancePromptWithFallback(args: {
  userPrompt: string;
  presetInstructions: string;
  negativePrompt?: string;
}): Promise<string> {
  try {
    return await enhancePrompt({
      userPrompt: args.userPrompt,
      presetInstructions: args.presetInstructions,
      negativePrompt: args.negativePrompt,
      referenceSummaries: [],
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
