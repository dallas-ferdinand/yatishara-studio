"use node";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import {
  bedClipAudioFilters,
  collectExportAudioBeds,
  concatAvFilter,
  exportCoverUntilSec,
  timelineDurationSec,
  transitionAudioMixFilter,
  videoClipAudioFilter,
} from "./lib/editorExportAudio";
import {
  clipSourceInputArgs,
  isStillExportSource,
  safeContainVf,
} from "./lib/editorExportPicture";
import {
  buildNaturalSpeedAudioFilters,
  buildSpeedSetptsFilter,
  clipSpeedFromEffects,
  isIdentitySpeed,
} from "./lib/naturalAudioSpeed";
import {
  DEFAULT_EXPORT_RESOLUTION,
  audioExportExt,
  audioExportMime,
  exportH264Args,
  exportSizeForRatioAndResolution,
  isHeavyExportFrame,
  normalizeExportAudioFormat,
  normalizeExportResolution,
  type ExportAudioFormat,
  type ExportResolution,
} from "./lib/editorExport";
import {
  buildTextOverlayFilter,
  collectExportTextClips,
  ffmpegFailMessage,
  isLegacySystemFont,
  textFontFile,
  type ExportTextClip,
} from "./lib/editorExportText";
import { clipAtPlayhead } from "./lib/editorProjectOps";

const execFileAsync = promisify(execFile);
const FFMPEG_EXEC_OPTS = { maxBuffer: 16 * 1024 * 1024 };

/** Quiet stats so a failed mix does not surface `frame= 0` progress as the error. */
function runFfmpeg(args: string[]) {
  return execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-loglevel", "error", ...args],
    FFMPEG_EXEC_OPTS,
  );
}

/**
 * Export re-encodes audio per segment, per concat pair, then again at the mix.
 * ffmpeg's default AAC (~128k) loses ~4 dB above 13 kHz over those passes and
 * dulls beds against the preview; 320k holds it to ~0.4 dB.
 */
const EXPORT_AUDIO_BITRATE = "320k";

type ClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  audioFadeIn?: number;
  audioFadeOut?: number;
  volume?: number;
  speed?: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
  opacity?: number;
};

type TextClipContent = {
  text?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textCase?: "none" | "upper" | "lower" | "title";
  letterSpacing?: number;
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string | null;
  backgroundPadding?: number;
  backgroundRadius?: number;
  shadowColor?: string | null;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glow?: boolean;
  glowColor?: string;
  glowBlur?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
};

type EditorClip = {
  id: string;
  assetId?: string;
  trackId: string;
  startTime: number;
  trimIn: number;
  trimOut: number;
  label: string;
  kind: "video" | "audio" | "text" | "image";
  effects?: ClipEffects;
  transitionOut?: { type: string; duration: number };
  text?: TextClipContent;
};

type EditorProject = {
  tracks: Array<{ id: string; kind: "video" | "audio" | "text"; muted?: boolean }>;
  clips: EditorClip[];
  frameRatio?: "16:9" | "9:16" | "1:1";
};

