import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assetThumbnailPath,
  buildAssetPath,
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
  storageStatus: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("failed"),
    ),
  ),
  bunnyPath: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  thumbnailPath: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  frameRate: v.optional(v.number()),
  videoCodec: v.optional(v.string()),
  videoProfile: v.optional(v.string()),
  audioCodec: v.optional(v.string()),
  proxyKeyframeIntervalSeconds: v.optional(v.number()),
  rotation: v.optional(v.number()),
  editProxyStatus: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
  ),
  editProxyPath: v.optional(v.string()),
  editProxyByteSize: v.optional(v.number()),
  editProxy1080Path: v.optional(v.string()),
  editProxy1080ByteSize: v.optional(v.number()),
  editProxyError: v.optional(v.string()),
  editProxyUpdatedAt: v.optional(v.number()),
  sourceGenerationJobId: v.optional(v.id("generationJobs")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  signedReadUrl: v.optional(v.string()),
  signedEditProxyUrl: v.optional(v.string()),
  signedEditProxy1080Url: v.optional(v.string()),
  signedThumbnailUrl: v.optional(v.string()),
  signedThumbnailLqipUrl: v.optional(v.string()),
});

/** List queries only sign thumbnails — full read URLs are lazy via signedReadUrl.
 * Videos/audio without a poster still need a signed media URL for grid <video> thumbs. */
async function withSignedThumbnails(
  assets: Doc<"assets">[],
  expiresUnix: number | undefined,
  quality: "thumb" | "preview" = "thumb",
) {
  if (expiresUnix === undefined) return assets;
  const paths = assets.map((asset) => assetThumbnailPath(asset));
  const thumbTransform = quality === "preview" ? PREVIEW_TRANSFORM : THUMB_TRANSFORM;
  const needsMediaRead = (asset: Doc<"assets">) =>
    quality === "preview" ||
    ((asset.kind === "video" || asset.kind === "audio") && !assetThumbnailPath(asset));
  const [signed, lqip, proxyUrls, proxy1080Urls, fullReadEntries] = await Promise.all([
    signBunnyCdnUrls(paths, expiresUnix, thumbTransform),
    signBunnyCdnUrls(paths, expiresUnix, LQIP_TRANSFORM),
    signBunnyCdnUrls(
      assets.map((asset) =>
        asset.editProxyStatus === "ready" ? asset.editProxyPath : undefined,
      ),
      expiresUnix,
    ),
    signBunnyCdnUrls(
      assets.map((asset) =>
        asset.editProxyStatus === "ready" ? asset.editProxy1080Path : undefined,
      ),
      expiresUnix,
    ),
    Promise.all(
      assets.map(async (asset) => {
        if (!asset.bunnyPath || !needsMediaRead(asset)) return null;
        const url = await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind);
        return [asset.bunnyPath, url] as const;
      }),
    ),
  ]);
  const fullReads = new Map(
    fullReadEntries.filter((entry): entry is readonly [string, string] => entry !== null),
  );
  return assets.map((asset) => {
    const thumbPath = assetThumbnailPath(asset);
    return {
      ...asset,
      signedReadUrl:
        (asset.bunnyPath ? fullReads.get(asset.bunnyPath) : undefined) ?? undefined,
      signedEditProxyUrl:
        asset.editProxyStatus === "ready" && asset.editProxyPath
          ? proxyUrls.get(asset.editProxyPath)
          : undefined,
      signedEditProxy1080Url:
        asset.editProxyStatus === "ready" && asset.editProxy1080Path
          ? proxy1080Urls.get(asset.editProxy1080Path)
          : undefined,
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
    quality: v.optional(v.union(v.literal("thumb"), v.literal("preview"))),
  },
  returns: v.array(assetReturn),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const storageReady = (asset: Doc<"assets">) =>
      asset.storageStatus === undefined || asset.storageStatus === "ready";
    const visibleAssets = args.includeDeleted
      ? assets.filter(storageReady)
      : assets.filter((asset) => !asset.deletedAt && storageReady(asset));
    return await withSignedThumbnails(visibleAssets, args.expiresUnix, args.quality ?? "thumb");
  },
});

