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