function sourceTrim(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

function clipDuration(clip: EditorClip): number {
  return timelineDurationSec(clip);
}

function xfadeTransition(type: string): string {
  return ffmpegTransitionFor(type);
}

async function resolveExportFontFile(
  content: ExportTextClip["text"],
  fontCacheDir: string,
): Promise<string | null> {
  const family = content?.fontFamily;
  if (!isLegacySystemFont(family) && family) {
    const google = await resolveGoogleFontFile(family, Boolean(content?.bold), fontCacheDir);
    if (google) return google;
  }
  const bundled = textFontFile(content);
  if (bundled && existsSync(bundled)) return bundled;
  return await resolveGoogleFontFile(family || "Inter", Boolean(content?.bold), fontCacheDir);
}

async function buildTextOverlayParts(
  textClips: ExportTextClip[],
  segmentStart: number,
  segmentDuration: number,
  fontCacheDir: string,
): Promise<string[]> {
  const parts: string[] = [];
  for (const [index, textClip] of textClips.entries()) {
    const fontfile = await resolveExportFontFile(textClip.text, fontCacheDir);
    const textFileName = join(
      fontCacheDir,
      `overlay-${textClip.id || index}-${segmentStart.toFixed(3)}.txt`,
    );
    const built = buildTextOverlayFilter({
      clip: textClip,
      segmentStart,
      segmentDuration,
      fontfile,
      textFileName,
    });
    if (!built) continue;
    await writeFile(textFileName, built.textFileBody, "utf8");
    parts.push(built.filter);
  }
  return parts;
}

async function buildSegmentVideoFilters(
  clip: EditorClip,
  duration: number,
  textClips: ExportTextClip[],
  fontCacheDir: string,
): Promise<string> {
  const parts: string[] = [];
  const dur = Math.max(0.05, duration);
  let fadeIn = Math.max(0, Number(clip.effects?.fadeIn) || 0);
  let fadeOut = Math.max(0, Number(clip.effects?.fadeOut) || 0);
  fadeIn = Math.min(dur, fadeIn);
  fadeOut = Math.min(dur, fadeOut);
  if (fadeIn + fadeOut > dur) {
    const scale = dur / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }
  // Video `fade` has no `curve` option (that's afade-only). Passing curve=qsin
  // crashes export on the action host: "Option not found".
  if (fadeIn > 0.001) {
    parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  }
  if (fadeOut > 0.001) {
    const st = Math.max(0, dur - fadeOut);
    parts.push(`fade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }
  parts.push(...(await buildTextOverlayParts(textClips, clip.startTime, duration, fontCacheDir)));
  return parts.length ? parts.join(",") : "null";
}

const EXPORT_FPS = 30;

/** Contain-crop to the project frame so every segment matches export canvas. */
function normalizeVf(
  width: number,
  height: number,
  effects?: ClipEffects,
): string {
  // Draft effects.speed is process-on-demand (bake → new asset). Do not setpts here.
  const scale = Number.isFinite(effects?.scale) ? Number(effects?.scale) : 1;
  const panX = Number.isFinite(effects?.x) ? Number(effects?.x) : 0;
  const panY = Number.isFinite(effects?.y) ? Number(effects?.y) : 0;
  const rotation = Number.isFinite(effects?.rotation) ? Number(effects?.rotation) : 0;
  const safeScale = Math.min(4, Math.max(0, Number.isFinite(scale) ? scale : 1));
  if (safeScale < 0.005) {
    return `scale=2:2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${EXPORT_FPS},setsar=1,format=yuv420p`;
  }
  const scaledW = Math.max(2, Math.round(width * safeScale));
  const scaledH = Math.max(2, Math.round(height * safeScale));
  const panPxX = Math.round(panX * width);
  const panPxY = Math.round(panY * height);
  const filters = [
    `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease`,
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
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
  const opacity = Number(effects?.opacity);
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 1;
  if (safeOpacity < 0.999) {
    filters.splice(
      filters.length - 1,
      0,
      `lutrgb=r='val*${safeOpacity.toFixed(4)}':g='val*${safeOpacity.toFixed(4)}':b='val*${safeOpacity.toFixed(4)}'`,
    );
  }
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

async function resolveGoogleFontFile(
  family: string,
  bold: boolean,
  destDir: string,
): Promise<string | null> {
  const weight = bold ? 700 : 400;
  const cssFamily = family.trim().replace(/\s+/g, "+");
  const cssUrl = `https://fonts.googleapis.com/css2?family=${cssFamily}:wght@${weight}&display=swap`;
  try {
    const res = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const css = await res.text();
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    const fontUrl = match?.[1];
    if (!fontUrl) return null;
    const ext = fontUrl.includes(".otf") ? "otf" : "ttf";
    const safe = family.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
    const dest = `${destDir}/gf_${safe}_${weight}.${ext}`;
    await downloadToFile(fontUrl, dest);
    return dest;
  } catch {
    return null;
  }
}


async function makeBlackSegment(
  dest: string,
  duration: number,
  width: number,
  height: number,
  textParts: string[] = [],
): Promise<void> {
  const vf = ["setsar=1", "format=yuv420p", ...textParts].join(",");
  try {
    await runFfmpeg([
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
      vf,
      ...exportH264Args(width, height),
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
  } catch (error) {
    throw new Error(ffmpegFailMessage(error, "Could not render a blank timeline segment."));
  }
}

/**
 * Audio presence + channel count in one probe. Channels drive the mono
 * up-mix (see exportAudioLayoutFilter); unknown counts assume stereo so
 * odd probes keep the old behaviour instead of silencing a lane.
 */
async function probeAudioStream(
  path: string,
): Promise<{ present: boolean; channels: number }> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index,channels",
      "-of",
      "csv=p=0",
      path,
    ]);
    const line = stdout.trim().split(/\r?\n/)[0] ?? "";
    if (!line.length) return { present: false, channels: 0 };
    const channels = Number(line.split(",")[1]);
    return {
      present: true,
      channels: Number.isFinite(channels) && channels > 0 ? channels : 2,
    };
  } catch {
    return { present: false, channels: 0 };
  }
}

async function hasAudioStream(path: string): Promise<boolean> {
  return (await probeAudioStream(path)).present;
}

async function probePictureStream(
  path: string,
): Promise<{ present: boolean; codec?: string; nbFrames?: number }> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,nb_frames",
      "-of",
      "csv=p=0",
      path,
    ]);
    const line = stdout.trim().split(/\r?\n/)[0] ?? "";
    if (!line.length) return { present: false };
    const [codec, framesRaw] = line.split(",");
    const nbFrames = Number(framesRaw);
    return {
      present: true,
      codec: codec || undefined,
      nbFrames: Number.isFinite(nbFrames) && nbFrames > 0 ? nbFrames : undefined,
    };
  } catch {
    return { present: false };
  }
}

