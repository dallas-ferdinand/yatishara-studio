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

function publicJob(job: {
  _id: import("./_generated/dataModel").Id<"exportJobs">;
  status: "running" | "done" | "error";
  phase: string;
  progress: number;
  kind: "video" | "audio";
  error?: string;
  resultAssetId?: import("./_generated/dataModel").Id<"assets">;
  updatedAt: number;
}) {
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
}

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
    return publicJob(job);
  },
});

/** Status only — progress patches must not rerender the editor shell. */
export const getStatus = authedQuery({
  args: { jobId: v.id("exportJobs") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("exportJobs"),
      status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
      error: v.optional(v.string()),
      resultAssetId: v.optional(v.id("assets")),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== ctx.user._id) return null;
    return {
      _id: job._id,
      status: job.status,
      error: job.error,
      resultAssetId: job.resultAssetId,
    };
  },
});

export const cancel = authedMutation({
  args: { jobId: v.id("exportJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== ctx.user._id) return null;
    if (job.status !== "running") return null;
    await ctx.db.patch(args.jobId, {
      status: "error",
      phase: "Cancelled",
      error: "Export cancelled.",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Worker crash leaves jobs `running`. Call after ffmpeg-worker restarts. */
export const failOrphanedRunning = internalMutation({
  args: { error: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("exportJobs").collect();
    let n = 0;
    for (const job of rows) {
      if (job.status !== "running") continue;
      await ctx.db.patch(job._id, {
        status: "error",
        phase: "Failed",
        error: args.error.slice(0, 500),
        updatedAt: Date.now(),
      });
      n += 1;
    }
    return n;
  },
});

/** In-flight export for this project so reload can restore the progress bar.
 *  Slim on purpose: progress patches must not invalidate this query's result. */
export const latestRunning = authedQuery({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("exportJobs"),
      status: v.literal("running"),
      kind: v.union(v.literal("video"), v.literal("audio")),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? ctx.db
          .query("exportJobs")
          .withIndex("by_owner_project", (q) =>
            q.eq("ownerId", ctx.user._id).eq("projectId", args.projectId),
          )
          .order("desc")
      : ctx.db
          .query("exportJobs")
          .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
          .order("desc");
    let scanned = 0;
    const staleBefore = Date.now() - 2 * 60 * 1000;
    for await (const job of rows) {
      scanned += 1;
      if (job.status === "running" && job.updatedAt >= staleBefore) {
        return { _id: job._id, status: "running" as const, kind: job.kind };
      }
      if (scanned >= 40) break;
    }
    return null;
  },
});

export const patchProgress = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    phase: v.string(),
    progress: v.number(),
  },
  returns: v.union(v.literal("ok"), v.literal("cancelled")),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return "cancelled";
    await ctx.db.patch(args.jobId, {
      phase: args.phase,
      progress: Math.max(0, Math.min(100, Math.round(args.progress))),
      updatedAt: Date.now(),
    });
    return "ok";
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
    if (!job || job.status !== "running") return null;
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

export const createForUser = internalMutation({
  args: {
    userId: v.id("users"),
    projectId: v.optional(v.id("videoEditProjects")),
    kind: v.union(v.literal("video"), v.literal("audio")),
  },
  returns: v.object({ jobId: v.id("exportJobs") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const jobId = await ctx.db.insert("exportJobs", {
      ownerId: args.userId,
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

export const getInternal = internalQuery({
  args: { jobId: v.id("exportJobs") },
  returns: v.union(v.null(), jobReturn),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
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
