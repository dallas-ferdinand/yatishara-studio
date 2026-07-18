"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { putObject } from "./lib/bunny";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

async function promoteStagingToBunny(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "storage">,
  args: {
    userId: Id<"users">;
    assetId: Id<"assets">;
    storageId: Id<"_storage">;
    byteSize?: number;
  },
): Promise<{ assetId: Id<"assets"> }> {
  const prepared = await ctx.runQuery(internal.assetsInternal.getReservedForCommit, {
    userId: args.userId,
    assetId: args.assetId,
  });
  if (!prepared?.bunnyPath) {
    throw new Error("Upload reservation not found.");
  }

  const blob = await ctx.storage.get(args.storageId);
  if (!blob) {
    await ctx.runMutation(internal.assetsInternal.abortIncompleteUpload, {
      userId: args.userId,
      assetId: args.assetId,
    });
    throw new Error("Staging upload missing. Try again.");
  }

  const byteSize = args.byteSize ?? blob.size;
  if (byteSize <= 0) {
    await ctx.storage.delete(args.storageId).catch(() => undefined);
    await ctx.runMutation(internal.assetsInternal.abortIncompleteUpload, {
      userId: args.userId,
      assetId: args.assetId,
    });
    throw new Error("Empty file.");
  }
  if (byteSize > MAX_UPLOAD_BYTES) {
    await ctx.storage.delete(args.storageId).catch(() => undefined);
    await ctx.runMutation(internal.assetsInternal.abortIncompleteUpload, {
      userId: args.userId,
      assetId: args.assetId,
    });
    throw new Error("File exceeds the 200 MB upload limit.");
  }

  try {
    const body = new Uint8Array(await blob.arrayBuffer());
    await putObject({
      path: prepared.bunnyPath,
      body,
      contentType: prepared.mimeType || "application/octet-stream",
    });
    await ctx.runMutation(internal.assetsInternal.finalizeCommittedUpload, {
      userId: args.userId,
      assetId: args.assetId,
      byteSize: body.byteLength,
    });
    return { assetId: args.assetId };
  } catch (error) {
    await ctx.runMutation(internal.assetsInternal.abortIncompleteUpload, {
      userId: args.userId,
      assetId: args.assetId,
    });
    throw error;
  } finally {
    await ctx.storage.delete(args.storageId).catch(() => undefined);
  }
}

/**
 * Promote a Convex-storage staging blob into Bunny for a reserved asset.
 * The zone AccessKey never leaves the Convex runtime.
 */
export const commitStagingUpload = action({
  args: {
    assetId: v.id("assets"),
    storageId: v.id("_storage"),
    byteSize: v.optional(v.number()),
  },
  returns: v.object({
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to upload.");
    }
    return await promoteStagingToBunny(ctx, {
      userId,
      assetId: args.assetId,
      storageId: args.storageId,
      byteSize: args.byteSize,
    });
  },
});

export const commitStagingUploadForUser = internalAction({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
    storageId: v.id("_storage"),
    byteSize: v.optional(v.number()),
  },
  returns: v.object({
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    return await promoteStagingToBunny(ctx, args);
  },
});
