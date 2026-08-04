import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const jobReturn = v.object({
  _id: v.id("exportJobs"),
  status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
  phase: v.string(),
  progress: v.number(),
  kind: v.union(v.literal("video"), v.literal("audio")),
  error: v.optional(v.string()),
  resultAssetId: v.optional(v.id("assets")),
  updatedAt: v.number(),
});

export const create = authedMutation({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
    kind: v.union(v.literal("video"), v.literal("audio")),
  },
  returns: v.object({ jobId: v.id("exportJobs") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const jobId = await ctx.db.insert("exportJobs", {
      ownerId: ctx.user._id,
      projectId: args.projectId,
      kind: args.kind,
      status: "running",
      phase: "Starting…",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { jobId };
  },
});

export const get = authedQuery({
  args: { jobId: v.id("exportJobs") },
  returns: v.union(v.null(), jobReturn),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== ctx.user._id) return null;
    return {
      _id: job._id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      kind: job.kind,
      error: job.error,
      resultAssetId: job.resultAssetId,
      updatedAt: job.updatedAt,
    };
  },
});

export const patchProgress = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    phase: v.string(),
    progress: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return null;
    await ctx.db.patch(args.jobId, {
      phase: args.phase,
      progress: Math.max(0, Math.min(100, Math.round(args.progress))),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const complete = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    resultAssetId: v.id("assets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "done",
      phase: "Export ready",
      progress: 100,
      resultAssetId: args.resultAssetId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const fail = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "error",
      phase: "Failed",
      progress: job.progress,
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getOwned = internalQuery({
  args: {
    userId: v.id("users"),
    jobId: v.id("exportJobs"),
  },
  returns: v.union(
    v.null(),
    v.object({
      ownerId: v.id("users"),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== args.userId) return null;
    return { ownerId: job.ownerId, status: job.status };
  },
});
