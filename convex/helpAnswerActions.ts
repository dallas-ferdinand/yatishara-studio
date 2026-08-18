"use node";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { copyObject, putObject, signBunnyCdnUrl } from "./lib/bunny";

const execFileAsync = promisify(execFile);

async function downloadToFile(url: string, path: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Preview source download failed (${response.status}).`);
  }
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(path),
  );
}

export const cutHelpAnswerPreview = internalAction({
  args: { postId: v.id("profilePosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(
      internal.helpAnswerInternal.preparePreviewAsset,
      { postId: args.postId },
    );
    if (!prepared) return null;
    const workDir = await mkdtemp(join(tmpdir(), "yatishara-help-preview-"));
    const sourcePath = join(workDir, "source");
    const outputPath = join(workDir, "preview.mp4");
    try {
      const expires = Math.floor(Date.now() / 1000) + 30 * 60;
      const sourceUrl = await signBunnyCdnUrl(prepared.sourceBunnyPath, expires);
      await downloadToFile(sourceUrl, sourcePath);
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(prepared.startSec),
          "-i",
          sourcePath,
          "-t",
          String(prepared.durationSec),
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 15 * 60_000 },
      );
      const bytes = new Uint8Array(await readFile(outputPath));
      await putObject({
        path: prepared.destBunnyPath,
        body: bytes,
        contentType: "video/mp4",
      });
      await ctx.runMutation(internal.helpAnswerInternal.completePreviewAsset, {
        previewAssetId: prepared.previewAssetId,
        postId: prepared.postId,
        byteSize: bytes.byteLength,
        durationSeconds: prepared.durationSec,
      });
    } catch (error) {
      await ctx.runMutation(internal.helpAnswerInternal.failPreviewAsset, {
        previewAssetId: prepared.previewAssetId,
        postId: prepared.postId,
      });
      const message =
        error instanceof Error ? error.message : "Preview clip failed.";
      console.error("cutHelpAnswerPreview", message);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
    return null;
  },
});

export const copyUnlockMedia = internalAction({
  args: { unlockId: v.id("profileUnlocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(
      internal.helpAnswerInternal.prepareUnlockCopy,
      { unlockId: args.unlockId },
    );
    if (!prepared) return null;
    try {
      const copied = await copyObject({
        sourcePath: prepared.sourcePath,
        destPath: prepared.destPath,
      });
      await ctx.runMutation(internal.helpAnswerInternal.completeUnlockCopy, {
        unlockId: prepared.unlockId,
        buyerAssetId: prepared.buyerAssetId,
        byteSize: copied.byteSize,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unlock copy failed.";
      console.error("copyUnlockMedia", message);
    }
    return null;
  },
});
