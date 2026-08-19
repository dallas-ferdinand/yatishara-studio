/**
 * Authenticated callbacks from the VPS ffmpeg worker into Convex.
 * Bearer: STUDIO_FFMPEG_WORKER_TOKEN
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseBearerToken,
  readJsonBody,
} from "./lib/studioApi/httpHelpers";

function workerAuthOk(request: Request): boolean {
  const expected = (process.env.STUDIO_FFMPEG_WORKER_TOKEN ?? "").trim();
  if (!expected) return false;
  const token = parseBearerToken(request);
  return Boolean(token && token === expected);
}

export const ffmpegWorkerCallback = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!workerAuthOk(request)) {
    return errorResponse("unauthorized", 401);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/asset")) {
      const body = await readJsonBody<{ userId: string; assetId: string }>(request);
      const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
        userId: body.userId as Id<"users">,
        assetId: body.assetId as Id<"assets">,
      });
      return jsonResponse({ ok: true, asset });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/prepare-export-asset")) {
      const body = await readJsonBody<{
        userId: string;
        folderId: string;
        name: string;
        kind?: "video" | "audio";
        mimeType?: string;
      }>(request);
      const prepared = await ctx.runMutation(internal.videoEditInternal.createExportAsset, {
        userId: body.userId as Id<"users">,
        folderId: body.folderId as Id<"folders">,
        name: body.name,
        kind: body.kind,
        mimeType: body.mimeType,
      });
      return jsonResponse({ ok: true, ...prepared });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/finalize-export-asset")) {
      const body = await readJsonBody<{
        assetId: string;
        byteSize: number;
        durationSeconds?: number;
      }>(request);
      await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
        assetId: body.assetId as Id<"assets">,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/attach-output")) {
      const body = await readJsonBody<{
        userId: string;
        projectId: string;
        outputAssetId: string;
      }>(request);
      await ctx.runMutation(internal.videoEditInternal.attachOutput, {
        userId: body.userId as Id<"users">,
        projectId: body.projectId as Id<"videoEditProjects">,
        outputAssetId: body.outputAssetId as Id<"assets">,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/job-progress")) {
      const body = await readJsonBody<{
        jobId: string;
        phase: string;
        progress: number;
      }>(request);
      const result = await ctx.runMutation(internal.exportJobs.patchProgress, {
        jobId: body.jobId as Id<"exportJobs">,
        phase: body.phase,
        progress: body.progress,
      });
      return jsonResponse({ ok: true, cancelled: result === "cancelled" });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/job-complete")) {
      const body = await readJsonBody<{ jobId: string; resultAssetId: string }>(request);
      await ctx.runMutation(internal.exportJobs.complete, {
        jobId: body.jobId as Id<"exportJobs">,
        resultAssetId: body.resultAssetId as Id<"assets">,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/job-fail")) {
      const body = await readJsonBody<{ jobId: string; error: string }>(request);
      await ctx.runMutation(internal.exportJobs.fail, {
        jobId: body.jobId as Id<"exportJobs">,
        error: body.error,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/job-reap-orphans")) {
      const body = await readJsonBody<{ error?: string }>(request);
      const failed = await ctx.runMutation(internal.exportJobs.failOrphanedRunning, {
        error:
          body.error ||
          "Export worker stopped before this job finished. Try export again.",
      });
      return jsonResponse({ ok: true, failed });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/proxy-complete")) {
      const body = await readJsonBody<{
        jobId: string;
        proxyPath: string;
        proxyByteSize: number;
        proxy1080Path?: string;
        proxy1080ByteSize?: number;
        durationSeconds?: number;
        width?: number;
        height?: number;
        frameRate?: number;
        videoCodec?: string;
        videoProfile?: string;
        audioCodec?: string;
        proxyKeyframeIntervalSeconds?: number;
        rotation?: number;
      }>(request);
      await ctx.runMutation(internal.assetsInternal.completeMediaProxyJob, {
        jobId: body.jobId as Id<"mediaProxyJobs">,
        proxyPath: body.proxyPath,
        proxyByteSize: body.proxyByteSize,
        proxy1080Path: body.proxy1080Path,
        proxy1080ByteSize: body.proxy1080ByteSize,
        durationSeconds: body.durationSeconds,
        width: body.width,
        height: body.height,
        frameRate: body.frameRate,
        videoCodec: body.videoCodec,
        videoProfile: body.videoProfile,
        audioCodec: body.audioCodec,
        proxyKeyframeIntervalSeconds: body.proxyKeyframeIntervalSeconds,
        rotation: body.rotation,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/proxy-fail")) {
      const body = await readJsonBody<{ jobId: string; error: string }>(request);
      await ctx.runMutation(internal.assetsInternal.failMediaProxyJob, {
        jobId: body.jobId as Id<"mediaProxyJobs">,
        error: body.error,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/work-complete")) {
      const body = await readJsonBody<{ jobId: string; result: unknown }>(request);
      await ctx.runMutation(internal.ffmpegWorkJobs.complete, {
        jobId: body.jobId as Id<"ffmpegWorkJobs">,
        result: body.result,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/work-fail")) {
      const body = await readJsonBody<{ jobId: string; error: string }>(request);
      await ctx.runMutation(internal.ffmpegWorkJobs.fail, {
        jobId: body.jobId as Id<"ffmpegWorkJobs">,
        error: body.error,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/create-derived-asset")) {
      const body = await readJsonBody<{
        userId: string;
        folderId: string;
        name: string;
        kind: "video" | "audio";
        mimeType: string;
      }>(request);
      const created = await ctx.runMutation(internal.videoEditInternal.createDerivedMediaAsset, {
        userId: body.userId as Id<"users">,
        folderId: body.folderId as Id<"folders">,
        name: body.name,
        kind: body.kind,
        mimeType: body.mimeType,
      });
      return jsonResponse({ ok: true, ...created });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/create-frame-asset")) {
      const body = await readJsonBody<{
        userId: string;
        folderId: string;
        name: string;
      }>(request);
      const created = await ctx.runMutation(internal.videoEditInternal.createFrameAsset, {
        userId: body.userId as Id<"users">,
        folderId: body.folderId as Id<"folders">,
        name: body.name,
      });
      return jsonResponse({ ok: true, ...created });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/ensure-pulled-frames-folder")) {
      const body = await readJsonBody<{ userId: string; sourceFolderId: string }>(request);
      const dest = await ctx.runMutation(internal.videoEditInternal.ensurePulledFramesFolder, {
        userId: body.userId as Id<"users">,
        sourceFolderId: body.sourceFolderId as Id<"folders">,
      });
      return jsonResponse({ ok: true, ...dest });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/help-preview-complete")) {
      const body = await readJsonBody<{
        previewAssetId: string;
        postId: string;
        byteSize: number;
        durationSeconds?: number;
      }>(request);
      await ctx.runMutation(internal.helpAnswerInternal.completePreviewAsset, {
        previewAssetId: body.previewAssetId as Id<"assets">,
        postId: body.postId as Id<"profilePosts">,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/ffmpeg-worker/help-preview-fail")) {
      const body = await readJsonBody<{ previewAssetId?: string; postId: string }>(request);
      await ctx.runMutation(internal.helpAnswerInternal.failPreviewAsset, {
        previewAssetId: body.previewAssetId as Id<"assets"> | undefined,
        postId: body.postId as Id<"profilePosts">,
      });
      return jsonResponse({ ok: true });
    }

    return errorResponse("not found", 404);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      500,
    );
  }
});

export const ffmpegWorkerCallbackOptions = httpAction(async () => optionsResponse());
