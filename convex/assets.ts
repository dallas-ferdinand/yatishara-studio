import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assetThumbnailPath,
  buildAssetPath,
  FULL_QUALITY_TRANSFORM,
  getStorageUploadCredentials,
  LQIP_TRANSFORM,
  PREVIEW_TRANSFORM,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const assetKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("document"),
);

const assetReturn = v.object({
  _id: v.id("assets"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.id("folders"),
  name: v.string(),
  kind: assetKind,
  mimeType: v.string(),
  byteSize: v.optional(v.number()),
  bunnyPath: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  thumbnailPath: v.optional(v.string()),
  sourceGenerationJobId: v.optional(v.id("generationJobs")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  signedReadUrl: v.optional(v.string()),
  signedThumbnailUrl: v.optional(v.string()),
  signedThumbnailLqipUrl: v.optional(v.string()),
});

/** List queries only sign thumbnails — full read URLs are lazy via signedReadUrl. */
async function withSignedThumbnails(
  assets: Doc<"assets">[],
  expiresUnix: number | undefined,
  quality: "thumb" | "preview" = "thumb",
) {
  if (expiresUnix === undefined) return assets;
  const paths = assets.map((asset) => assetThumbnailPath(asset));
  const thumbTransform = quality === "preview" ? PREVIEW_TRANSFORM : THUMB_TRANSFORM;
  const signFullReads = quality === "preview";
  const [signed, lqip, fullReads] = await Promise.all([
    signBunnyCdnUrls(paths, expiresUnix, thumbTransform),
    signBunnyCdnUrls(paths, expiresUnix, LQIP_TRANSFORM),
    signFullReads
      ? signBunnyCdnUrls(
          assets.map((asset) => (asset.kind === "image" ? asset.bunnyPath : undefined)),
          expiresUnix,
          FULL_QUALITY_TRANSFORM,
        )
      : Promise.resolve(new Map<string, string>()),
  ]);
  return assets.map((asset) => {
    const thumbPath = assetThumbnailPath(asset);
    return {
      ...asset,
      signedReadUrl:
        (asset.bunnyPath ? fullReads.get(asset.bunnyPath) : undefined) ?? undefined,
      signedThumbnailUrl: thumbPath ? signed.get(thumbPath) : undefined,
      signedThumbnailLqipUrl: thumbPath ? lqip.get(thumbPath) : undefined,
    };
  });
}

export const listByFolder = authedQuery({
  args: {
    folderId: v.id("folders"),
    includeDeleted: v.optional(v.boolean()),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(assetReturn),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const visibleAssets = args.includeDeleted ? assets : assets.filter((asset) => !asset.deletedAt);
    return await withSignedThumbnails(visibleAssets, args.expiresUnix);
  },
});

export const reserveUpload = authedMutation({
  args: {
    folderId: v.id("folders"),
    name: v.string(),
    kind: assetKind,
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    putUrl: v.string(),
    storageAccessKey: v.string(),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      name: args.name,
      kind: args.kind,
      mimeType: args.mimeType,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: ctx.user._id,
      folderId: args.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, ...getStorageUploadCredentials(bunnyPath) };
  },
});

export const completeUpload = authedMutation({
  args: {
    assetId: v.id("assets"),
    byteSize: v.optional(v.number()),
    thumbnailPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    await ctx.db.patch(asset._id, {
      byteSize: args.byteSize,
      thumbnailPath: args.thumbnailPath,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const signedReadUrl = authedQuery({
  args: {
    assetId: v.id("assets"),
    expiresUnix: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    if (!asset.bunnyPath) {
      throw new Error("Asset has no Bunny path");
    }
    return await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind);
  },
});

/** Resolve assets by ID regardless of folder — for element sheet/ref lookups after reorganize. */
export const listByIds = authedQuery({
  args: {
    assetIds: v.array(v.id("assets")),
    expiresUnix: v.optional(v.number()),
    quality: v.optional(v.union(v.literal("thumb"), v.literal("preview"))),
  },
  returns: v.array(assetReturn),
  handler: async (ctx, args) => {
    const uniqueIds = [...new Set(args.assetIds)];
    const results: Doc<"assets">[] = [];
    for (const assetId of uniqueIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) {
        continue;
      }
      results.push(asset);
    }
    return await withSignedThumbnails(results, args.expiresUnix, args.quality ?? "thumb");
  },
});

export const update = authedMutation({
  args: {
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    if (args.folderId !== undefined) {
      await requireFolderOwner(ctx, args.folderId);
    }
    await ctx.db.patch(asset._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const duplicate = authedMutation({
  args: {
    assetId: v.id("assets"),
    targetFolderId: v.optional(v.id("folders")),
    name: v.optional(v.string()),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    const folderId = args.targetFolderId ?? asset.folderId;
    await requireFolderOwner(ctx, folderId);
    const now = Date.now();
    return await ctx.db.insert("assets", {
      ownerId: ctx.user._id,
      folderId,
      name: args.name?.trim() || `Copy of ${asset.name}`,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      bunnyPath: asset.bunnyPath,
      bunnyStreamVideoId: asset.bunnyStreamVideoId,
      thumbnailPath: asset.thumbnailPath,
      sourceGenerationJobId: asset.sourceGenerationJobId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const moveToTrash = authedMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    await ctx.db.patch(asset._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = authedMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    await ctx.db.patch(asset._id, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listTrash = authedQuery({
  args: {
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(assetReturn),
  handler: async (ctx, args) => {
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    const visibleAssets = assets.filter((asset) => asset.deletedAt !== undefined);
    return await withSignedThumbnails(visibleAssets, args.expiresUnix);
  },
});

async function requireFolderOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  if (folder.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return folder;
}

async function requireAssetOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  assetId: Id<"assets">,
) {
  const asset = await ctx.db.get("assets", assetId);
  if (!asset) {
    throw new Error("Asset not found");
  }
  if (asset.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return asset;
}
