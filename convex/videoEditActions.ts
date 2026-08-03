"use node";

import { execFile } from "node:child_process";
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
  timelineDurationSec,
  videoClipAudioFilter,
} from "./lib/editorExportAudio";
import {
  buildNaturalSpeedAudioFilters,
  buildSpeedSetptsFilter,
  clipSpeedFromEffects,
  isIdentitySpeed,
} from "./lib/naturalAudioSpeed";
import {
  DEFAULT_EXPORT_RESOLUTION,
  exportSizeForRatioAndResolution,
  normalizeExportResolution,
  type ExportResolution,
} from "./lib/editorExport";
import { clipAtPlayhead } from "./lib/editorProjectOps";

const execFileAsync = promisify(execFile);

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

function sourceTrim(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

function clipDuration(clip: EditorClip): number {
  return timelineDurationSec(clip);
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
}

function hexToFfmpegColor(hex?: string, alpha = 1): string {
  const raw = (hex ?? "#ffffff").replace("#", "");
  const a = Math.max(0, Math.min(1, alpha));
  if (raw.length === 6) {
    if (a >= 0.999) return `0x${raw}`;
    const aa = Math.round(a * 255).toString(16).padStart(2, "0");
    return `0x${raw}${aa}`;
  }
  return a >= 0.999 ? "white" : `white@${a.toFixed(3)}`;
}

function applyTextCase(text: string, mode?: TextClipContent["textCase"]): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") {
    return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return text;
}

function isLegacySystemFont(family: string | undefined): boolean {
  return (
    !family ||
    family === "system" ||
    family === "sans" ||
    family === "serif" ||
    family === "mono" ||
    family === "display"
  );
}

function xfadeTransition(type: string): string {
  return ffmpegTransitionFor(type);
}

const DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu";

function textFontFile(content: TextClipContent | undefined): string | null {
  const family = content?.fontFamily ?? "system";
  const bold = Boolean(content?.bold) || family === "display";
  const italic = Boolean(content?.italic);
  if (family === "mono") {
    if (bold && italic) return `${DEJAVU_DIR}/DejaVuSansMono-BoldOblique.ttf`;
    if (bold) return `${DEJAVU_DIR}/DejaVuSansMono-Bold.ttf`;
    if (italic) return `${DEJAVU_DIR}/DejaVuSansMono-Oblique.ttf`;
    return `${DEJAVU_DIR}/DejaVuSansMono.ttf`;
  }
  if (family === "serif") {
    if (bold) return `${DEJAVU_DIR}/DejaVuSerif-Bold.ttf`;
    return `${DEJAVU_DIR}/DejaVuSerif.ttf`;
  }
  // system / sans / display
  if (bold) return `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`;
  return `${DEJAVU_DIR}/DejaVuSans.ttf`;
}

function normalizeTextPose(effects: ClipEffects | undefined): {
  scale: number;
  x: number;
  y: number;
  rotation: number;
} {
  const hasPose =
    Boolean(effects) &&
    (effects?.x !== undefined ||
      effects?.y !== undefined ||
      effects?.scale !== undefined ||
      effects?.rotation !== undefined);
  if (!hasPose) {
    return { scale: 1, x: 0, y: 0.32, rotation: 0 };
  }
  return {
    scale: Math.min(4, Math.max(0.2, Number(effects?.scale) || 1)),
    x: Math.min(1.5, Math.max(-1.5, Number(effects?.x) || 0)),
    y: Math.min(1.5, Math.max(-1.5, Number(effects?.y) || 0)),
    rotation: Number(effects?.rotation) || 0,
  };
}

