"use node";

import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { clipAtPlayhead } from "./lib/editorProjectOps";
import { clipSpeedFromEffects, isIdentitySpeed } from "./lib/naturalAudioSpeed";
import {
  convexSiteOrigin,
  enqueueFfmpegJob,
  waitForFfmpegWorkJob,
} from "./lib/ffmpegWorkerClient";

type EditorProject = {
  duration?: number;
  frameRatio: "16:9" | "9:16" | "1:1";
  tracks: Array<{
    id: string;
    kind: "video" | "audio" | "text";
    muted?: boolean;
    hidden?: boolean;
  }>;
  clips: Array<{
    id: string;
    kind: "video" | "audio" | "text" | "picture";
    assetId?: string;
    label?: string;
    trimIn: number;
    trimOut: number;
    effects?: { speed?: number };
  }>;
};

const exportResolutionValidator = v.union(
  v.literal("720p"),
  v.literal("1080p"),
  v.literal("4K"),
);
const exportKindValidator = v.union(v.literal("video"), v.literal("audio"));
const audioFormatValidator = v.union(v.literal("mp3"), v.literal("wav"), v.literal("m4a"));

async function enqueueAndWait(
  ctx: ActionCtx,
  args: {
    ownerId?: Id<"users">;
    kind: "clip-download" | "speed" | "natural-speed" | "pull-frame" | "sample-frames";
    payload: Record<string, unknown>;
  },
): Promise<unknown> {
  const { jobId } = await ctx.runMutation(internal.ffmpegWorkJobs.create, {
    ownerId: args.ownerId,
    kind: args.kind,
  });
  try {
    await enqueueFfmpegJob({
      kind: args.kind,
      convexSiteUrl: convexSiteOrigin(),
      jobId,
      ...args.payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "FFmpeg worker unavailable.";
    await ctx.runMutation(internal.ffmpegWorkJobs.fail, { jobId, error: message });
    throw error;
  }
  return await waitForFfmpegWorkJob({
    get: () => ctx.runQuery(internal.ffmpegWorkJobs.getInternal, { jobId }),
  });
}

export const exportVideo = action({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
    folderId: v.id("folders"),
    name: v.string(),
    project: v.any(),
    exportResolution: v.optional(exportResolutionValidator),
    exportKind: v.optional(exportKindValidator),
    audioFormat: v.optional(audioFormatValidator),
    jobId: v.optional(v.id("exportJobs")),
  },
  returns: v.object({
    accepted: v.literal(true),
  }),
  handler: async (ctx, args): Promise<{ accepted: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to export.");
    }
    if (!args.jobId) {
      throw new Error("Export job required.");
    }
    const owned = await ctx.runQuery(internal.exportJobs.getOwned, {
      userId,
      jobId: args.jobId,
    });
    if (!owned) throw new Error("Export job not found.");
    await enqueueFfmpegJob({
      kind: "export",
      convexSiteUrl: convexSiteOrigin(),
      userId,
      projectId: args.projectId,
      folderId: args.folderId,
      name: args.name,
      project: args.project,
      exportResolution: args.exportResolution,
      exportKind: args.exportKind,
      audioFormat: args.audioFormat,
      jobId: args.jobId,
    });
    return { accepted: true };
  },
});

export const exportVideoForApi = internalAction({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
    name: v.optional(v.string()),
    exportResolution: v.optional(exportResolutionValidator),
    exportKind: v.optional(exportKindValidator),
    audioFormat: v.optional(audioFormatValidator),
  },
  returns: v.object({
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    const row = await ctx.runQuery(internal.videoEdits.getForApi, {
      userId: args.userId,
      sandboxFolderId: args.sandboxFolderId,
      projectId: args.projectId,
    });
    if (!row) {
      throw new Error("Edit project not found.");
    }
    const exportName = args.name?.trim() || row.name;
    const { jobId } = await ctx.runMutation(internal.exportJobs.createForUser, {
      userId: args.userId,
      projectId: args.projectId,
      kind: args.exportKind === "audio" ? "audio" : "video",
    });
    await enqueueFfmpegJob({
      kind: "export",
      convexSiteUrl: convexSiteOrigin(),
      userId: args.userId,
      projectId: args.projectId,
      folderId: row.folderId,
      name: exportName,
      project: row.project,
      exportResolution: args.exportResolution,
      exportKind: args.exportKind,
      audioFormat: args.audioFormat,
      jobId,
    });
    for (let i = 0; i < 12_000; i += 1) {
      const job = await ctx.runQuery(internal.exportJobs.getInternal, { jobId });
      if (job?.status === "done" && job.resultAssetId) {
        return { assetId: job.resultAssetId };
      }
      if (job?.status === "error") {
        throw new Error(job.error || "Export failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Export timed out waiting for the ffmpeg worker.");
  },
});

export const downloadClipSegment = action({
  args: {
    assetId: v.id("assets"),
    trimIn: v.number(),
    trimOut: v.number(),
    mode: v.union(v.literal("video"), v.literal("audio")),
    filename: v.optional(v.string()),
    speed: v.optional(v.number()),
  },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
    contentType: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; filename: string; contentType: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to download.");
    }
    return (await enqueueAndWait(ctx, {
      ownerId: userId,
      kind: "clip-download",
      payload: { userId, ...args },
    })) as { url: string; filename: string; contentType: string };
  },
});

