"use node";

import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { putObject } from "./lib/bunny";
import {
  createVideoTask,
  enhancePrompt,
  generateImage,
  type ImageTier,
} from "./lib/byteplus";

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

const imageTier = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

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
          generateAudio: args.audioEnabled ?? false,
          referenceImageUrls: [],
          referenceVideoUrls: [],
          referenceAudioUrls: [],
        });
        await ctx.runMutation(setVideoTaskRef, {
          jobId,
          externalTaskId: task.taskId,
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

function modelForRequest(
  mode: "image" | "video",
  tier: "low" | "medium" | "high" | "pro_video",
): string {
  if (mode === "video") {
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
