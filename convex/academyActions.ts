"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildAcademyCoverPath,
  buildAcademyLessonCoverPath,
  putObject,
} from "./lib/bunny";
import {
  createStreamVideo,
  getBunnyStreamConfig,
  mintStreamPlayback,
  signStreamTusUpload,
} from "./lib/bunnyStream";

const MAX_COVER_BYTES = 12 * 1024 * 1024;
const TUS_UPLOAD_TTL_SEC = 60 * 60 * 24;

async function requireAdmin(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const me = await ctx.runQuery(api.users.current, {});
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    throw new Error("Admin access required");
  }
  return userId;
}

async function mintPlaybackForVideo(videoId: string) {
  const playback = await mintStreamPlayback({
    videoId,
    ttlSec: 60 * 60,
  });
  return {
    embedUrl: playback.embedUrl,
    expiresUnix: playback.expiresUnix,
    tokenAuth: playback.tokenAuth,
  };
}

/**
 * Create a Bunny Stream video + TUS upload for the course intro (free preview).
 */
export const adminCreateStreamUpload = action({
  args: {
    courseId: v.id("academyCourses"),
    title: v.optional(v.string()),
  },
  returns: v.object({
    videoId: v.string(),
    libraryId: v.string(),
    expirationTime: v.number(),
    signature: v.string(),
    tusEndpoint: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.runQuery(api.academy.adminGetCourseInternal, {
      courseId: args.courseId,
    });
    if (!course) throw new Error("Course not found");

    const title = (
      args.title?.trim() ||
      `${course.title} intro` ||
      "Academy intro"
    ).slice(0, 200);
    const { videoId, libraryId } = await createStreamVideo({ title });
    const cfg = getBunnyStreamConfig();
    const expirationTime = Math.floor(Date.now() / 1000) + TUS_UPLOAD_TTL_SEC;
    const signature = await signStreamTusUpload({
      libraryId,
      accessKey: cfg.accessKey,
      videoId,
      expirationUnix: expirationTime,
    });

    await ctx.runMutation(api.academy.adminAttachIntroStreamVideo, {
      courseId: args.courseId,
      bunnyStreamVideoId: videoId,
    });

    return {
      videoId,
      libraryId,
      expirationTime,
      signature,
      tusEndpoint: "https://video.bunnycdn.com/tusupload",
    };
  },
});

/** Create Stream video + TUS for a lesson. */
export const adminCreateLessonStreamUpload = action({
  args: {
    lessonId: v.id("academyLessons"),
    title: v.optional(v.string()),
  },
  returns: v.object({
    videoId: v.string(),
    libraryId: v.string(),
    expirationTime: v.number(),
    signature: v.string(),
    tusEndpoint: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lesson = await ctx.runQuery(api.academy.adminGetLessonInternal, {
      lessonId: args.lessonId,
    });
    if (!lesson) throw new Error("Lesson not found");

    const title = (args.title?.trim() || lesson.title || "Academy lesson").slice(
      0,
      200,
    );
    const { videoId, libraryId } = await createStreamVideo({ title });
    const cfg = getBunnyStreamConfig();
    const expirationTime = Math.floor(Date.now() / 1000) + TUS_UPLOAD_TTL_SEC;
    const signature = await signStreamTusUpload({
      libraryId,
      accessKey: cfg.accessKey,
      videoId,
      expirationUnix: expirationTime,
    });

    await ctx.runMutation(api.academy.adminAttachLessonStreamVideo, {
      lessonId: args.lessonId,
      bunnyStreamVideoId: videoId,
    });

    return {
      videoId,
      libraryId,
      expirationTime,
      signature,
      tusEndpoint: "https://video.bunnycdn.com/tusupload",
    };
  },
});

/** Stage cover blob → Bunny Storage; patch course coverBunnyPath. */
export const adminCommitCourseCover = action({
  args: {
    courseId: v.id("academyCourses"),
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
  },
  returns: v.object({ bunnyPath: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.runQuery(api.academy.adminGetCourseInternal, {
      courseId: args.courseId,
    });
    if (!course) throw new Error("Course not found");

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Staging upload missing. Try again.");

    const byteSize = args.byteSize ?? blob.size;
    if (byteSize <= 0) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Empty file.");
    }
    if (byteSize > MAX_COVER_BYTES) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Cover exceeds the 12 MB limit.");
    }
    if (!String(args.mimeType || "").startsWith("image/")) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Cover must be an image.");
    }

    const bunnyPath = buildAcademyCoverPath({
      courseId: args.courseId,
      filename: args.filename,
    });

    try {
      const body = new Uint8Array(await blob.arrayBuffer());
      await putObject({
        path: bunnyPath,
        body,
        contentType: args.mimeType || "image/jpeg",
      });
      await ctx.runMutation(api.academy.adminSetCourseCover, {
        courseId: args.courseId,
        coverBunnyPath: bunnyPath,
      });
      return { bunnyPath };
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  },
});

export const adminCommitLessonCover = action({
  args: {
    lessonId: v.id("academyLessons"),
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
  },
  returns: v.object({ bunnyPath: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lesson = await ctx.runQuery(api.academy.adminGetLessonInternal, {
      lessonId: args.lessonId,
    });
    if (!lesson) throw new Error("Lesson not found");

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Staging upload missing. Try again.");

    const byteSize = args.byteSize ?? blob.size;
    if (byteSize <= 0) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Empty file.");
    }
    if (byteSize > MAX_COVER_BYTES) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Cover exceeds the 12 MB limit.");
    }
    if (!String(args.mimeType || "").startsWith("image/")) {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw new Error("Cover must be an image.");
    }

    const bunnyPath = buildAcademyLessonCoverPath({
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      filename: args.filename,
    });

    try {
      const body = new Uint8Array(await blob.arrayBuffer());
      await putObject({
        path: bunnyPath,
        body,
        contentType: args.mimeType || "image/jpeg",
      });
      await ctx.runMutation(api.academy.adminSetLessonCover, {
        lessonId: args.lessonId,
        coverBunnyPath: bunnyPath,
      });
      return { bunnyPath };
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  },
});

/** Free intro playback (no purchase). */
export const getIntroPlayback = action({
  args: { courseId: v.id("academyCourses") },
  returns: v.object({
    embedUrl: v.string(),
    expiresUnix: v.number(),
    tokenAuth: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    embedUrl: string;
    expiresUnix: number;
    tokenAuth: boolean;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const access = (await ctx.runQuery(api.academy.getIntroPlaybackAccess, {
      courseId: args.courseId,
    })) as
      | { allowed: true; bunnyStreamVideoId: string }
      | { allowed: false };
    if (!access.allowed) {
      throw new Error("Intro video is not available");
    }
    return mintPlaybackForVideo(access.bunnyStreamVideoId);
  },
});

/** Entitled lesson playback. */
export const getLessonPlayback = action({
  args: { lessonId: v.id("academyLessons") },
  returns: v.object({
    embedUrl: v.string(),
    expiresUnix: v.number(),
    tokenAuth: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    embedUrl: string;
    expiresUnix: number;
    tokenAuth: boolean;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const access = (await ctx.runQuery(api.academy.getLessonPlaybackAccess, {
      lessonId: args.lessonId,
    })) as
      | {
          allowed: true;
          bunnyStreamVideoId: string;
          courseId: Id<"academyCourses">;
        }
      | { allowed: false };
    if (!access.allowed) {
      throw new Error("Lesson video is not available");
    }
    return mintPlaybackForVideo(access.bunnyStreamVideoId);
  },
});

/** @deprecated Prefer getIntroPlayback. */
export const getCoursePlayback = action({
  args: {
    courseId: v.id("academyCourses"),
  },
  returns: v.object({
    embedUrl: v.string(),
    expiresUnix: v.number(),
    tokenAuth: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    embedUrl: string;
    expiresUnix: number;
    tokenAuth: boolean;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const access = (await ctx.runQuery(api.academy.getIntroPlaybackAccess, {
      courseId: args.courseId,
    })) as
      | { allowed: true; bunnyStreamVideoId: string }
      | { allowed: false };
    if (!access.allowed) {
      throw new Error("Course video is not available");
    }
    return mintPlaybackForVideo(access.bunnyStreamVideoId);
  },
});
