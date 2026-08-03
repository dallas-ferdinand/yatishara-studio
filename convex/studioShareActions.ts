"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { copyObject } from "./lib/bunny";

/**
 * Server-side Bunny copy for file-share delivery and recipient Copy-to.
 */
export const copySharedMedia = internalAction({
  args: {
    destAssetId: v.id("assets"),
    destOwnerId: v.id("users"),
    sourceBunnyPath: v.string(),
    destBunnyPath: v.string(),
    mimeType: v.string(),
    sourceThumbnailPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const copied = await copyObject({
        sourcePath: args.sourceBunnyPath,
        destPath: args.destBunnyPath,
        contentType: args.mimeType,
      });
      let thumbnailPath: string | undefined;
      if (args.sourceThumbnailPath) {
        const thumbDest = `${args.destBunnyPath.replace(/\/[^/]+$/, "")}/thumb.jpg`;
        try {
          await copyObject({
            sourcePath: args.sourceThumbnailPath,
            destPath: thumbDest,
            contentType: "image/jpeg",
          });
          thumbnailPath = thumbDest;
        } catch {
          // Thumb copy is best-effort; main media still succeeds.
        }
      }
      await ctx.runMutation(internal.studioShares.finalizeSharedMediaCopy, {
        destAssetId: args.destAssetId,
        destOwnerId: args.destOwnerId,
        bunnyPath: args.destBunnyPath,
        byteSize: copied.byteSize,
        mimeType: copied.contentType,
        thumbnailPath,
      });
    } catch (error) {
      await ctx.runMutation(internal.studioShares.failSharedMediaCopy, {
        destAssetId: args.destAssetId,
        destOwnerId: args.destOwnerId,
      });
      throw error;
    }
    return null;
  },
});
