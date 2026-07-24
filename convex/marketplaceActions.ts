"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import {
  buildSellerKycPath,
  deleteObject,
  putObject,
} from "./lib/bunny";

const MAX_KYC_BYTES = 25 * 1024 * 1024;

/**
 * Promote a staged Convex blob into Bunny for marketplace seller KYC.
 * Zone AccessKey never reaches the browser.
 */
export const commitSellerDocUpload = action({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    docKind: v.string(),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
  },
  returns: v.object({ bunnyPath: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to upload.");

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Staging upload missing. Try again.");

    const byteSize = args.byteSize ?? blob.size;
    if (byteSize <= 0) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Empty file.");
    }
    if (byteSize > MAX_KYC_BYTES) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("File exceeds the 25 MB limit for verification documents.");
    }

    const bunnyPath = buildSellerKycPath({
      userId,
      docKind: args.docKind,
      filename: args.filename,
    });

    try {
      const body = new Uint8Array(await blob.arrayBuffer());
      await putObject({
        path: bunnyPath,
        body,
        contentType: args.mimeType || "application/octet-stream",
      });
      return { bunnyPath };
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  },
});

export const deleteSellerKycPaths = internalAction({
  args: { paths: v.array(v.string()) },
  returns: v.null(),
  handler: async (_ctx, args) => {
    for (const path of args.paths) {
      if (!path.trim()) continue;
      try {
        await deleteObject(path);
      } catch {
        // Ignore missing / already deleted
      }
    }
    return null;
  },
});