export const downloadClipSegmentForApi = internalAction({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.optional(v.id("videoEditProjects")),
    clipId: v.optional(v.string()),
    assetId: v.optional(v.id("assets")),
    trimIn: v.optional(v.number()),
    trimOut: v.optional(v.number()),
    mode: v.optional(v.union(v.literal("video"), v.literal("audio"))),
    filename: v.optional(v.string()),
    speed: v.optional(v.number()),
  },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
    contentType: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; filename: string; contentType: string }> => {
    let assetId = args.assetId;
    let trimIn = args.trimIn;
    let trimOut = args.trimOut;
    let speed = args.speed;
    let mode = args.mode ?? "video";
    let filename = args.filename;

    if (args.projectId && args.clipId) {
      const row = await ctx.runQuery(internal.videoEdits.getForApi, {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        projectId: args.projectId,
      });
      if (!row) throw new Error("Edit project not found.");
      const project = row.project as EditorProject;
      const clip = project.clips?.find((item) => item.id === args.clipId);
      if (!clip) throw new Error(`Clip not found: ${args.clipId}`);
      if (clip.kind === "text" || !clip.assetId) {
        throw new Error("Only video/audio clips can be downloaded.");
      }
      assetId = clip.assetId as Id<"assets">;
      trimIn = clip.trimIn;
      trimOut = clip.trimOut;
      speed = clip.effects?.speed;
      mode = args.mode ?? (clip.kind === "audio" ? "audio" : "video");
      filename = args.filename ?? clip.label;
    }

    if (!assetId || trimIn == null || trimOut == null) {
      throw new Error("Provide clipId (with project) or assetId + trimIn + trimOut.");
    }

    return (await enqueueAndWait(ctx, {
      ownerId: args.userId,
      kind: "clip-download",
      payload: {
        userId: args.userId,
        assetId,
        trimIn,
        trimOut,
        mode,
        filename,
        speed,
      },
    })) as { url: string; filename: string; contentType: string };
  },
});

export const processClipSpeed = action({
  args: {
    assetId: v.id("assets"),
    folderId: v.id("folders"),
    trimIn: v.number(),
    trimOut: v.number(),
    speed: v.number(),
    mode: v.union(v.literal("video"), v.literal("audio")),
    filename: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.id("assets"),
    durationSec: v.number(),
    speed: v.number(),
    kind: v.union(v.literal("video"), v.literal("audio")),
    name: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    assetId: Id<"assets">;
    durationSec: number;
    speed: number;
    kind: "video" | "audio";
    name: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to process clip speed.");
    }
    const speed = clipSpeedFromEffects({ speed: args.speed });
    if (isIdentitySpeed(speed)) {
      throw new Error("Choose a speed other than 1× before processing.");
    }
    return (await enqueueAndWait(ctx, {
      ownerId: userId,
      kind: "speed",
      payload: { userId, ...args, speed },
    })) as {
      assetId: Id<"assets">;
      durationSec: number;
      speed: number;
      kind: "video" | "audio";
      name: string;
    };
  },
});

/**
 * Bake trim+natural-speed audio for editor preview (atempo + EQ, no chipmunk).
 * Cached on Bunny by asset/trim/speed key.
 * @deprecated Prefer processClipSpeed (bake to asset). Kept for older clients.
 */