/**
 * Reserve an asset row and return a short-lived Convex staging upload URL.
 * Bytes go to Convex storage; `assetActions.commitStagingUpload` copies them
 * into Bunny with the server-side AccessKey (never sent to browsers).
 */
export const reserveUpload = authedMutation({
  args: {
    folderId: v.id("folders"),
    name: v.string(),
    kind: assetKind,
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    uploadUrl: v.string(),
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
      // Hide from explorer until Bunny put + finalize — otherwise thumbs 404 blank.
      storageStatus: "pending",
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
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { assetId, uploadUrl, bunnyPath };
  },
});

/** @deprecated Prefer assetActions.commitStagingUpload after staging POST. */
export const completeUpload = authedMutation({
  args: {
    assetId: v.id("assets"),
    byteSize: v.optional(v.number()),
    thumbnailPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    if (!asset.bunnyPath) {
      throw new Error("Asset has no Bunny path");
    }
    // Guard: do not mark complete without a prior server-side Bunny put.
    // Staging uploads must call commitStagingUpload, which finalizes byteSize.
    if (args.byteSize != null && (asset.byteSize == null || asset.byteSize <= 0)) {
      throw new Error("Upload is not finalized. Use the staging commit flow.");
    }
    await ctx.db.patch(asset._id, {
      ...(args.thumbnailPath !== undefined ? { thumbnailPath: args.thumbnailPath } : {}),
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

/** Idempotently request an edit-friendly proxy for an existing video or audio asset. */
export const ensureEditProxy = authedMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await requireAssetOwner(ctx, args.assetId);
    if (
      (asset.kind !== "video" && asset.kind !== "audio") ||
      asset.editProxyStatus === "ready"
    ) {
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.assetsInternal.enqueueMediaProxy, {
      assetId: asset._id,
    });
    return null;
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
      if (
        !asset ||
        asset.ownerId !== ctx.user._id ||
        asset.deletedAt ||
        (asset.storageStatus !== undefined && asset.storageStatus !== "ready")
      ) {
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
      storageStatus: asset.storageStatus,
      bunnyPath: asset.bunnyPath,
      bunnyStreamVideoId: asset.bunnyStreamVideoId,
      thumbnailPath: asset.thumbnailPath,
      durationSeconds: asset.durationSeconds,
      width: asset.width,
      height: asset.height,
      frameRate: asset.frameRate,
      videoCodec: asset.videoCodec,
      videoProfile: asset.videoProfile,
      audioCodec: asset.audioCodec,
      proxyKeyframeIntervalSeconds: asset.proxyKeyframeIntervalSeconds,
      rotation: asset.rotation,
      editProxyStatus: asset.editProxyStatus,
      editProxyPath: asset.editProxyPath,
      editProxyByteSize: asset.editProxyByteSize,
      editProxy1080Path: asset.editProxy1080Path,
      editProxy1080ByteSize: asset.editProxy1080ByteSize,
      editProxyError: asset.editProxyError,
      editProxyUpdatedAt: asset.editProxyUpdatedAt,
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
    const now = Date.now();
    await ctx.db.patch(asset._id, {
      deletedAt: now,
      updatedAt: now,
    });
    const post = await ctx.db
      .query("profilePosts")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .unique();
    if (post && !post.unpublishedAt && post.ownerId === ctx.user._id) {
      await ctx.db.patch(post._id, { unpublishedAt: now });
      const profile = await ctx.db.get("profiles", post.profileId);
      if (profile) {
        await ctx.db.patch(profile._id, {
          postCount: Math.max(0, profile.postCount - 1),
          updatedAt: now,
        });
      }
    }
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
