import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

export const getReservedForCommit = internalQuery({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
  },
  returns: v.union(
    v.null(),
    v.object({
      bunnyPath: v.optional(v.string()),
      mimeType: v.string(),
      byteSize: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      return null;
    }
    // Already finalized — do not allow overwrite via staging commit.
    if (asset.byteSize != null && asset.byteSize > 0) {
      return null;
    }
    return {
      bunnyPath: asset.bunnyPath,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
    };
  },
});

export const finalizeCommittedUpload = internalMutation({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
    byteSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      throw new Error("Asset not found.");
    }
    await ctx.db.patch(args.assetId, {
      byteSize: args.byteSize,
      updatedAt: Date.now(),
    });
    if (asset.kind === "video") {
      await ctx.scheduler.runAfter(0, internal.assetsInternal.enqueueMediaProxy, {
        assetId: args.assetId,
      });
    }
    return null;
  },
});

export const enqueueMediaProxy = internalMutation({
  args: { assetId: v.id("assets") },
  returns: v.union(v.null(), v.id("mediaProxyJobs")),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.deletedAt || asset.kind !== "video" || !asset.bunnyPath) {
      return null;
    }
    const existing = await ctx.db
      .query("mediaProxyJobs")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .order("desc")
      .first();
    if (
      existing &&
      (existing.status === "pending" ||
        existing.status === "processing" ||
        existing.status === "ready")
    ) {
      return existing._id;
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("mediaProxyJobs", {
      assetId: asset._id,
      ownerId: asset.ownerId,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(asset._id, {
      editProxyStatus: "pending",
      editProxyError: undefined,
      editProxyUpdatedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.mediaProxyActions.execute, { jobId });
    return jobId;
  },
});

export const claimMediaProxyJob = internalMutation({
  args: { jobId: v.id("mediaProxyJobs") },
  returns: v.union(
    v.null(),
    v.object({
      assetId: v.id("assets"),
      bunnyPath: v.string(),
      ownerId: v.id("users"),
      folderId: v.id("folders"),
      attemptCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "ready") return null;
    const now = Date.now();
    if (job.status === "processing" && (job.leaseUntil ?? 0) > now) return null;
    if (job.attemptCount >= 3) return null;
    const asset = await ctx.db.get(job.assetId);
    if (!asset?.bunnyPath || asset.deletedAt || asset.kind !== "video") return null;
    const attemptCount = job.attemptCount + 1;
    await ctx.db.patch(job._id, {
      status: "processing",
      attemptCount,
      leaseUntil: now + 35 * 60_000,
      error: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(asset._id, {
      editProxyStatus: "processing",
      editProxyError: undefined,
      editProxyUpdatedAt: now,
      updatedAt: now,
    });
    return {
      assetId: asset._id,
      bunnyPath: asset.bunnyPath,
      ownerId: asset.ownerId,
      folderId: asset.folderId,
      attemptCount,
    };
  },
});

export const completeMediaProxyJob = internalMutation({
  args: {
    jobId: v.id("mediaProxyJobs"),
    proxyPath: v.string(),
    proxyByteSize: v.number(),
    proxy1080Path: v.string(),
    proxy1080ByteSize: v.number(),
    durationSeconds: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    videoCodec: v.optional(v.string()),
    videoProfile: v.optional(v.string()),
    audioCodec: v.optional(v.string()),
    proxyKeyframeIntervalSeconds: v.optional(v.number()),
    rotation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "ready",
      leaseUntil: undefined,
      error: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(job.assetId, {
      editProxyStatus: "ready",
      editProxyPath: args.proxyPath,
      editProxyByteSize: args.proxyByteSize,
      editProxy1080Path: args.proxy1080Path,
      editProxy1080ByteSize: args.proxy1080ByteSize,
      editProxyError: undefined,
      editProxyUpdatedAt: now,
      durationSeconds: args.durationSeconds,
      width: args.width,
      height: args.height,
      frameRate: args.frameRate,
      videoCodec: args.videoCodec,
      videoProfile: args.videoProfile,
      audioCodec: args.audioCodec,
      proxyKeyframeIntervalSeconds: args.proxyKeyframeIntervalSeconds,
      rotation: args.rotation,
      updatedAt: now,
    });
    return null;
  },
});

export const failMediaProxyJob = internalMutation({
  args: {
    jobId: v.id("mediaProxyJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const now = Date.now();
    const retry = job.attemptCount < 3;
    await ctx.db.patch(job._id, {
      status: retry ? "pending" : "failed",
      leaseUntil: undefined,
      error: args.error.slice(0, 1_000),
      updatedAt: now,
    });
    await ctx.db.patch(job.assetId, {
      editProxyStatus: retry ? "pending" : "failed",
      editProxyError: args.error.slice(0, 1_000),
      editProxyUpdatedAt: now,
      updatedAt: now,
    });
    if (retry) {
      const delayMs = Math.min(60_000, 2_000 * 2 ** Math.max(0, job.attemptCount - 1));
      await ctx.scheduler.runAfter(delayMs, internal.mediaProxyActions.execute, {
        jobId: job._id,
      });
    }
    return null;
  },
});

export const reclaimStaleMediaProxyJobs = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const processing = await ctx.db
      .query("mediaProxyJobs")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .take(50);
    let reclaimed = 0;
    for (const job of processing) {
      if ((job.leaseUntil ?? 0) >= now) continue;
      await ctx.db.patch(job._id, {
        status: "pending",
        leaseUntil: undefined,
        error: "Worker lease expired.",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.mediaProxyActions.execute, {
        jobId: job._id,
      });
      reclaimed += 1;
    }
    return reclaimed;
  },
});

export const abortIncompleteUpload = internalMutation({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== args.userId) {
      return null;
    }
    // Soft-delete incomplete reservations so they disappear from the explorer.
    if (asset.byteSize == null || asset.byteSize <= 0) {
      const now = Date.now();
      await ctx.db.patch(args.assetId, {
        deletedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});