export const renderNaturalSpeedAudio = action({
  args: {
    assetId: v.id("assets"),
    trimIn: v.number(),
    trimOut: v.number(),
    speed: v.number(),
  },
  returns: v.object({
    url: v.string(),
    durationSec: v.number(),
    speed: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; durationSec: number; speed: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to process audio speed.");
    const speed = clipSpeedFromEffects({ speed: args.speed });
    if (isIdentitySpeed(speed)) {
      throw new Error("Natural speed bake is only needed when speed ≠ 1.");
    }
    return (await enqueueAndWait(ctx, {
      ownerId: userId,
      kind: "natural-speed",
      payload: { userId, ...args, speed },
    })) as { url: string; durationSec: number; speed: number };
  },
});

export const pullFrameForApi = internalAction({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
    timeSec: v.optional(v.number()),
    assetId: v.optional(v.id("assets")),
    localTimeSec: v.optional(v.number()),
  },
  returns: v.object({
    assetId: v.id("assets"),
    name: v.string(),
    folderId: v.id("folders"),
    timeSec: v.number(),
    sourceAssetId: v.id("assets"),
    url: v.string(),
    thumbnailUrl: v.string(),
    preferredViewUrl: v.string(),
    expiresUnix: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    assetId: Id<"assets">;
    name: string;
    folderId: Id<"folders">;
    timeSec: number;
    sourceAssetId: Id<"assets">;
    url: string;
    thumbnailUrl: string;
    preferredViewUrl: string;
    expiresUnix: number;
  }> => {
    const row = await ctx.runQuery(internal.videoEdits.getForApi, {
      userId: args.userId,
      sandboxFolderId: args.sandboxFolderId,
      projectId: args.projectId,
    });
    if (!row) throw new Error("Edit project not found.");

    const project = row.project as EditorProject;
    let sourceAssetId: Id<"assets">;
    let seekTime: number;
    const timelineTime = Math.max(0, args.timeSec ?? 0);

    if (args.assetId) {
      sourceAssetId = args.assetId;
      seekTime = Math.max(0, args.localTimeSec ?? args.timeSec ?? 0);
    } else {
      const hit = clipAtPlayhead(
        {
          name: row.name,
          folderId: String(row.folderId),
          duration:
            typeof (row.project as { duration?: number }).duration === "number"
              ? (row.project as { duration: number }).duration
              : 30,
          frameRatio: project.frameRatio,
          tracks: project.tracks.map((t) => ({
            id: t.id,
            kind: t.kind,
            label: t.kind === "video" ? "V1" : t.kind === "audio" ? "Audio" : "Text",
            muted: t.muted,
          })),
          clips: project.clips as unknown as Parameters<typeof clipAtPlayhead>[0]["clips"],
        },
        timelineTime,
      );
      if (!hit?.clip.assetId) {
        throw new Error("No video clip covers that playhead time. Pass assetId + localTimeSec instead.");
      }
      sourceAssetId = hit.clip.assetId as Id<"assets">;
      seekTime = Math.max(0, hit.localTime);
    }

    const timeLabel = seekTime.toFixed(2).replace(".", "s");
    const safeEdit = (row.name || "edit").replace(/[^\w.-]+/g, " ").trim().slice(0, 40) || "Edit";
    const filename = `Frame · ${safeEdit} · ${timeLabel}.jpg`;

    return (await enqueueAndWait(ctx, {
      ownerId: args.userId,
      kind: "pull-frame",
      payload: {
        userId: args.userId,
        sourceAssetId,
        sourceFolderId: row.folderId,
        seekTime,
        timeSec: args.assetId ? seekTime : timelineTime,
        filename,
      },
    })) as {
      assetId: Id<"assets">;
      name: string;
      folderId: Id<"folders">;
      timeSec: number;
      sourceAssetId: Id<"assets">;
      url: string;
      thumbnailUrl: string;
      preferredViewUrl: string;
      expiresUnix: number;
    };
  },
});

export const sampleAssetFramesForApi = internalAction({
  args: {
    userId: v.id("users"),
    assetId: v.id("assets"),
    timesSec: v.optional(v.array(v.number())),
    count: v.optional(v.number()),
    startSec: v.optional(v.number()),
    endSec: v.optional(v.number()),
  },
  returns: v.object({
    sourceAssetId: v.id("assets"),
    durationSec: v.number(),
    folderId: v.id("folders"),
    folderPath: v.string(),
    frames: v.array(
      v.object({
        timeSec: v.number(),
        assetId: v.id("assets"),
        name: v.string(),
        url: v.string(),
        thumbnailUrl: v.string(),
        preferredViewUrl: v.string(),
      }),
    ),
    expiresUnix: v.number(),
    viewHint: v.string(),
  }),
  handler: async (ctx, args) => {
    return (await enqueueAndWait(ctx, {
      ownerId: args.userId,
      kind: "sample-frames",
      payload: {
        userId: args.userId,
        assetId: args.assetId,
        timesSec: args.timesSec,
        count: args.count,
        startSec: args.startSec,
        endSec: args.endSec,
      },
    })) as {
      sourceAssetId: Id<"assets">;
      durationSec: number;
      folderId: Id<"folders">;
      folderPath: string;
      frames: Array<{
        timeSec: number;
        assetId: Id<"assets">;
        name: string;
        url: string;
        thumbnailUrl: string;
        preferredViewUrl: string;
      }>;
      expiresUnix: number;
      viewHint: string;
    };
  },
});
