import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { deleteObject } from "./lib/bunny";

/**
 * Remove an asset's objects from the Bunny storage zone after a hard delete.
 * Bytes were already released in the mutation that started the purge, so a
 * failure here leaves orphaned objects rather than an over-billed customer.
 */
export const purgeAssetObjects = internalAction({
  args: {
    assetId: v.id("assets"),
    paths: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const path of args.paths) {
      try {
        await deleteObject(path);
      } catch (error) {
        console.error("Bunny purge failed", {
          assetId: args.assetId,
          path,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    await ctx.runMutation(internal.storageBilling.clearPurgedAssetPaths, {
      assetId: args.assetId,
    });
    return null;
  },
});
