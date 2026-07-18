"use node";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { putObject, signBunnyCdnUrl } from "./lib/bunny";
import { ffmpegTransitionFor } from "./lib/editorEffectContract";
import { videoClipAudioFilter } from "./lib/editorExportAudio";

const execFileAsync = promisify(execFile);

type ClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
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
  frameRatio?: "16:9" | "9:16" | "1:1";
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
  return ffmpegTransitionFor(type);
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

const EXPORT_FPS = 30;

function exportSizeForRatio(ratio: unknown): { width: number; height: number } {
  if (ratio === "9:16") return { width: 720, height: 1280 };
  if (ratio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1280, height: 720 };
}

/** Contain-crop to the project frame so every segment matches export canvas. */
function normalizeVf(
  width: number,
  height: number,
  effects?: ClipEffects,
): string {
  const scale = Number.isFinite(effects?.scale) ? Number(effects?.scale) : 1;
  const panX = Number.isFinite(effects?.x) ? Number(effects?.x) : 0;
  const panY = Number.isFinite(effects?.y) ? Number(effects?.y) : 0;
  const rotation = Number.isFinite(effects?.rotation) ? Number(effects?.rotation) : 0;
  const safeScale = Math.min(4, Math.max(0.2, scale || 1));
  const scaledW = Math.max(2, Math.round(width * safeScale));
  const scaledH = Math.max(2, Math.round(height * safeScale));
  const panPxX = Math.round(panX * width);
  const panPxY = Math.round(panY * height);
  const filters = [
    `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease`,
  ];
  if (Math.abs(rotation) > 0.05) {
    // FFmpeg positive angles are CCW; editor/CSS positive is CW.
    const rad = (-rotation * Math.PI) / 180;
    filters.push(`rotate=${rad}:c=black@0:ow=rotw(iw):oh=roth(ih)`);
  }
  filters.push(
    `crop='min(iw,${width})':'min(ih,${height})':'max(0,min(iw-${width},(iw-${width})/2-${panPxX}))':'max(0,min(ih-${height},(ih-${height})/2-${panPxY}))'`,
    `pad=${width}:${height}:'max(0,min(ow-iw,(ow-iw)/2+${panPxX}))':'max(0,min(oh-ih,(oh-ih)/2+${panPxY}))':black`,
    `fps=${EXPORT_FPS}`,
    "setsar=1",
    "format=yuv420p",
  );
  return filters.join(",");
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
}

async function makeBlackSegment(
  dest: string,
  duration: number,
  width: number,
  height: number,
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${width}x${height}:r=${EXPORT_FPS}`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(Math.max(0.05, duration)),
    "-vf",
    "setsar=1,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    dest,
  ]);
}

async function hasAudioStream(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      path,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function probeMediaDurationSeconds(path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const duration = Number(stdout.trim());
    return Number.isFinite(duration) && duration > 0.05 ? duration : 0.05;
  } catch {
    return 0.05;
  }
}

async function renderClipSegment(args: {
  sourcePath: string;
  dest: string;
  clip: EditorClip;
  duration: number;
  textClips: EditorClip[];
  width: number;
  height: number;
  /** When the video track is muted in the timeline, keep picture but silence audio. */
  muteAudio?: boolean;
}): Promise<void> {
  const effects = buildSegmentVideoFilters(args.clip, args.duration, args.textClips);
  const baseVf = normalizeVf(args.width, args.height, args.clip.effects);
  const videoFilter = effects === "null" ? baseVf : `${baseVf},${effects}`;
  const encodeArgs = [
    "-t",
    String(args.duration),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    args.dest,
  ];

  const audioFilter = videoClipAudioFilter(args.clip, Boolean(args.muteAudio));
  // ffmpeg silently emits a video-only file when `-af` matches no audio, so
  // probe first: silent / muted sources must get anullsrc or concat/xfade
  // graphs fail with "Stream specifier ':a' matches no streams".
  if (audioFilter && (await hasAudioStream(args.sourcePath))) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      String(args.clip.trimIn),
      "-i",
      args.sourcePath,
      "-vf",
      videoFilter,
      "-af",
      audioFilter,
      ...encodeArgs,
    ]);
  } else {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      String(args.clip.trimIn),
      "-i",
      args.sourcePath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex",
      `[0:v]${videoFilter}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
      "-shortest",
      ...encodeArgs,
    ]);
  }
}

function timelineSegments(clips: EditorClip[]): Array<
  | { type: "gap"; duration: number }
  | { type: "clip"; clip: EditorClip; duration: number }
> {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const segments: Array<
    { type: "gap"; duration: number } | { type: "clip"; clip: EditorClip; duration: number }
  > = [];
  let cursor = 0;
  for (const clip of sorted) {
    const duration = clipDuration(clip);
    if (clip.startTime > cursor + 0.02) {
      segments.push({ type: "gap", duration: clip.startTime - cursor });
    }
    segments.push({ type: "clip", clip, duration });
    cursor = Math.max(cursor, clip.startTime + duration);
  }
  return segments;
}