async function buildSegmentVideoFilters(
  clip: EditorClip,
  duration: number,
  textClips: EditorClip[],
  fontCacheDir: string,
): Promise<string> {
  const parts: string[] = [];
  // Per-clip picture fades (independent of transitions between clips).
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
  if (fadeIn > 0.001) {
    parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}:curve=qsin`);
  }
  if (fadeOut > 0.001) {
    const st = Math.max(0, dur - fadeOut);
    parts.push(`fade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}:curve=qsin`);
  }

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + duration;
  for (const textClip of textClips) {
    const rawText = textClip.text?.text?.trim();
    if (!rawText) continue;
    const textStart = textClip.startTime;
    const textEnd = textClip.startTime + clipDuration(textClip);
    if (textEnd <= clipStart || textStart >= clipEnd) continue;

    const localStart = Math.max(0, textStart - clipStart);
    const localEnd = Math.min(duration, textEnd - clipStart);
    const content = textClip.text;
    const text = applyTextCase(rawText, content?.textCase);
    const pose = normalizeTextPose(textClip.effects);
    const fontSize = Math.max(12, Math.min(600, Math.round((content?.fontSize ?? 42) * pose.scale)));
    const styleAlpha = Math.max(0, Math.min(1, Number(content?.opacity) ?? 1));
    const color = hexToFfmpegColor(content?.color, styleAlpha);
    const align = content?.align ?? "center";
    const vAlign = content?.verticalAlign ?? "middle";
    const strokeWidth = Math.max(0, Math.round(Number(content?.strokeWidth) || 0));
    const strokeColor = hexToFfmpegColor(content?.strokeColor ?? "#000000", styleAlpha);
    let fontfile = textFontFile(content);
    if (!isLegacySystemFont(content?.fontFamily) && content?.fontFamily) {
      const google = await resolveGoogleFontFile(
        content.fontFamily,
        Boolean(content.bold),
        fontCacheDir,
      );
      if (google) fontfile = google;
    }
    const anchorX = `w*(0.5+${pose.x.toFixed(4)})`;
    const anchorY = `h*(0.5+${pose.y.toFixed(4)})`;
    let xExpr =
      align === "left"
        ? anchorX
        : align === "right"
          ? `${anchorX}-text_w`
          : `${anchorX}-text_w/2`;
    const yExpr =
      vAlign === "top"
        ? anchorY
        : vAlign === "bottom"
          ? `${anchorY}-text_h`
          : `${anchorY}-text_h/2`;
    if (content?.flipX) {
      xExpr =
        align === "left"
          ? `${anchorX}-text_w`
          : align === "right"
            ? anchorX
            : `${anchorX}-text_w/2`;
    }
    const opts = [
      `text='${escapeDrawtext(text)}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      `x=${xExpr}`,
      `y=${yExpr}`,
      `enable='between(t\,${localStart.toFixed(3)}\,${localEnd.toFixed(3)})'`,
    ];
    if (fontfile) {
      opts.push(`fontfile='${fontfile.replace(/'/g, "\\'")}'`);
    }
    if (strokeWidth > 0) {
      opts.push(`borderw=${strokeWidth}`);
      opts.push(`bordercolor=${strokeColor}`);
    }
    if (content?.backgroundColor) {
      const pad = Math.max(0, Math.round(Number(content.backgroundPadding) || 8));
      opts.push("box=1");
      opts.push(`boxcolor=${hexToFfmpegColor(content.backgroundColor, styleAlpha)}`);
      opts.push(`boxborderw=${pad}`);
    }
    if (content?.shadowColor) {
      opts.push(`shadowcolor=${hexToFfmpegColor(content.shadowColor, styleAlpha)}`);
      opts.push(`shadowx=${Math.round(Number(content.shadowOffsetX) || 0)}`);
      opts.push(`shadowy=${Math.round(Number(content.shadowOffsetY) || 2)}`);
    } else if (content?.glow) {
      opts.push(
        `shadowcolor=${hexToFfmpegColor(content.glowColor ?? "#ffffff", styleAlpha * 0.7)}`,
      );
      opts.push("shadowx=0");
      opts.push("shadowy=0");
    }
    if (Math.abs(pose.rotation) > 0.05) {
      const rad = (-pose.rotation * Math.PI) / 180;
      opts.push(`angle=${rad.toFixed(5)}`);
    }
    parts.push(`drawtext=${opts.join(":")}`);
  }

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

  const audioFilter = videoClipAudioFilter(args.clip, Boolean(args.muteAudio), args.duration);
  // ffmpeg silently emits a video-only file when `-af` matches no audio, so
  // probe first: silent / muted sources must get anullsrc or concat/xfade
  // graphs fail with "Stream specifier ':a' matches no streams".
  const sourceLen = sourceTrim(args.clip);
  const inputTrimArgs =
    isIdentitySpeed(clipSpeedFromEffects(args.clip.effects))
      ? ["-ss", String(args.clip.trimIn), "-i", args.sourcePath]
      : ["-ss", String(args.clip.trimIn), "-t", String(sourceLen), "-i", args.sourcePath];
  if (audioFilter && (await hasAudioStream(args.sourcePath))) {
    await execFileAsync("ffmpeg", [
      "-y",
      ...inputTrimArgs,
      "-vf",
      videoFilter,
      "-af",
      audioFilter,
      ...encodeArgs,
    ]);
  } else {
    await execFileAsync("ffmpeg", [
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
    const bedFilters = bedClipAudioFilters(clip, duration);
    let chain = `[${inputIndex}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS`;
    if (bedFilters) chain += `,${bedFilters}`;
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
    exportResolution?: ExportResolution;
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
  const resolution = normalizeExportResolution(
    args.exportResolution ?? DEFAULT_EXPORT_RESOLUTION,
  );
  const { width: exportWidth, height: exportHeight } = exportSizeForRatioAndResolution(
    project.frameRatio,
    resolution,
  );
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
  const fontCacheDir = join(tempDir, "fonts");
  await mkdir(fontCacheDir, { recursive: true });
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
          fontCacheDir,
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
    const rawName = (args.name || "export").replace(/\.(mp4|mov|webm)$/i, "");
    const filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}.mp4`;
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

const exportResolutionValidator = v.union(
  v.literal("720p"),
  v.literal("1080p"),
  v.literal("4K"),
);

export const exportVideo = action({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
    folderId: v.id("folders"),
    name: v.string(),
    project: v.any(),
    exportResolution: v.optional(exportResolutionValidator),
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
      exportResolution: args.exportResolution,
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
    });
  },
});

/**
 * Cut a single asset to [trimIn, trimOut] and return a short-lived download URL.
 * Used by the editor clip context menu (Save as video / Save as audio).
 */
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
    try {
      await execFileAsync("ffmpeg", ["-version"]);
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
        await execFileAsync("ffmpeg", audioArgs);
      } else if (await hasAudioStream(sourcePath)) {
        const vf = speedPts || "null";
        const af = naturalAf || "anull";
        await execFileAsync("ffmpeg", [
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
        await execFileAsync("ffmpeg", [
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
      await execFileAsync("ffmpeg", ["-version"]);
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
        await execFileAsync("ffmpeg", audioArgs);
      } else if (await hasAudioStream(sourcePath)) {
        const vf = speedPts || "null";
        const af = naturalAf || "anull";
        await execFileAsync("ffmpeg", [
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
        await execFileAsync("ffmpeg", [
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
      await execFileAsync("ffmpeg", ["-version"]);
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
      await execFileAsync("ffmpeg", [
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
      await execFileAsync("ffmpeg", ["-version"]);
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
      await execFileAsync("ffmpeg", [
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
      const prepared: { assetId: Id<"assets">; bunnyPath: string } = await ctx.runMutation(
        internal.videoEditInternal.createFrameAsset,
        {
          userId: args.userId,
          folderId: row.folderId,
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
        folderId: row.folderId,
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
