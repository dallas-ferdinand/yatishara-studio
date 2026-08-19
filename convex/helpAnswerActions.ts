"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { copyObject } from "./lib/bunny";
import { convexSiteOrigin, enqueueFfmpegJob } from "./lib/ffmpegWorkerClient";

export const cutHelpAnswerPreview = internalAction({
  args: { postId: v.id("profilePosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(
      internal.helpAnswerInternal.preparePreviewAsset,
      { postId: args.postId },
    );
    if (!prepared) return null;
    try {
      await enqueueFfmpegJob({
        kind: "help-preview",
        convexSiteUrl: convexSiteOrigin(),
        postId: prepared.postId,
        previewAssetId: prepared.previewAssetId,
        sourceBunnyPath: prepared.sourceBunnyPath,
        destBunnyPath: prepared.destBunnyPath,
        startSec: prepared.startSec,
        durationSec: prepared.durationSec,
      });
    } catch (error) {
      await ctx.runMutation(internal.helpAnswerInternal.failPreviewAsset, {
        previewAssetId: prepared.previewAssetId,
        postId: prepared.postId,
      });
      const message =
        error instanceof Error ? error.message : "Preview clip failed.";
      console.error("cutHelpAnswerPreview", message);
    }
    return null;
  },
});

export const copyUnlockMedia = internalAction({
  args: { unlockId: v.id("profileUnlocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(
      internal.helpAnswerInternal.prepareUnlockCopy,
      { unlockId: args.unlockId },
    );
    if (!prepared) return null;
    try {
      const copied = await copyObject({
        sourcePath: prepared.sourcePath,
        destPath: prepared.destPath,
      });
      await ctx.runMutation(internal.helpAnswerInternal.completeUnlockCopy, {
        unlockId: prepared.unlockId,
        buyerAssetId: prepared.buyerAssetId,
        byteSize: copied.byteSize,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unlock copy failed.";
      console.error("copyUnlockMedia", message);
    }
    return null;
  },
});
