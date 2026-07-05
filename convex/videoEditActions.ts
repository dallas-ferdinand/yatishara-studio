"use node";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildAssetPath, putObject, signBunnyCdnUrl } from "./lib/bunny";

const execFileAsync = promisify(execFile);

type EditorClip = {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;
  trimIn: number;
  trimOut: number;
  label: string;
  kind: "video" | "audio";
};

type EditorProject = {
  tracks: Array<{ id: string; kind: "video" | "audio" }>;
  clips: EditorClip[];
};

function clipDuration(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
}

export const exportVideo = action({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
    folderId: v.id("folders"),
    name: v.string(),
    project: v.any(),
  },
  returns: v.object({
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to export.");
    }

    const project = args.project as EditorProject;
    const videoTrack = project.tracks.find((track) => track.kind === "video");
    if (!videoTrack) {
      throw new Error("No video track in project.");
    }
    const clips = project.clips
      .filter((clip) => clip.trackId === videoTrack.id)
      .sort((a, b) => a.startTime - b.startTime);
    if (!clips.length) {
      throw new Error("Add at least one video clip before exporting.");
    }

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const tempDir = await mkdtemp(join(tmpdir(), "studio-edit-"));
    const segmentPaths: string[] = [];

    try {
      for (const [index, clip] of clips.entries()) {
        const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
          userId,
          assetId: clip.assetId as Id<"assets">,
        });
        if (!asset?.bunnyPath) {
          throw new Error(`Missing media for clip "${clip.label}".`);
        }
        const url = await signBunnyCdnUrl(asset.bunnyPath, expiresUnix);
        const sourcePath = join(tempDir, `source-${index}.mp4`);
        const segmentPath = join(tempDir, `segment-${index}.mp4`);
        await downloadToFile(url, sourcePath);
        const duration = clipDuration(clip);
        await execFileAsync("ffmpeg", [
          "-y",
          "-ss",
          String(clip.trimIn),
          "-i",
          sourcePath,
          "-t",
          String(duration),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "22",
          "-pix_fmt",
          "yuv420p",
          "-an",
          segmentPath,
        ]);
        segmentPaths.push(segmentPath);
      }

      const listPath = join(tempDir, "concat.txt");
      const listBody = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
      await writeFile(listPath, listBody, "utf8");
      const outputPath = join(tempDir, "export.mp4");
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        outputPath,
      ]);

      const body = await readFile(outputPath);
      const filename = `${(args.name || "export").replace(/[^\w.-]+/g, "-").slice(0, 48)}.mp4`;
      const prepared = await ctx.runMutation(internal.videoEditInternal.createExportAsset, {
        userId,
        folderId: args.folderId,
        name: filename,
      });
      await putObject({
        path: prepared.bunnyPath,
        body,
        contentType: "video/mp4",
      });
      await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
        assetId: prepared.assetId,
        byteSize: body.byteLength,
      });
      if (args.projectId) {
        await ctx.runMutation(internal.videoEditInternal.attachOutput, {
          userId,
          projectId: args.projectId,
          outputAssetId: prepared.assetId,
        });
      }
      return { assetId: prepared.assetId };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});
