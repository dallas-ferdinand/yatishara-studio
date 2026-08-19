"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { convexSiteOrigin, enqueueFfmpegJob } from "./lib/ffmpegWorkerClient";

export const execute = internalAction({
  args: { jobId: v.id("mediaProxyJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.assetsInternal.claimMediaProxyJob, {
      jobId: args.jobId,
    });
    if (!claimed) return null;
    try {
      await enqueueFfmpegJob({
        kind: "proxy",
        convexSiteUrl: convexSiteOrigin(),
        jobId: args.jobId,
        bunnyPath: claimed.bunnyPath,
        mediaKind: claimed.kind,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "FFmpeg worker unavailable.";
      await ctx.runMutation(internal.assetsInternal.failMediaProxyJob, {
        jobId: args.jobId,
        error: message,
      });
    }
    return null;
  },
});