async function hasVideoStream(path: string): Promise<boolean> {
  return (await probePictureStream(path)).present;
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
  textClips: ExportTextClip[];
  width: number;
  height: number;
  fontCacheDir: string;
  /** When the video track is muted in the timeline, keep picture but silence audio. */
  muteAudio?: boolean;
}): Promise<void> {
  const effects = await buildSegmentVideoFilters(
    args.clip,
    args.duration,
    args.textClips,
    args.fontCacheDir,
  );
  const baseVf = normalizeVf(args.width, args.height, args.clip.effects);
  const videoFilter = effects === "null" ? baseVf : `${baseVf},${effects}`;
  const encodeArgs = [
    "-t",
    String(args.duration),
    ...exportH264Args(args.width, args.height),
    "-c:a",
    "aac",
    "-b:a",
    EXPORT_AUDIO_BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    args.dest,
  ];

  const sourceAudio = await probeAudioStream(args.sourcePath);
  const picture = await probePictureStream(args.sourcePath);
  const sourceDurationSec = picture.present
    ? await probeMediaDurationSeconds(args.sourcePath)
    : 0;
  const isStill = isStillExportSource({
    kind: args.clip.kind,
    codec: picture.codec,
    nbFrames: picture.nbFrames,
    sourceDurationSec,
  });
  const audioFilter = videoClipAudioFilter(
    args.clip,
    Boolean(args.muteAudio),
    args.duration,
    sourceAudio.channels,
  );
  // ffmpeg silently emits a video-only file when `-af` matches no audio, so
  // probe first: silent / muted sources must get anullsrc or concat/xfade
  // graphs fail with "Stream specifier ':a' matches no streams".
  const sourceLen = sourceTrim(args.clip);
  const inputTrimArgs = clipSourceInputArgs({
    sourcePath: args.sourcePath,
    trimIn: args.clip.trimIn,
    sourceLen,
    identitySpeed: isIdentitySpeed(clipSpeedFromEffects(args.clip.effects)),
    isStill,
    fps: EXPORT_FPS,
  });
  const useSourceAudio = Boolean(audioFilter && sourceAudio.present && picture.present && !isStill);
  try {
    if (!picture.present) {
      // Audio-only asset parked on a video lane — hold black, keep the bed.
      const extraVf = effects === "null" ? [] : effects.split(",").filter((part) => part && part !== "null");
      if (audioFilter && sourceAudio.present) {
        await runFfmpeg([
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=${args.width}x${args.height}:r=${EXPORT_FPS}`,
          "-i",
          args.sourcePath,
          "-filter_complex",
          `[0:v]${["setsar=1", "format=yuv420p", ...extraVf].join(",")}[v];[1:a]${audioFilter}[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          ...encodeArgs,
        ]);
      } else {
        await makeBlackSegment(
          args.dest,
          args.duration,
          args.width,
          args.height,
          extraVf,
        );
      }
      return;
    }
    if (useSourceAudio) {
      await runFfmpeg([
        "-y",
        ...inputTrimArgs,
        "-vf",
        videoFilter,
        "-af",
        audioFilter!,
        ...encodeArgs,
      ]);
    } else {
      await runFfmpeg([
        "-y",
        ...inputTrimArgs,
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
  } catch (error) {
    const safeVf = safeContainVf(args.width, args.height, EXPORT_FPS);
    const stillInput = clipSourceInputArgs({
      sourcePath: args.sourcePath,
      trimIn: 0,
      sourceLen,
      identitySpeed: true,
      isStill: true,
      fps: EXPORT_FPS,
    });
    const retrySilent = async (inputArgs: string[], vf: string) => {
      await runFfmpeg([
        "-y",
        "-fflags",
        "+genpts+discardcorrupt",
        ...inputArgs,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-filter_complex",
        `[0:v]${vf}[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-shortest",
        ...encodeArgs,
      ]);
    };
    try {
      if (picture.present) {
        await retrySilent(inputTrimArgs, safeVf);
        return;
      }
    } catch {
      /* next fallback */
    }
    try {
      if (picture.present) {
        await retrySilent(stillInput, safeVf);
        return;
      }
    } catch {
      /* next fallback */
    }
    try {
      await makeBlackSegment(
        args.dest,
        args.duration,
        args.width,
        args.height,
        effects === "null" ? [] : effects.split(",").filter((part) => part && part !== "null"),
      );
      return;
    } catch {
      /* give up */
    }
    const fallback = `Could not render clip "${args.clip.label || "untitled"}".`;
    const detail = ffmpegFailMessage(error, "");
    const raw = error && typeof error === "object" ? String((error as { stderr?: string }).stderr ?? "") : "";
    if (raw) console.error(`export clip render failed (${args.clip.label}): ${raw.slice(0, 800)}`);
    throw new Error(detail && detail !== fallback ? `${fallback} ${detail}` : fallback);
  }
}

function timelineSegments(
  clips: EditorClip[],
  coverUntil = 0,
): Array<
  | { type: "gap"; duration: number; startTime: number }
  | { type: "clip"; clip: EditorClip; duration: number }
> {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const segments: Array<
    | { type: "gap"; duration: number; startTime: number }
    | { type: "clip"; clip: EditorClip; duration: number }
  > = [];
  let cursor = 0;
  for (const clip of sorted) {
    const duration = clipDuration(clip);
    if (clip.startTime > cursor + 0.02) {
      segments.push({
        type: "gap",
        duration: clip.startTime - cursor,
        startTime: cursor,
      });
    }
    segments.push({ type: "clip", clip, duration });
    cursor = Math.max(cursor, clip.startTime + duration);
  }
  if (coverUntil > cursor + 0.02) {
    segments.push({ type: "gap", duration: coverUntil - cursor, startTime: cursor });
  }
  return segments;
}

async function ensureSegmentAv(
  path: string,
  dest: string,
  width: number,
  height: number,
): Promise<string> {
  const hasV = await hasVideoStream(path);
  const hasA = await hasAudioStream(path);
  if (hasV && hasA) return path;
  const duration = await probeMediaDurationSeconds(path);
  if (hasV && !hasA) {
    await runFfmpeg([
      "-y",
      "-i",
      path,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      EXPORT_AUDIO_BITRATE,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-shortest",
      "-t",
      String(duration),
      dest,
    ]);
    return dest;
  }
  await makeBlackSegment(dest, duration, width, height);
  return dest;
}

async function concatSegmentsHardCut(
  segmentPaths: string[],
  dest: string,
  width: number,
  height: number,
): Promise<void> {
  const inputs = segmentPaths.flatMap((path) => ["-i", path]);
  await runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    concatAvFilter(segmentPaths.length, width, height, EXPORT_FPS),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...exportH264Args(width, height),
    "-c:a",
    "aac",
    "-b:a",
    EXPORT_AUDIO_BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    dest,
  ]);
}

async function stitchPairwiseHardCut(
  segmentPaths: string[],
  dest: string,
  tempDir: string,
  width: number,
  height: number,
): Promise<void> {
  let current = segmentPaths[0]!;
  for (let i = 1; i < segmentPaths.length; i += 1) {
    const outPath = join(tempDir, `pair-cut-${i}.mp4`);
    await concatSegmentsHardCut([current, segmentPaths[i]!], outPath, width, height);
    current = outPath;
  }
  await runFfmpeg(["-y", "-i", current, "-c", "copy", "-movflags", "+faststart", dest]);
}

async function concatNormalizedSegments(
  segmentPaths: string[],
  transitionClips: Array<EditorClip | null>,
  tempDir: string,
  width: number,
  height: number,
): Promise<string> {
  const outputPath = join(tempDir, "video-composed.mp4");
  // Segments are already canvas-sized. Re-running normalizeVf at 4K
  // (scale+crop+pad+xfade) OOMs the action host; 1080 can afford the safety pass.
  const vf = isHeavyExportFrame(width, height)
    ? `fps=${EXPORT_FPS},setsar=1,format=yuv420p`
    : normalizeVf(width, height);
  const padded: string[] = [];
  for (const [index, path] of segmentPaths.entries()) {
    padded.push(
      await ensureSegmentAv(path, join(tempDir, `seg-av-${index}.mp4`), width, height),
    );
  }
  if (padded.length === 1) {
    await runFfmpeg([
      "-y",
      "-i",
      padded[0]!,
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

  if (!hasTransition) {
    if (isHeavyExportFrame(width, height)) {
      await stitchPairwiseHardCut(padded, outputPath, tempDir, width, height);
    } else {
      await concatSegmentsHardCut(padded, outputPath, width, height);
    }
    return outputPath;
  }

  // Pairwise xfade into intermediate files. If a wipe fails, hard-cut the rest.
  try {
    let currentPath = padded[0]!;
    let currentDuration = await probeMediaDurationSeconds(currentPath);

    for (let i = 1; i < padded.length; i++) {
      const nextPath = padded[i]!;
      const prevClip = transitionClips[i - 1];
      const transition = prevClip?.transitionOut;
      const nextDuration = await probeMediaDurationSeconds(nextPath);
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
          transitionAudioMixFilter({ durationSec: duration, offsetSec: offset });
        try {
          await runFfmpeg([
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
            ...exportH264Args(width, height),
            "-c:a",
            "aac",
            "-b:a",
            EXPORT_AUDIO_BITRATE,
            "-ar",
            "44100",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            outPath,
          ]);
          currentDuration = currentDuration + nextDuration - duration;
        } catch {
          await concatSegmentsHardCut([currentPath, nextPath], outPath, width, height);
          currentDuration += nextDuration;
        }
      } else {
        await concatSegmentsHardCut([currentPath, nextPath], outPath, width, height);
        currentDuration += nextDuration;
      }

      currentPath = outPath;
    }

    await runFfmpeg([
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
  } catch (error) {
    try {
      if (isHeavyExportFrame(width, height)) {
        await stitchPairwiseHardCut(padded, outputPath, tempDir, width, height);
      } else {
        await concatSegmentsHardCut(padded, outputPath, width, height);
      }
      return outputPath;
    } catch {
      throw new Error(
        ffmpegFailMessage(error, "Could not stitch the timeline together."),
      );
    }
  }
}

async function mixAudioTrack(args: {
  videoPath: string;
  audioClips: EditorClip[];
  getAssetBunnyPath: (assetId: Id<"assets">) => Promise<string | null>;
  expiresUnix: number;
  tempDir: string;
  /** Full timeline length (video may already include black tail for late beds). */
  targetDurationSec?: number;
}): Promise<string> {
  const { videoPath, audioClips, getAssetBunnyPath, expiresUnix, tempDir } = args;
  if (!audioClips.length) return videoPath;

  const outputPath = join(tempDir, "export-with-audio.mp4");
  const audioInputs: string[] = [];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];
  let inputIndex = 0;
  let videoInputIndex = -1;

  // Open picture and soundtrack as separate inputs of the same file. Sharing one
  // demuxer for `-map 0:v -c:v copy` plus `[0:a]amix` stalls the muxer at
  // frame=0 / size=0kB while audio time crawls — that dump was the "error".
  const videoHasPicture = await hasVideoStream(videoPath);
  if (videoHasPicture) {
    videoInputIndex = inputIndex;
    audioInputs.push("-i", videoPath);
    inputIndex += 1;
  }
  if (await hasAudioStream(videoPath)) {
    filterParts.push(
      `[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100[abase]`,
    );
    mixLabels.push("[abase]");
    audioInputs.push("-i", videoPath);
    inputIndex += 1;
  }

  let bedEnd = 0;
  for (const [index, clip] of audioClips.entries()) {
    if (!clip.assetId) continue;
    const bunnyPath = await getAssetBunnyPath(clip.assetId as Id<"assets">);
    if (!bunnyPath) continue;
    const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
    // Detached beds reuse the video asset — keep a neutral extension; ffmpeg probes content.
    const sourcePath = join(tempDir, `audio-source-${index}.bin`);
    await downloadToFile(url, sourcePath);
    const bedAudio = await probeAudioStream(sourcePath);
    if (!bedAudio.present) continue;
    audioInputs.push("-i", sourcePath);
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const duration = clipDuration(clip);
    bedEnd = Math.max(bedEnd, clip.startTime + duration);
    const bedFilters = bedClipAudioFilters(clip, duration, bedAudio.channels);
    let chain = `[${inputIndex}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS`;
    if (bedFilters) chain += `,${bedFilters}`;
    chain += `,adelay=${delayMs}:all=1[a${index}]`;
    filterParts.push(chain);
    mixLabels.push(`[a${index}]`);
    inputIndex += 1;
  }

  // Only base video audio — nothing new to mix.
  if (mixLabels.length === 0) return videoPath;
  if (mixLabels.length === 1 && mixLabels[0] === "[abase]") return videoPath;

  const videoDuration = await probeMediaDurationSeconds(videoPath);
  const targetDuration = Math.max(
    videoDuration,
    bedEnd,
    Number(args.targetDurationSec) || 0,
  );
  // apad keeps audio as long as the timeline; picture must already cover targetDuration
  // (black tail via exportCoverUntilSec). Do not -shortest or we cut beds after last video.
  const filter = `${filterParts.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0[amixed];[amixed]apad[aout]`;
  const mapArgs =
    videoInputIndex >= 0
      ? ["-map", `${videoInputIndex}:v`, "-map", "[aout]", "-c:v", "copy"]
      : ["-map", "[aout]", "-vn"];
  try {
    await runFfmpeg([
      "-y",
      ...audioInputs,
      "-filter_complex",
      filter,
      ...mapArgs,
      "-c:a",
      "aac",
      "-b:a",
      EXPORT_AUDIO_BITRATE,
      "-max_muxing_queue_size",
      "9999",
      "-t",
      String(targetDuration),
      outputPath,
    ]);
  } catch (error) {
    throw new Error(ffmpegFailMessage(error, "Could not mix audio onto the export."));
  }
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
    exportResolution?: ExportResolution;
    exportKind?: "video" | "audio";
    audioFormat?: ExportAudioFormat;
    jobId?: Id<"exportJobs">;
  },
): Promise<{ assetId: Id<"assets"> }> {
  const report = async (phase: string, progress: number) => {
    if (!args.jobId) return;
    try {
      await ctx.runMutation(internal.exportJobs.patchProgress, {
        jobId: args.jobId,
        phase,
        progress,
      });
    } catch {
      // Progress is best-effort; never fail the export on reporting.
    }
  };

  try {
    await runFfmpeg(["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    const message =
      "Export requires ffmpeg and ffprobe on the Convex action runtime. Install both binaries on the action host, then retry.";
    if (args.jobId) {
      await ctx.runMutation(internal.exportJobs.fail, { jobId: args.jobId, error: message });
    }
    throw new Error(message);
  }

  const exportKind = args.exportKind === "audio" ? "audio" : "video";
  const audioFormat = normalizeExportAudioFormat(args.audioFormat);
  const project = args.project;
  const resolution = normalizeExportResolution(
    args.exportResolution ?? DEFAULT_EXPORT_RESOLUTION,
  );
  // Audio-only can render at 720p for speed — picture is discarded.
  const renderResolution = exportKind === "audio" ? ("720p" as ExportResolution) : resolution;
  const { width: exportWidth, height: exportHeight } = exportSizeForRatioAndResolution(
    project.frameRatio,
    renderResolution,
  );
  const videoTrack = project.tracks.find((track) => track.kind === "video");
  if (!videoTrack) {
    const message = "No video track in project.";
    if (args.jobId) {
      await ctx.runMutation(internal.exportJobs.fail, { jobId: args.jobId, error: message });
    }
    throw new Error(message);
  }

  const clips = project.clips
    .filter((clip) => clip.trackId === videoTrack.id && clip.assetId)
    .sort((a, b) => a.startTime - b.startTime);

  const textClips =
    exportKind === "video"
      ? collectExportTextClips(project.clips, clipDuration)
      : [];
  // Every unmuted Audio lane (Separate audio often lands on Audio 2+).
  const audioClips = collectExportAudioBeds(project);
  const coverUntil = exportCoverUntilSec({
    textEnds: textClips.map((clip) => clip.startTime + clip.duration),
    audioClips,
  });

  if (!clips.length && coverUntil <= 0.02) {
    const message = "Add a video or audio clip before exporting.";
    if (args.jobId) {
      await ctx.runMutation(internal.exportJobs.fail, { jobId: args.jobId, error: message });
    }
    throw new Error(message);
  }

  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
  const tempDir = await mkdtemp(join(tmpdir(), "studio-edit-"));
  const fontCacheDir = join(tempDir, "fonts");
  await mkdir(fontCacheDir, { recursive: true });
  const segmentPaths: string[] = [];
  const transitionClips: Array<EditorClip | null> = [];

  try {
    await report("Preparing clips…", 5);
    // coverUntil pads black after the last video so trailing audio/text still render.
    const segments = timelineSegments(clips, coverUntil);
    if (!segments.length) {
      throw new Error("Nothing to export on the timeline.");
    }
    for (const [index, segment] of segments.entries()) {
      const segmentPath = join(tempDir, `segment-${index}.mp4`);
      if (segment.type === "gap") {
        const textParts = await buildTextOverlayParts(
          textClips,
          segment.startTime,
          segment.duration,
          fontCacheDir,
        );
        await makeBlackSegment(
          segmentPath,
          segment.duration,
          exportWidth,
          exportHeight,
          textParts,
        );
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
          fontCacheDir,
          muteAudio: Boolean(videoTrack.muted),
        });
        transitionClips.push(segment.clip);
      }
      segmentPaths.push(segmentPath);
      const pct = 5 + Math.round(((index + 1) / Math.max(1, segments.length)) * 50);
      await report(`Rendering clip ${index + 1} of ${segments.length}…`, pct);
    }

    await report("Compositing timeline…", 60);
    let composedPath: string;
    try {
      composedPath = await concatNormalizedSegments(
        segmentPaths,
        transitionClips,
        tempDir,
        exportWidth,
        exportHeight,
      );
    } catch (error) {
      throw new Error(
        ffmpegFailMessage(error, "Could not stitch the timeline together."),
      );
    }
    await report("Mixing audio…", 72);
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
      targetDurationSec: coverUntil,
    });

    let body: Buffer;
    let filename: string;
    let mimeType: string;
    let kind: "video" | "audio";

    if (exportKind === "audio") {
      await report(`Encoding ${audioFormat.toUpperCase()}…`, 85);
      const audioOut = join(tempDir, `export-audio${audioExportExt(audioFormat)}`);
      const codecArgs =
        audioFormat === "wav"
          ? ["-vn", "-c:a", "pcm_s16le"]
          : audioFormat === "m4a"
            ? ["-vn", "-c:a", "aac", "-b:a", EXPORT_AUDIO_BITRATE]
            : ["-vn", "-c:a", "libmp3lame", "-b:a", EXPORT_AUDIO_BITRATE];
      await runFfmpeg(["-y", "-i", composedPath, ...codecArgs, audioOut]);
      body = await readFile(audioOut);
      const rawName = (args.name || "export").replace(/\.(mp3|wav|m4a|mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}${audioExportExt(audioFormat)}`;
      mimeType = audioExportMime(audioFormat);
      kind = "audio";
    } else {
      await report("Uploading video…", 88);
      body = await readFile(composedPath);
      const rawName = (args.name || "export").replace(/\.(mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}.mp4`;
      mimeType = "video/mp4";
      kind = "video";
    }

    const prepared = await ctx.runMutation(internal.videoEditInternal.createExportAsset, {
      userId,
      folderId: args.folderId,
      name: filename,
      kind,
      mimeType,
    });
    await putObject({
      path: prepared.bunnyPath,
      body,
      contentType: mimeType,
    });
    await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
      assetId: prepared.assetId,
      byteSize: body.byteLength,
    });
    if (args.projectId && exportKind === "video") {
      await ctx.runMutation(internal.videoEditInternal.attachOutput, {
        userId,
        projectId: args.projectId,
        outputAssetId: prepared.assetId,
      });
    }
    if (args.jobId) {
      await ctx.runMutation(internal.exportJobs.complete, {
        jobId: args.jobId,
        resultAssetId: prepared.assetId,
      });
    }
    await report("Export ready", 100);
    return { assetId: prepared.assetId };
  } catch (error) {
    const message = ffmpegFailMessage(error, "Export failed.");
    if (args.jobId) {
      try {
        await ctx.runMutation(internal.exportJobs.fail, { jobId: args.jobId, error: message });
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const exportResolutionValidator = v.union(
  v.literal("720p"),
  v.literal("1080p"),
  v.literal("4K"),
);

const exportKindValidator = v.union(v.literal("video"), v.literal("audio"));
const audioFormatValidator = v.union(v.literal("mp3"), v.literal("wav"), v.literal("m4a"));

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
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to export.");
    }
    if (args.jobId) {
      const owned = await ctx.runQuery(internal.exportJobs.getOwned, {
        userId,
        jobId: args.jobId,
      });
      if (!owned) throw new Error("Export job not found.");
    }
    return await runExportVideo(ctx, userId, {
      projectId: args.projectId,
      folderId: args.folderId,
      name: args.name,
      project: args.project as EditorProject,
      exportResolution: args.exportResolution,
      exportKind: args.exportKind,
      audioFormat: args.audioFormat,
      jobId: args.jobId,
    });
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
    return await runExportVideo(ctx, args.userId, {
      projectId: args.projectId,
      folderId: row.folderId,
      name: exportName,
      project: row.project as EditorProject,
      exportResolution: args.exportResolution,
      exportKind: args.exportKind,
      audioFormat: args.audioFormat,
    });
  },
});

/**
 * Cut a single asset to [trimIn, trimOut] and return a short-lived download URL.
 * Used by the editor clip context menu (Save as video / Save as audio).
 */
async function runDownloadClipSegment(
  ctx: ActionCtx,
  userId: Id<"users">,
  args: {
    assetId: Id<"assets">;
    trimIn: number;
    trimOut: number;
    mode: "video" | "audio";
    filename?: string;
    speed?: number;
  },
): Promise<{ url: string; filename: string; contentType: string }> {
  try {
    await runFfmpeg(["-version"]);
  } catch {
    throw new Error(
      "Clip download requires ffmpeg on the Convex action runtime.",
    );
  }

  const trimIn = Math.max(0, args.trimIn);
  const trimOut = Math.max(trimIn + 0.05, args.trimOut);
  const sourceLen = Math.max(0.05, trimOut - trimIn);
  const speed = clipSpeedFromEffects({ speed: args.speed });
  const duration = Math.max(0.05, sourceLen / speed);
  const naturalAf = buildNaturalSpeedAudioFilters(speed);
  const speedPts = buildSpeedSetptsFilter(speed);

  const source = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
    userId,
    assetId: args.assetId,
  });
  if (!source?.bunnyPath) {
    throw new Error("Source media not found.");
  }

  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
  const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
  const tempDir = await mkdtemp(join(tmpdir(), "studio-clip-dl-"));
  try {
    const sourcePath = join(tempDir, "source.bin");
    await downloadToFile(signedSource, sourcePath);

    const audioOnly = args.mode === "audio";
    const baseName = (args.filename ?? source.name ?? "clip")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.\- ]+/g, " ")
      .trim()
      .slice(0, 80) || "clip";
    const filename = audioOnly ? `${baseName}.wav` : `${baseName}.mp4`;
    const contentType = audioOnly ? "audio/wav" : "video/mp4";
    const outPath = join(tempDir, audioOnly ? "clip.wav" : "clip.mp4");

    if (audioOnly) {
      const afParts = [naturalAf, "aformat=sample_fmts=s16:channel_layouts=stereo"].filter(Boolean);
      const audioArgs = [
        "-y",
        "-ss",
        String(trimIn),
        "-t",
        String(sourceLen),
        "-i",
        sourcePath,
        "-t",
        String(duration),
        "-vn",
      ];
      if (afParts.length) {
        audioArgs.push("-af", afParts.join(","));
      }
      audioArgs.push(
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        outPath,
      );
      await runFfmpeg(audioArgs);
    } else if (await hasAudioStream(sourcePath)) {
      const vf = speedPts || "null";
      const af = naturalAf || "anull";
      await runFfmpeg([
        "-y",
        "-ss",
        String(trimIn),
        "-t",
        String(sourceLen),
        "-i",
        sourcePath,
        "-t",
        String(duration),
        "-vf",
        vf,
        "-af",
        af,
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
        outPath,
      ]);
    } else {
      const vfSilent = speedPts || "null";
      await runFfmpeg([
        "-y",
        "-ss",
        String(trimIn),
        "-t",
        String(sourceLen),
        "-i",
        sourcePath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        String(duration),
        "-vf",
        vfSilent,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
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
        outPath,
      ]);
    }

    const body = await readFile(outPath);
    if (body.byteLength < 64) {
      throw new Error("Clipped media is empty.");
    }
    const bunnyPath = `users/${userId}/clip-downloads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}/${filename}`;
    await putObject({
      path: bunnyPath,
      body,
      contentType,
    });
    const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
    return { url, filename, contentType };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

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
    return await runDownloadClipSegment(ctx, userId, args);
  },
});

/** API/MCP: trimmed clip download (prefer projectId+clipId; or assetId+trim). */
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
      mode =
        args.mode ??
        (clip.kind === "audio" ? "audio" : "video");
      filename = args.filename ?? clip.label;
    }

    if (!assetId || trimIn == null || trimOut == null) {
      throw new Error("Provide clipId (with project) or assetId + trimIn + trimOut.");
    }

    return await runDownloadClipSegment(ctx, args.userId, {
      assetId,
      trimIn,
      trimOut,
      mode,
      filename,
      speed,
    });
  },
});

/**
 * Process-on-demand clip speed: bake trim+speed into a new folder asset.
 * Timeline then plays the copy at 1× — no live remapping.
 */
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
    try {
      await runFfmpeg(["-version"]);
    } catch {
      throw new Error(
        "Speed process requires ffmpeg on the Convex action runtime.",
      );
    }

    const trimIn = Math.max(0, args.trimIn);
    const trimOut = Math.max(trimIn + 0.05, args.trimOut);
    const sourceLen = Math.max(0.05, trimOut - trimIn);
    const speed = clipSpeedFromEffects({ speed: args.speed });
    if (isIdentitySpeed(speed)) {
      throw new Error("Choose a speed other than 1× before processing.");
    }
    const durationSec = Math.max(0.05, sourceLen / speed);
    const naturalAf = buildNaturalSpeedAudioFilters(speed);
    const speedPts = buildSpeedSetptsFilter(speed);

    const source = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
      userId,
      assetId: args.assetId,
    });
    if (!source?.bunnyPath) {
      throw new Error("Source media not found.");
    }

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-speed-process-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      await downloadToFile(signedSource, sourcePath);

      const audioOnly = args.mode === "audio";
      const baseName = (args.filename ?? source.name ?? "clip")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.\- ]+/g, " ")
        .trim()
        .slice(0, 60) || "clip";
      const speedLabel = speed.toFixed(2).replace(/\.?0+$/, "");
      const name = audioOnly
        ? `${baseName} ${speedLabel}x.wav`
        : `${baseName} ${speedLabel}x.mp4`;
      const kind = audioOnly ? ("audio" as const) : ("video" as const);
      const contentType = audioOnly ? "audio/wav" : "video/mp4";
      const outPath = join(tempDir, audioOnly ? "out.wav" : "out.mp4");

      if (audioOnly) {
        const afParts = [
          naturalAf,
          "aformat=sample_fmts=s16:channel_layouts=stereo",
        ].filter(Boolean);
        const audioArgs = [
          "-y",
          "-ss",
          String(trimIn),
          "-t",
          String(sourceLen),
          "-i",
          sourcePath,
          "-t",
          String(durationSec),
          "-vn",
        ];
        if (afParts.length) {
          audioArgs.push("-af", afParts.join(","));
        }
        audioArgs.push(
          "-acodec",
          "pcm_s16le",
          "-ar",
          "44100",
          "-ac",
          "2",
          outPath,
        );
        await runFfmpeg(audioArgs);
      } else if (await hasAudioStream(sourcePath)) {
        const vf = speedPts || "null";
        const af = naturalAf || "anull";
        await runFfmpeg([
          "-y",
          "-ss",
          String(trimIn),
          "-t",
          String(sourceLen),
          "-i",
          sourcePath,
          "-t",
          String(durationSec),
          "-vf",
          vf,
          "-af",
          af,
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
          outPath,
        ]);
      } else {
        const vfSilent = speedPts || "null";
        await runFfmpeg([
          "-y",
          "-ss",
          String(trimIn),
          "-t",
          String(sourceLen),
          "-i",
          sourcePath,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-t",
          String(durationSec),
          "-vf",
          vfSilent,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
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
          outPath,
        ]);
      }

      const body = await readFile(outPath);
      if (body.byteLength < 64) {
        throw new Error("Processed media is empty.");
      }

      const created = await ctx.runMutation(
        internal.videoEditInternal.createDerivedMediaAsset,
        {
          userId,
          folderId: args.folderId,
          name,
          kind,
          mimeType: contentType,
        },
      );
      await putObject({
        path: created.bunnyPath,
        body,
        contentType,
      });
      await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
        assetId: created.assetId,
        byteSize: body.byteLength,
        durationSeconds: durationSec,
      });

      return {
        assetId: created.assetId,
        durationSec,
        speed,
        kind,
        name,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
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
    try {
      await runFfmpeg(["-version"]);
    } catch {
      throw new Error("Natural speed requires ffmpeg on the Convex action runtime.");
    }

    const trimIn = Math.max(0, args.trimIn);
    const trimOut = Math.max(trimIn + 0.05, args.trimOut);
    const sourceLen = Math.max(0.05, trimOut - trimIn);
    const speed = clipSpeedFromEffects({ speed: args.speed });
    const durationSec = Math.max(0.05, sourceLen / speed);

    if (isIdentitySpeed(speed)) {
      throw new Error("Natural speed bake is only needed when speed ≠ 1.");
    }

    const source = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
      userId,
      assetId: args.assetId,
    });
    if (!source?.bunnyPath) throw new Error("Source media not found.");

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 6;
    const speedKey = speed.toFixed(3);
    const cacheName = `${args.assetId}-${trimIn.toFixed(3)}-${trimOut.toFixed(3)}-${speedKey}.wav`;
    const bunnyPath = `users/${userId}/speed-audio-proxy/${cacheName}`;

    // Reuse cached bake when present (HEAD via signed GET is fine if put already).
    try {
      const existingUrl = await signBunnyCdnUrl(bunnyPath, expiresUnix);
      const head = await fetch(existingUrl, { method: "GET", headers: { Range: "bytes=0-1" } });
      if (head.ok || head.status === 206) {
        return { url: existingUrl, durationSec, speed };
      }
    } catch {
      /* bake fresh */
    }

    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-speed-audio-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      await downloadToFile(signedSource, sourcePath);
      const outPath = join(tempDir, "sped.wav");
      const naturalAf = buildNaturalSpeedAudioFilters(speed);
      await runFfmpeg([
        "-y",
        "-ss",
        String(trimIn),
        "-t",
        String(sourceLen),
        "-i",
        sourcePath,
        "-t",
        String(durationSec),
        "-vn",
        "-af",
        `${naturalAf},aformat=sample_fmts=s16:channel_layouts=stereo`,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "1",
        outPath,
      ]);
      const body = await readFile(outPath);
      if (body.byteLength < 64) throw new Error("Sped audio is empty.");
      await putObject({
        path: bunnyPath,
        body,
        contentType: "audio/wav",
      });
      const url = await signBunnyCdnUrl(bunnyPath, expiresUnix);
      return { url, durationSec, speed };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
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
    try {
      await runFfmpeg(["-version"]);
    } catch {
      throw new Error(
        "Frame pull requires ffmpeg on the Convex action runtime. Install ffmpeg on the action host, then retry.",
      );
    }

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
          // Local EditorClip.transitionOut.type is string; ops uses union — cast for lookup only.
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

    const source = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
      userId: args.userId,
      assetId: sourceAssetId,
    });
    if (!source?.bunnyPath) {
      throw new Error("Source media not found.");
    }

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-frame-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      const framePath = join(tempDir, "frame.jpg");
      await downloadToFile(signedSource, sourcePath);
      await runFfmpeg([
        "-y",
        "-ss",
        String(seekTime),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        framePath,
      ]);
      const body = await readFile(framePath);
      const timeLabel = seekTime.toFixed(2).replace(".", "s");
      const safeEdit = (row.name || "edit").replace(/[^\w.-]+/g, " ").trim().slice(0, 40) || "Edit";
      const filename = `Frame · ${safeEdit} · ${timeLabel}.jpg`;
      const dest: { folderId: Id<"folders">; folderPath: string } = await ctx.runMutation(
        internal.videoEditInternal.ensurePulledFramesFolder,
        {
          userId: args.userId,
          sourceFolderId: row.folderId,
        },
      );
      const prepared: { assetId: Id<"assets">; bunnyPath: string } = await ctx.runMutation(
        internal.videoEditInternal.createFrameAsset,
        {
          userId: args.userId,
          folderId: dest.folderId,
          name: filename,
        },
      );
      await putObject({
        path: prepared.bunnyPath,
        body,
        contentType: "image/jpeg",
      });
      await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
        assetId: prepared.assetId,
        byteSize: body.byteLength,
      });

      const viewExpires = Math.floor(Date.now() / 1000) + 60 * 60;
      const url = await signBunnyCdnUrl(prepared.bunnyPath, viewExpires);
      return {
        assetId: prepared.assetId,
        name: filename,
        folderId: dest.folderId,
        timeSec: args.assetId ? seekTime : timelineTime,
        sourceAssetId,
        url,
        thumbnailUrl: url,
        preferredViewUrl: url,
        expiresUnix: viewExpires,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});

type SampleAssetFramesResult = {
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

function sampleTimesInRange(startSec: number, endSec: number, count: number): number[] {
  const n = Math.max(1, Math.min(12, Math.floor(count)));
  if (n === 1) {
    return [(startSec + endSec) / 2];
  }
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    times.push(startSec + (i * (endSec - startSec)) / (n - 1));
  }
  return times;
}

/** Pull stills from a source video for agents (no edit project required). */
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
  handler: async (ctx, args): Promise<SampleAssetFramesResult> => {
    try {
      await runFfmpeg(["-version"]);
    } catch {
      throw new Error(
        "Frame pull requires ffmpeg on the Convex action runtime. Install ffmpeg on the action host, then retry.",
      );
    }

    const source: {
      bunnyPath?: string;
      name: string;
      folderId: Id<"folders">;
      kind: string;
      durationSeconds?: number;
    } | null = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
      userId: args.userId,
      assetId: args.assetId,
    });
    if (!source?.bunnyPath) throw new Error("Source media not found.");
    if (source.kind !== "video") {
      throw new Error("studio_pull_frames only works on video assets.");
    }

    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedSource = await signBunnyCdnUrl(source.bunnyPath, expiresUnix);
    const tempDir = await mkdtemp(join(tmpdir(), "studio-sample-"));
    try {
      const sourcePath = join(tempDir, "source.bin");
      await downloadToFile(signedSource, sourcePath);
      const probed = await probeMediaDurationSeconds(sourcePath);
      const durationSec: number =
        typeof source.durationSeconds === "number" && source.durationSeconds > 0.05
          ? source.durationSeconds
          : probed;

      const maxT = Math.max(0, durationSec - 0.05);
      let times: number[] = [];
      if (Array.isArray(args.timesSec) && args.timesSec.length > 0) {
        times = args.timesSec.map((t) => Math.max(0, Math.min(maxT, Number(t) || 0)));
      } else {
        const startRaw = typeof args.startSec === "number" ? args.startSec : 0;
        const endRaw = typeof args.endSec === "number" ? args.endSec : durationSec;
        let startSec = Math.max(0, Math.min(maxT, startRaw));
        let endSec = Math.max(0, Math.min(maxT, endRaw));
        if (endSec < startSec) {
          const swap = startSec;
          startSec = endSec;
          endSec = swap;
        }
        times = sampleTimesInRange(startSec, endSec, args.count ?? 3);
      }
      // de-dupe + cap
      times = [...new Set(times.map((t) => Math.round(t * 100) / 100))].slice(0, 12);

      const dest: { folderId: Id<"folders">; folderPath: string } = await ctx.runMutation(
        internal.videoEditInternal.ensurePulledFramesFolder,
        {
          userId: args.userId,
          sourceFolderId: source.folderId,
        },
      );

      const safeBase = (source.name || "clip").replace(/[^\w.-]+/g, " ").trim().slice(0, 36) || "clip";
      const frames: Array<{
        timeSec: number;
        assetId: Id<"assets">;
        name: string;
        url: string;
        thumbnailUrl: string;
        preferredViewUrl: string;
      }> = [];

      for (const seekTime of times) {
        const framePath = join(tempDir, `frame-${seekTime}.jpg`);
        await runFfmpeg([
          "-y",
          "-ss",
          String(seekTime),
          "-i",
          sourcePath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          framePath,
        ]);
        const body = await readFile(framePath);
        const timeLabel = seekTime.toFixed(2).replace(".", "s");
        const filename = `Frame · ${safeBase} · ${timeLabel}.jpg`;
        const prepared: { assetId: Id<"assets">; bunnyPath: string } = await ctx.runMutation(
          internal.videoEditInternal.createFrameAsset,
          {
            userId: args.userId,
            folderId: dest.folderId,
            name: filename,
          },
        );
        await putObject({
          path: prepared.bunnyPath,
          body,
          contentType: "image/jpeg",
        });
        await ctx.runMutation(internal.videoEditInternal.finalizeExportAsset, {
          assetId: prepared.assetId,
          byteSize: body.byteLength,
        });
        const url = await signBunnyCdnUrl(prepared.bunnyPath, expiresUnix);
        frames.push({
          timeSec: seekTime,
          assetId: prepared.assetId,
          name: filename,
          url,
          thumbnailUrl: url,
          preferredViewUrl: url,
        });
      }

      return {
        sourceAssetId: args.assetId,
        durationSec,
        folderId: dest.folderId,
        folderPath: dest.folderPath,
        frames,
        expiresUnix,
        viewHint:
          "Cursor Read preferredViewUrl on each frame. Prefer startSec+endSec+count for a window, or timesSec for exact hits. Stills land in Pulled Frames (sibling folder). See MCP resource studio://guides/pull-frames.",
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});
