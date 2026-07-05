import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath } from "./lib/bunny";

export const getAssetForExport = internalQuery({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
  },
  returns: v.union(
    v.null(),
    v.object({
      bunnyPath: v.optional(v.string()),
      name: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      return null;
    }
    return { bunnyPath: asset.bunnyPath, name: asset.name };
  },
});

export const createExportAsset = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    name: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.ownerId !== args.userId || folder.deletedAt) {
      throw new Error("Folder not found.");
    }
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId: args.folderId,
      name: args.name,
      kind: "video",
      mimeType: "video/mp4",
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: args.userId,
      folderId: args.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const finalizeExportAsset = internalMutation({
  args: {
    assetId: v.id("assets"),
    byteSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assetId, {
      byteSize: args.byteSize,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const attachOutput = internalMutation({
  args: {
    userId: v.id("users"),
    projectId: v.id("videoEditProjects"),
    outputAssetId: v.id("assets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row || row.ownerId !== args.userId) {
      throw new Error("Edit project not found.");
    }
    await ctx.db.patch(args.projectId, {
      outputAssetId: args.outputAssetId,
      updatedAt: Date.now(),
    });
    return null;
  },
});
