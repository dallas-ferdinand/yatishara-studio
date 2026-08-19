import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const kindValidator = v.union(
  v.literal("clip-download"),
  v.literal("speed"),
  v.literal("natural-speed"),
  v.literal("pull-frame"),
  v.literal("sample-frames"),
);

const jobReturn = v.object({
  _id: v.id("ffmpegWorkJobs"),
  status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
  error: v.optional(v.string()),
  result: v.optional(v.any()),
});

export const create = internalMutation({
  args: {
    ownerId: v.optional(v.id("users")),
    kind: kindValidator,
  },
  returns: v.object({ jobId: v.id("ffmpegWorkJobs") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const jobId = await ctx.db.insert("ffmpegWorkJobs", {
      ownerId: args.ownerId,
      kind: args.kind,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    return { jobId };
  },
});

export const getInternal = internalQuery({
  args: { jobId: v.id("ffmpegWorkJobs") },
  returns: v.union(v.null(), jobReturn),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    return {
      _id: job._id,
      status: job.status,
      error: job.error,
      result: job.result,
    };
  },
});

export const complete = internalMutation({
  args: {
    jobId: v.id("ffmpegWorkJobs"),
    result: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "done",
      result: args.result,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const fail = internalMutation({
  args: {
    jobId: v.id("ffmpegWorkJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "error",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});
