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
import { putObject, signBunnyCdnUrl } from "./lib/bunny";

const execFileAsync = promisify(execFile);

type ClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
};

type TextClipContent = {
  text?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
};

type EditorClip = {
  id: string;
  assetId?: string;
  trackId: string;
  startTime: number;
  trimIn: number;
  trimOut: number;
  label: string;
  kind: "video" | "audio" | "text";
  effects?: ClipEffects;
  transitionOut?: { type: string; duration: number };
  text?: TextClipContent;
};

type EditorProject = {
  tracks: Array<{ id: string; kind: "video" | "audio" | "text"; muted?: boolean }>;
  clips: EditorClip[];
};

function clipDuration(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
}

function hexToFfmpegColor(hex?: string): string {
  const raw = (hex ?? "#ffffff").replace("#", "");
  if (raw.length === 6) return `0x${raw}`;
  return "white";
}

function xfadeTransition(type: string): string {
  if (type === "dipToBlack") return "fadeblack";
  if (type === "wipeLeft") return "wipeleft";
  return "fade";
}

function buildSegmentVideoFilters(clip: EditorClip, duration: number, textClips: EditorClip[]): string {
  const parts: string[] = [];
  const fadeIn = Math.max(0, clip.effects?.fadeIn ?? 0);
  const fadeOut = Math.max(0, clip.effects?.fadeOut ?? 0);
  if (fadeIn > 0) parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0) {
    parts.push(`fade=t=out:st=${Math.max(0, duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + duration;
  for (const textClip of textClips) {
    const text = textClip.text?.text?.trim();
    if (!text) continue;
    const textStart = textClip.startTime;
    const textEnd = textClip.startTime + clipDuration(textClip);
    if (textEnd <= clipStart || textStart >= clipEnd) continue;

    const localStart = Math.max(0, textStart - clipStart);
    const localEnd = Math.min(duration, textEnd - clipStart);
    const fontSize = textClip.text?.fontSize ?? 42;
    const color = hexToFfmpegColor(textClip.text?.color);
    const align = textClip.text?.align ?? "center";
    const x =
      align === "left" ? "w*0.08" : align === "right" ? "w*0.92-text_w" : "(w-text_w)/2";
    parts.push(
      `drawtext=text='${escapeDrawtext(text)}':fontsize=${fontSize}:fontcolor=${color}:x=${x}:y=h*0.82:enable='between(t\\,${localStart.toFixed(3)}\\,${localEnd.toFixed(3)})'`,
    );
  }

  return parts.length ? parts.join(",") : "null";
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
}

async function concatWithTransitions(segmentPaths: string[], clips: EditorClip[], tempDir: string): Promise<string> {
  const outputPath = join(tempDir, "video-composed.mp4");
  const hasTransition = clips.some(
    (clip, index) => index < clips.length - 1 && clip.transitionOut?.type && clip.transitionOut.type !== "none",
  );

  if (!hasTransition || segmentPaths.length < 2) {
    const listPath = join(tempDir, "concat.txt");
    const listBody = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listBody, "utf8");
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
    return outputPath;
  }

  const durations: number[] = [];
  for (const path of segmentPaths) {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    durations.push(Number(stdout.trim()) || clipDuration(clips[durations.length]!));
  }

  const inputs = segmentPaths.flatMap((path) => ["-i", path]);
  let filter = "";
  let lastLabel = "[0:v]";
  let offset = durations[0]!;

  for (let i = 1; i < segmentPaths.length; i++) {
    const prevClip = clips[i - 1]!;
    const transition = prevClip.transitionOut;
    const duration = Math.min(transition?.duration ?? 0.5, durations[i - 1]! * 0.45, durations[i]! * 0.45);
    const outLabel = i === segmentPaths.length - 1 ? "[outv]" : `[v${i}]`;
    if (transition?.type && transition.type !== "none" && duration > 0.05) {
      const transitionName = xfadeTransition(transition.type);
      filter += `${lastLabel}[${i}:v]xfade=transition=${transitionName}:duration=${duration.toFixed(3)}:offset=${(offset - duration).toFixed(3)}${outLabel};`;
      offset = offset - duration + durations[i]!;
    } else {
      filter += `${lastLabel}[${i}:v]concat=n=2:v=1:a=0${outLabel};`;
      offset += durations[i]!;
    }
    lastLabel = outLabel;
  }

  filter = filter.replace(/;$/, "");
  await execFileAsync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", outputPath]);
  return outputPath;
}

async function mixAudioTrack(args: {
  videoPath: string;
  audioClips: EditorClip[];
  getAssetBunnyPath: (assetId: Id<"assets">) => Promise<string | null>;
  expiresUnix: number;
  tempDir: string;
}): Promise<string> {
  const { videoPath, audioClips, getAssetBunnyPath, expiresUnix, tempDir } = args;
  if (!audioClips.length) return videoPath;

  const outputPath = join(tempDir, "export-with-audio.mp4");
  const audioInputs: string[] = ["-i", videoPath];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];
  let inputIndex = 1;

  for (const [index, clip] of audioClips.entries()) {
    if (!clip.assetId) continue;
    const bunnyPath = await getAssetBunnyPath(clip.assetId as Id<"assets">);
    if (!bunnyPath) continue;
    const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
    const sourcePath = join(tempDir, `audio-source-${index}.mp3`);
    await downloadToFile(url, sourcePath);
    audioInputs.push("-i", sourcePath);
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const duration = clipDuration(clip);
    const volume = clip.effects?.volume ?? 1;
    const fadeIn = clip.effects?.fadeIn ?? 0;
    const fadeOut = clip.effects?.fadeOut ?? 0;
    let chain = `[${inputIndex}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS`;
    if (fadeIn > 0) chain += `,afade=t=in:st=0:d=${fadeIn}`;
    if (fadeOut > 0) chain += `,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`;
    if (volume !== 1) chain += `,volume=${volume}`;
    chain += `,adelay=${delayMs}|${delayMs}[a${index}]`;
    filterParts.push(chain);
    mixLabels.push(`[a${index}]`);
    inputIndex += 1;
  }

  if (filterParts.length === 0) return videoPath;

  const filter = `${filterParts.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0[aout]`;
  await execFileAsync("ffmpeg", [
    "-y",
    ...audioInputs,
    "-filter_complex",
    filter,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outputPath,
  ]);
  return outputPath;
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
    const audioTrack = project.tracks.find((track) => track.kind === "audio");
    const textTrack = project.tracks.find((track) => track.kind === "text");
    if (!videoTrack) {
      throw new Error("No video track in project.");
    }

    const clips = project.clips
      .filter((clip) => clip.trackId === videoTrack.id && clip.assetId)
      .sort((a, b) => a.startTime - b.startTime);
    if (!clips.length) {
      throw new Error("Add at least one video clip before exporting.");
    }

    const textClips =
      textTrack?.id
        ? project.clips.filter((clip) => clip.trackId === textTrack.id && clip.kind === "text")
        : [];
    const audioClips =
      audioTrack?.id && !audioTrack.muted
        ? project.clips
            .filter((clip) => clip.trackId === audioTrack.id && clip.assetId)
            .sort((a, b) => a.startTime - b.startTime)
        : [];

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
        const vf = buildSegmentVideoFilters(clip, duration, textClips);
        const ffmpegArgs = [
          "-y",
          "-ss",
          String(clip.trimIn),
          "-i",
          sourcePath,
          "-t",
          String(duration),
          "-vf",
          vf === "null" ? "format=yuv420p" : `${vf},format=yuv420p`,
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
        ];
        await execFileAsync("ffmpeg", ffmpegArgs);
        segmentPaths.push(segmentPath);
      }

      let composedPath = await concatWithTransitions(segmentPaths, clips, tempDir);
      composedPath = await mixAudioTrack({
        videoPath: composedPath,
        audioClips,
        getAssetBunnyPath: async (assetId) => {
          const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
            userId,
            assetId,
          });
          return asset?.bunnyPath ?? null;
        },
        expiresUnix,
        tempDir,
      });

      const body = await readFile(composedPath);
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
