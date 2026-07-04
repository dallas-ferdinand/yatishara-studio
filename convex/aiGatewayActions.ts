"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  enhancePrompt,
  generateImage,
  generateVideo,
} from "./lib/aiGateway";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const enhancePromptInternal = internalAction({
  args: {
    userPrompt: v.string(),
    presetName: v.optional(v.string()),
    presetInstructions: v.string(),
    scriptInstructions: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    outputKind: v.union(v.literal("script"), v.literal("image_prompt"), v.literal("video_prompt")),
    storytellingEnabled: v.optional(v.boolean()),
    durationSeconds: v.optional(v.number()),
    resolution: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    hasVideoReference: v.optional(v.boolean()),
    hasImageReference: v.optional(v.boolean()),
    attachedScriptMarkdown: v.optional(v.array(v.string())),
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
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    referenceUrls: v.array(v.string()),
  },
  returns: v.object({
    images: v.array(
      v.object({
        data: v.bytes(),
        mediaType: v.string(),
      }),
    ),
    usageCredits: v.optional(v.number()),
  }),
  handler: async (_ctx, args) => {
    const result = await generateImage(args);
    return {
      images: result.images.map((image) => ({
        data: toArrayBuffer(image.data),
        mediaType: image.mediaType,
      })),
      usageCredits: result.usageCredits,
    };
  },
});

export const generateVideoInternal = internalAction({
  args: {
    prompt: v.string(),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    generateAudio: v.boolean(),
    startFrameUrl: v.optional(v.string()),
    referenceImageUrls: v.array(v.string()),
    referenceVideoUrls: v.array(v.string()),
    referenceAudioUrls: v.array(v.string()),
  },
  returns: v.object({
    data: v.bytes(),
    mediaType: v.string(),
  }),
  handler: async (_ctx, args) => {
    const result = await generateVideo(args);
    return {
      data: toArrayBuffer(result.data),
      mediaType: result.mediaType,
    };
  },
});