async function concatNormalizedSegments(
  segmentPaths: string[],
  transitionClips: Array<EditorClip | null>,
  tempDir: string,
  width: number,
  height: number,
): Promise<string> {
  const outputPath = join(tempDir, "video-composed.mp4");
  const vf = normalizeVf(width, height);
  if (segmentPaths.length === 1) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      segmentPaths[0]!,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return outputPath;
  }

  const hasTransition = transitionClips.some(
    (clip, index) =>
      index < transitionClips.length - 1 &&
      clip?.transitionOut?.type &&
      clip.transitionOut.type !== "none",
  );

  // Prefer demuxer concat — all segments are already normalized to the same size/fps/audio.
  if (!hasTransition) {
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
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return outputPath;
  }

  // Pairwise xfade/concat into intermediate files so mixed portrait/landscape
  // never hits a single filter graph with mismatched link sizes.
  let currentPath = segmentPaths[0]!;
  let currentDuration = 0;
  {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      currentPath,
    ]);
    currentDuration = Number(stdout.trim()) || 0.05;
  }

  for (let i = 1; i < segmentPaths.length; i++) {
    const nextPath = segmentPaths[i]!;
    const prevClip = transitionClips[i - 1];
    const transition = prevClip?.transitionOut;
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      nextPath,
    ]);
    const nextDuration = Number(stdout.trim()) || 0.05;
    const outPath = join(tempDir, `pair-${i}.mp4`);

    const useXfade =
      Boolean(transition?.type && transition.type !== "none") &&
      Math.min(transition?.duration ?? 0.5, currentDuration * 0.45, nextDuration * 0.45) > 0.05;

    if (useXfade) {
      const duration = Math.min(
        transition!.duration ?? 0.5,
        currentDuration * 0.45,
        nextDuration * 0.45,
      );
      const transitionName = xfadeTransition(transition!.type);
      const offset = Math.max(0, currentDuration - duration);
      const filter =
        `[0:v]${vf}[v0];[1:v]${vf}[v1];` +
        `[v0][v1]xfade=transition=${transitionName}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}[vout];` +
        `[0:a][1:a]acrossfade=d=${duration.toFixed(3)}[aout]`;
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        currentPath,
        "-i",
        nextPath,
        "-filter_complex",
        filter,
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outPath,
      ]);
      currentDuration = currentDuration + nextDuration - duration;
    } else {
      const listPath = join(tempDir, `pair-${i}.txt`);
      await writeFile(
        listPath,
        `file '${currentPath.replace(/'/g, "'\\''")}'\nfile '${nextPath.replace(/'/g, "'\\''")}'\n`,
        "utf8",
      );
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outPath,
      ]);
      currentDuration += nextDuration;
    }

    currentPath = outPath;
  }

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    currentPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
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

  // Keep camera / embedded video audio and layer music/SFX on top (preview does this).
  if (await hasAudioStream(videoPath)) {
    filterParts.push(
      "[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100[abase]",
    );
    mixLabels.push("[abase]");
  }

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

  // Only base video audio — nothing new to mix.
  if (mixLabels.length === 0) return videoPath;
  if (mixLabels.length === 1 && mixLabels[0] === "[abase]") return videoPath;

  const videoDuration = await probeMediaDurationSeconds(videoPath);
  // apad + -shortest keeps picture length when beds are shorter than the video.
  const filter = `${filterParts.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0[amixed];[amixed]apad[aout]`;
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
    "-t",
    String(videoDuration),
    "-shortest",
    outputPath,
  ]);
  return outputPath;
}

async function runExportVideo(
  ctx: ActionCtx,
  userId: Id<"users">,
  args: {
    projectId?: Id<"videoEditProjects">;
    folderId: Id<"folders">;
    name: string;
    project: EditorProject;
  },
): Promise<{ assetId: Id<"assets"> }> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    throw new Error(
      "Export requires ffmpeg and ffprobe on the Convex action runtime. Install both binaries on the action host, then retry.",
    );
  }

  const project = args.project;
  const { width: exportWidth, height: exportHeight } = exportSizeForRatio(project.frameRatio);
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
  const transitionClips: Array<EditorClip | null> = [];

  try {
    const segments = timelineSegments(clips);
    for (const [index, segment] of segments.entries()) {
      const segmentPath = join(tempDir, `segment-${index}.mp4`);
      if (segment.type === "gap") {
        await makeBlackSegment(segmentPath, segment.duration, exportWidth, exportHeight);
        transitionClips.push(null);
      } else {
        const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
          userId,
          assetId: segment.clip.assetId as Id<"assets">,
        });
        if (!asset?.bunnyPath) {
          throw new Error(`Missing media for clip "${segment.clip.label}".`);
        }
        const url = await signBunnyCdnUrl(asset.bunnyPath, expiresUnix);
        const sourcePath = join(tempDir, `source-${index}.bin`);
        await downloadToFile(url, sourcePath);
        await renderClipSegment({
          sourcePath,
          dest: segmentPath,
          clip: segment.clip,
          duration: segment.duration,
          textClips,
          width: exportWidth,
          height: exportHeight,
          muteAudio: Boolean(videoTrack.muted),
        });
        transitionClips.push(segment.clip);
      }
      segmentPaths.push(segmentPath);
    }

    let composedPath = await concatNormalizedSegments(
      segmentPaths,
      transitionClips,
      tempDir,
      exportWidth,
      exportHeight,
    );
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
    return await runExportVideo(ctx, userId, {
      projectId: args.projectId,
      folderId: args.folderId,
      name: args.name,
      project: args.project as EditorProject,
    });
  },
});

export const exportVideoForApi = internalAction({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
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
    return await runExportVideo(ctx, args.userId, {
      projectId: args.projectId,
      folderId: row.folderId,
      name: row.name,
      project: row.project as EditorProject,
    });
  },
});
