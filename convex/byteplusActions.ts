"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  createVideoTask,
  enhancePrompt,
  generateImage,
} from "./lib/byteplus";

export const enhancePromptInternal = internalAction({
  args: {
    userPrompt: v.string(),
    presetInstructions: v.string(),
    negativePrompt: v.optional(v.string()),
    referenceSummaries: v.array(v.string()),
    modelId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return await enhancePrompt(args);
  },
});

export const generateImageInternal = internalAction({
  args: {
    prompt: v.string(),
    tier: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    referenceUrls: v.array(v.string()),
  },
  returns: v.object({
    urls: v.array(v.string()),
    usageCredits: v.optional(v.number()),
  }),
  handler: async (_ctx, args) => {
    return await generateImage(args);
  },
});

export const createVideoTaskInternal = internalAction({
  args: {
    prompt: v.string(),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    generateAudio: v.boolean(),
    referenceImageUrls: v.array(v.string()),
    referenceVideoUrls: v.array(v.string()),
    referenceAudioUrls: v.array(v.string()),
  },
  returns: v.object({
    taskId: v.string(),
  }),
  handler: async (_ctx, args) => {
    return await createVideoTask(args);
  },
});
