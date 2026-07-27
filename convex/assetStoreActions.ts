"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { copyObject } from "./lib/bunny";

export const copyPurchaseMedia = internalAction({
  args: {
    purchaseId: v.id("assetPurchases"),
    buyerUserId: v.id("users"),
    sourceBunnyPath: v.string(),
    destBunnyPath: v.string(),
    mimeType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const copied = await copyObject({
      sourcePath: args.sourceBunnyPath,
      destPath: args.destBunnyPath,
      contentType: args.mimeType,
    });
    await ctx.runMutation(internal.assetStore.finalizePurchaseCopyInternal, {
      purchaseId: args.purchaseId,
      buyerUserId: args.buyerUserId,
      bunnyPath: args.destBunnyPath,
      byteSize: copied.byteSize,
      mimeType: copied.contentType,
    });
    return null;
  },
});

export const copyListMedia = internalAction({
  args: {
    publicAssetId: v.id("assets"),
    sellerUserId: v.id("users"),
    sourceBunnyPath: v.string(),
    destBunnyPath: v.string(),
    mimeType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const copied = await copyObject({
      sourcePath: args.sourceBunnyPath,
      destPath: args.destBunnyPath,
      contentType: args.mimeType,
    });
    await ctx.runMutation(internal.assetStore.finalizeListCopyInternal, {
      publicAssetId: args.publicAssetId,
      sellerUserId: args.sellerUserId,
      bunnyPath: args.destBunnyPath,
      byteSize: copied.byteSize,
      mimeType: copied.contentType,
    });
    return null;
  },
});

/** Client entry: prepare → Bunny copy → finalize. */
export const purchaseListing = action({
  args: { listingId: v.id("assetListings") },
  returns: v.object({
    purchaseId: v.id("assetPurchases"),
    buyerAssetId: v.id("assets"),
    alreadyOwned: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    purchaseId: Id<"assetPurchases">;
    buyerAssetId: Id<"assets">;
    alreadyOwned: boolean;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to purchase audio.");

    const prepared = await ctx.runMutation(api.assetStore.preparePurchase, {
      listingId: args.listingId,
    });
    if (prepared.alreadyOwned) {
      return {
        purchaseId: prepared.purchaseId,
        buyerAssetId: prepared.buyerAssetId,
        alreadyOwned: true,
      };
    }
    try {
      await ctx.runAction(internal.assetStoreActions.copyPurchaseMedia, {
        purchaseId: prepared.purchaseId,
        buyerUserId: userId,
        sourceBunnyPath: prepared.sourceBunnyPath,
        destBunnyPath: prepared.destBunnyPath,
        mimeType: prepared.mimeType,
      });
      return {
        purchaseId: prepared.purchaseId,
        buyerAssetId: prepared.buyerAssetId,
        alreadyOwned: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copy failed";
      await ctx.runMutation(api.assetStore.failPurchaseCopy, {
        purchaseId: prepared.purchaseId,
        error: message,
      });
      throw error;
    }
  },
});

/**
 * List stock audio on Creative Network: Bunny-copy into seller My Public folder,
 * then commit the listing against that locked catalog source.
 */
export const listOnNetwork = action({
  args: {
    assetId: v.id("assets"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("assetListings"),
  handler: async (ctx, args): Promise<Id<"assetListings">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to list audio.");
    if (!args.title.trim()) {
      throw new Error("A display name is required to list this asset");
    }

    const prepared = await ctx.runMutation(api.assetStore.prepareListOnNetwork, {
      assetId: args.assetId,
      title: args.title.trim(),
      description: args.description,
    });

    if (!prepared.alreadyReady) {
      if (!prepared.sourceBunnyPath || !prepared.destBunnyPath) {
        throw new Error("Listing copy paths missing");
      }
      try {
        await ctx.runAction(internal.assetStoreActions.copyListMedia, {
          publicAssetId: prepared.publicAssetId,
          sellerUserId: userId,
          sourceBunnyPath: prepared.sourceBunnyPath,
          destBunnyPath: prepared.destBunnyPath,
          mimeType: prepared.mimeType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Copy failed";
        await ctx.runMutation(api.assetStore.failListCopy, {
          publicAssetId: prepared.publicAssetId,
          error: message,
        });
        throw error;
      }
    }

    return await ctx.runMutation(api.assetStore.commitListOnNetwork, {
      publicAssetId: prepared.publicAssetId,
      originalAssetId: prepared.originalAssetId,
      existingListingId: prepared.existingListingId,
      title: prepared.title,
      description: prepared.description,
      audioType: prepared.audioType,
      durationSeconds: prepared.durationSeconds,
      generateCredits: prepared.generateCredits,
      priceCredits: prepared.priceCredits,
    });
  },
});
