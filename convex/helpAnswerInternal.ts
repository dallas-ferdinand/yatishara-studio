import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { buildAssetPath } from "./lib/bunny";
import { ensurePurchasedAssetsFolder, pickWorkspaceRootFolder } from "./folders";
import { createNotificationAndPush, resolveActorDisplayName } from "./lib/notify";
import { applyStorageBytesDelta, beginAssetPurge } from "./lib/storageBilling";

export const preparePreviewAsset = internalMutation({
  args: { postId: v.id("profilePosts") },
  returns: v.union(
    v.null(),
    v.object({
      postId: v.id("profilePosts"),
      previewAssetId: v.id("assets"),
      sourceBunnyPath: v.string(),
      destBunnyPath: v.string(),
      startSec: v.number(),
      durationSec: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.postKind !== "help_answer" || post.unpublishedAt) {
      return null;
    }
    if (post.helpAnswerPreviewAssetId) return null;
    const startMs = post.previewStartMs ?? 0;
    const endMs = post.previewEndMs ?? startMs;
    const durationSec = Math.max(0.1, (endMs - startMs) / 1000);
    const fullId = post.helpAnswerFullAssetId ?? post.assetId;
    const source = await ctx.db.get("assets", fullId);
    if (!source || !source.bunnyPath || source.deletedAt) return null;
    const folderId = source.folderId;
    const now = Date.now();
    const previewAssetId = await ctx.db.insert("assets", {
      ownerId: post.ownerId,
      folderId,
      name: `Preview · ${source.name}`.slice(0, 120),
      kind: "video",
      mimeType: "video/mp4",
      storageStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const destBunnyPath = buildAssetPath({
      userId: post.ownerId,
      folderId,
      assetId: previewAssetId,
      filename: "preview.mp4",
    });
    await ctx.db.patch(previewAssetId, { bunnyPath: destBunnyPath, updatedAt: now });
    await ctx.db.patch(post._id, {
      helpAnswerPreviewAssetId: previewAssetId,
    });
    return {
      postId: post._id,
      previewAssetId,
      sourceBunnyPath: source.bunnyPath,
      destBunnyPath,
      startSec: startMs / 1000,
      durationSec,
    };
  },
});

export const completePreviewAsset = internalMutation({
  args: {
    previewAssetId: v.id("assets"),
    postId: v.id("profilePosts"),
    byteSize: v.number(),
    durationSeconds: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.previewAssetId);
    if (!asset) return null;
    const now = Date.now();
    await ctx.db.patch(asset._id, {
      storageStatus: "ready",
      byteSize: args.byteSize,
      durationSeconds: args.durationSeconds,
      width: args.width,
      height: args.height,
      mimeType: "video/mp4",
      updatedAt: now,
    });
    if (args.byteSize > 0) {
      await applyStorageBytesDelta(ctx, {
        userId: asset.ownerId,
        deltaBytes: args.byteSize,
        reason: "Help answer preview clip",
      });
    }
    return null;
  },
});

export const failPreviewAsset = internalMutation({
  args: {
    previewAssetId: v.optional(v.id("assets")),
    postId: v.id("profilePosts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.previewAssetId) {
      const asset = await ctx.db.get("assets", args.previewAssetId);
      if (asset) {
        await ctx.db.patch(asset._id, {
          storageStatus: "failed",
          updatedAt: Date.now(),
        });
      }
    }
    const post = await ctx.db.get("profilePosts", args.postId);
    if (post && post.helpAnswerPreviewAssetId === args.previewAssetId) {
      await ctx.db.patch(post._id, { helpAnswerPreviewAssetId: undefined });
    }
    return null;
  },
});

export const prepareUnlockCopy = internalMutation({
  args: {
    unlockId: v.id("profileUnlocks"),
  },
  returns: v.union(
    v.null(),
    v.object({
      unlockId: v.id("profileUnlocks"),
      buyerAssetId: v.id("assets"),
      sourcePath: v.string(),
      destPath: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const unlock = await ctx.db.get("profileUnlocks", args.unlockId);
    if (!unlock || unlock.status !== "active") return null;
    if (unlock.buyerAssetId) {
      const existing = await ctx.db.get("assets", unlock.buyerAssetId);
      if (existing && existing.storageStatus === "ready") return null;
      if (existing?.bunnyPath) {
        const post = await ctx.db.get("profilePosts", unlock.postId);
        const fullId = post?.helpAnswerFullAssetId ?? post?.assetId;
        const source = fullId ? await ctx.db.get("assets", fullId) : null;
        if (source?.bunnyPath) {
          return {
            unlockId: unlock._id,
            buyerAssetId: existing._id,
            sourcePath: source.bunnyPath,
            destPath: existing.bunnyPath,
          };
        }
      }
    }
    const post = await ctx.db.get("profilePosts", unlock.postId);
    if (!post || post.postKind !== "help_answer") return null;
    const fullId = post.helpAnswerFullAssetId ?? post.assetId;
    const source = await ctx.db.get("assets", fullId);
    if (!source?.bunnyPath) return null;
    const topFolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", unlock.userId).eq("parentId", undefined),
      )
      .take(64);
    const rootId = pickWorkspaceRootFolder(topFolders)?._id;
    const purchasedFolderId = await ensurePurchasedAssetsFolder(
      ctx,
      unlock.userId,
      rootId,
    );
    const now = Date.now();
    const buyerAssetId = await ctx.db.insert("assets", {
      ownerId: unlock.userId,
      folderId: purchasedFolderId,
      name: source.name.slice(0, 120),
      kind: "video",
      mimeType: source.mimeType || "video/mp4",
      storageStatus: "pending",
      durationSeconds: source.durationSeconds,
      width: source.width,
      height: source.height,
      licenseKind: "purchased_help_answer",
      sourcePostId: post._id,
      createdAt: now,
      updatedAt: now,
    });
    const destPath = buildAssetPath({
      userId: unlock.userId,
      folderId: purchasedFolderId,
      assetId: buyerAssetId,
      filename: source.name || "answer.mp4",
    });
    await ctx.db.patch(buyerAssetId, { bunnyPath: destPath, updatedAt: now });
    await ctx.db.patch(unlock._id, { buyerAssetId });
    return {
      unlockId: unlock._id,
      buyerAssetId,
      sourcePath: source.bunnyPath,
      destPath,
    };
  },
});

export const completeUnlockCopy = internalMutation({
  args: {
    unlockId: v.id("profileUnlocks"),
    buyerAssetId: v.id("assets"),
    byteSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unlock = await ctx.db.get("profileUnlocks", args.unlockId);
    const asset = await ctx.db.get("assets", args.buyerAssetId);
    if (!unlock || !asset) return null;
    if (unlock.status !== "active") {
      await beginAssetPurge(ctx, asset);
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(asset._id, {
      storageStatus: "ready",
      byteSize: args.byteSize,
      updatedAt: now,
    });
    if (args.byteSize > 0) {
      await applyStorageBytesDelta(ctx, {
        userId: asset.ownerId,
        deltaBytes: args.byteSize,
        reason: "Help answer unlock copy",
      });
    }
    return null;
  },
});

export const purgeUnlockCopy = internalMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset) return null;
    if (asset.licenseKind !== "purchased_help_answer") return null;
    await beginAssetPurge(ctx, asset);
    return null;
  },
});

export const notifyUnlockIfStillActive = internalMutation({
  args: { unlockId: v.id("profileUnlocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unlock = await ctx.db.get("profileUnlocks", args.unlockId);
    if (!unlock || unlock.status !== "active" || unlock.notifiedAt) return null;
    const post = await ctx.db.get("profilePosts", unlock.postId);
    if (!post) return null;
    const actor = await resolveActorDisplayName(ctx, unlock.userId);
    await createNotificationAndPush(ctx, {
      userId: post.ownerId,
      kind: "help_answer_unlocked",
      title: actor,
      body: "unlocked your value",
      postId: post._id,
    });
    await ctx.db.patch(unlock._id, { notifiedAt: Date.now() });
    return null;
  },
});
