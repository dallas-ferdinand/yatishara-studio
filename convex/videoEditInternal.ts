import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath } from "./lib/bunny";
import { applyStorageBytesDelta } from "./lib/storageBilling";

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
      folderId: v.id("folders"),
      kind: v.string(),
      durationSeconds: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      return null;
    }
    return {
      bunnyPath: asset.bunnyPath,
      name: asset.name,
      folderId: asset.folderId,
      kind: asset.kind,
      durationSeconds: asset.durationSeconds,
    };
  },
});

export const createExportAsset = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: v.optional(v.union(v.literal("video"), v.literal("audio"))),
    mimeType: v.optional(v.string()),
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
    const kind = args.kind ?? "video";
    const mimeType =
      args.mimeType ?? (kind === "audio" ? "audio/mpeg" : "video/mp4");
    const assetId = await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId: args.folderId,
      name: args.name,
      kind,
      mimeType,
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

/** Server-baked speed (or other derived) media registered as a normal folder asset. */
export const createDerivedMediaAsset = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: v.union(v.literal("video"), v.literal("audio")),
    mimeType: v.string(),
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
      kind: args.kind,
      mimeType: args.mimeType,
      storageStatus: "pending",
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

export const createFrameAsset = internalMutation({
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
      kind: "image",
      mimeType: "image/jpeg",
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

const PULLED_FRAMES_FOLDER_NAME = "Pulled Frames";

/**
 * Sibling of the source folder under the same parent: `…/Pulled Frames`.
 * When the source has no parent (workspace root), create/reuse a root sibling.
 */
export const ensurePulledFramesFolder = internalMutation({
  args: {
    userId: v.id("users"),
    sourceFolderId: v.id("folders"),
  },
  returns: v.object({
    folderId: v.id("folders"),
    folderPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceFolderId);
    if (!source || source.ownerId !== args.userId || source.deletedAt) {
      throw new Error("Source folder not found.");
    }
    const parentId = source.parentId;
    const siblings = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", parentId),
      )
      .collect();
    const existing = siblings.find(
      (f) => !f.deletedAt && f.name === PULLED_FRAMES_FOLDER_NAME,
    );
    if (existing) {
      const parts: string[] = [];
      let currentId: Id<"folders"> | undefined = existing._id;
      for (let guard = 0; currentId && guard < 32; guard++) {
        const folder = await ctx.db.get(currentId);
        if (!folder || folder.ownerId !== args.userId || folder.deletedAt) break;
        parts.unshift(folder.name);
        currentId = folder.parentId;
      }
      return { folderId: existing._id, folderPath: parts.join("/") || PULLED_FRAMES_FOLDER_NAME };
    }
    const now = Date.now();
    const folderId = await ctx.db.insert("folders", {
      ownerId: args.userId,
      parentId,
      name: PULLED_FRAMES_FOLDER_NAME,
      icon: "Images",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const parts: string[] = [];
    let currentId: Id<"folders"> | undefined = folderId;
    for (let guard = 0; currentId && guard < 32; guard++) {
      const folder = await ctx.db.get(currentId);
      if (!folder || folder.ownerId !== args.userId || folder.deletedAt) break;
      parts.unshift(folder.name);
      currentId = folder.parentId;
    }
    return {
      folderId,
      folderPath: parts.join("/") || PULLED_FRAMES_FOLDER_NAME,
    };
  },
});

export const finalizeExportAsset = internalMutation({
  args: {
    assetId: v.id("assets"),
    byteSize: v.number(),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    const patch: {
      byteSize: number;
      updatedAt: number;
      storageStatus: "ready";
      durationSeconds?: number;
    } = {
      byteSize: args.byteSize,
      updatedAt: Date.now(),
      storageStatus: "ready",
    };
    if (
      typeof args.durationSeconds === "number" &&
      Number.isFinite(args.durationSeconds) &&
      args.durationSeconds > 0
    ) {
      patch.durationSeconds = args.durationSeconds;
    }
    await ctx.db.patch(args.assetId, patch);
    if (asset) {
      await applyStorageBytesDelta(ctx, {
        userId: asset.ownerId,
        deltaBytes: args.byteSize - (asset.byteSize ?? 0),
        reason: `Storage added — ${asset.name}`,
      });
    }
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
