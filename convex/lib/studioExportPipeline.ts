"use node";

/**
 * Timeline ffmpeg export. Runs on the VPS ffmpeg worker, not inside Convex.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioExportHost } from "./studioExportHost";
import { ffmpegTransitionFor } from "./editorEffectContract";
import { ffmpegFitAspect, resolveFitMode } from "./clipFit";
import {
  collectExportAudioBeds,
  collectExportVideoSoundtracks,
  concatAvFilter,
  mixSourceAudioFilters,
  exportCoverUntilSec,
  timelineDurationSec,
  transitionAudioMixFilter,
  videoClipAudioFilter,
} from "./editorExportAudio";
import {
  clipSourceInputArgs,
  collectExportPictureClips,
  exportVisualStackBottomToTop,
  isStillExportSource,
  pictureClipDuration,
  pictureFadeFilterParts,
  pictureTimelineSegments,
  safeContainVf,
  segmentTransitionClip,
  type ExportPictureClip,
} from "./editorExportPicture";
import {
  buildNaturalSpeedAudioFilters,
  buildSpeedSetptsFilter,
  clipSpeedFromEffects,
  isIdentitySpeed,
} from "./naturalAudioSpeed";
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
} from "./editorExport";
import {
  buildTextOverlayFilter,
  collectExportTextClips,
  ffmpegFailMessage,
  isLegacySystemFont,
  textFontFile,
  type ExportTextClip,
} from "./editorExportText";
import {
  downloadToFile,
  hasAudioStream,
  hasVideoStream,
  probeAudioStream,
  probeMediaDurationSeconds,
  probePictureStream,
  runFfmpeg,
  runFfprobe,
  withFfmpegProgress,
} from "./studioFfmpeg";

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
  fitMode?: "contain" | "cover";
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
  tracks: Array<{
    id: string;
    kind: "video" | "audio" | "text";
    muted?: boolean;
    hidden?: boolean;
  }>;
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
  /**
   * A clip crossed by another picture lane renders as several segments, so the
   * segment is not always the whole clip and does not always start where the
   * clip starts. Text timing and fades both need the real offsets.
   */
  opts?: {
    segmentStartSec?: number;
    localStartSec?: number;
    clipDurationSec?: number;
    overlay?: boolean;
  },
): Promise<string> {
  const parts: string[] = [];
  const localStart = Math.max(0, Number(opts?.localStartSec) || 0);
  const segmentStart = Number.isFinite(opts?.segmentStartSec)
    ? Number(opts?.segmentStartSec)
    : clip.startTime;
  // Video `fade` has no `curve` option (that's afade-only). Passing curve=qsin
  // crashes export on the action host: "Option not found".
  parts.push(
    ...pictureFadeFilterParts({
      effects: clip.effects,
      clipDurationSec: Number(opts?.clipDurationSec) || localStart + duration,
      localStartSec: localStart,
      segmentDurationSec: duration,
      overlay: opts?.overlay,
    }),
  );
  parts.push(...(await buildTextOverlayParts(textClips, segmentStart, duration, fontCacheDir)));
  return parts.length ? parts.join(",") : "null";
}

const EXPORT_FPS = 30;

/**
 * Contain-crop to the project frame so every segment matches export canvas.
 * Overlay layers use a transparent pad + rgba so PNG cutouts reveal underlays.
 */
function normalizeVf(
  width: number,
  height: number,
  effects?: ClipEffects,
  opts?: { overlay?: boolean; kind?: string },
): string {
  // Draft effects.speed is process-on-demand (bake → new asset). Do not setpts here.
  const overlay = Boolean(opts?.overlay);
  const padColor = overlay ? "black@0" : "black";
  const outFormat = overlay ? "rgba" : "yuv420p";
  const scale = Number.isFinite(effects?.scale) ? Number(effects?.scale) : 1;
  const panX = Number.isFinite(effects?.x) ? Number(effects?.x) : 0;
  const panY = Number.isFinite(effects?.y) ? Number(effects?.y) : 0;
  const rotation = Number.isFinite(effects?.rotation) ? Number(effects?.rotation) : 0;
  const safeScale = Math.min(4, Math.max(0, Number.isFinite(scale) ? scale : 1));
  if (safeScale < 0.005) {
    return `scale=2:2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${padColor},fps=${EXPORT_FPS},setsar=1,format=${outFormat}`;
  }
  const scaledW = Math.max(2, Math.round(width * safeScale));
  const scaledH = Math.max(2, Math.round(height * safeScale));
  const panPxX = Math.round(panX * width);
  const panPxY = Math.round(panY * height);
  const fitMode = resolveFitMode(effects, opts?.kind);
  const filters = [
    `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=${ffmpegFitAspect(fitMode)}`,
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  ];
  if (Math.abs(rotation) > 0.05) {
    // FFmpeg positive angles are CCW; editor/CSS positive is CW.
    const rad = (-rotation * Math.PI) / 180;
    filters.push(`rotate=${rad}:c=black@0:ow=rotw(iw):oh=roth(ih)`);
  }
  filters.push(
    `crop='min(iw,${width})':'min(ih,${height})':'max(0,min(iw-${width},(iw-${width})/2-${panPxX}))':'max(0,min(ih-${height},(ih-${height})/2-${panPxY}))'`,
    `pad=${width}:${height}:'max(0,min(ow-iw,(ow-iw)/2+${panPxX}))':'max(0,min(oh-ih,(oh-ih)/2+${panPxY}))':${padColor}`,
    `fps=${EXPORT_FPS}`,
    "setsar=1",
    `format=${outFormat}`,
  );
  const opacity = Number(effects?.opacity);
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 1;
  if (safeOpacity < 0.999) {
    filters.splice(
      filters.length - 1,
      0,
      overlay
        ? `colorchannelmixer=aa=${safeOpacity.toFixed(4)}`
        : `lutrgb=r='val*${safeOpacity.toFixed(4)}':g='val*${safeOpacity.toFixed(4)}':b='val*${safeOpacity.toFixed(4)}'`,
    );
  }
  return filters.join(",");
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
  /** Segment start on the timeline — defaults to the clip start (unsplit clip). */
  segmentStartSec?: number;
  /** Segment start measured from the clip start, for clips split by another lane. */
  localStartSec?: number;
  /** Full timeline length of the clip, when this segment is only a slice of it. */
  clipDurationSec?: number;
}): Promise<void> {
  const localStart = Math.max(0, Number(args.localStartSec) || 0);
  const clipDurationSec = Math.max(
    0.05,
    Number(args.clipDurationSec) || localStart + args.duration,
  );
  const effects = await buildSegmentVideoFilters(
    args.clip,
    args.duration,
    args.textClips,
    args.fontCacheDir,
    {
      segmentStartSec: args.segmentStartSec,
      localStartSec: localStart,
      clipDurationSec,
    },
  );
  const baseVf = normalizeVf(args.width, args.height, args.clip.effects, {
    kind: args.clip.kind,
  });
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
    { localStartSec: localStart, clipDurationSec },
  );
  // ffmpeg silently emits a video-only file when `-af` matches no audio, so
  // probe first: silent / muted sources must get anullsrc or concat/xfade
  // graphs fail with "Stream specifier ':a' matches no streams".
  const sourceLen = Math.max(0.05, sourceTrim(args.clip) - localStart);
  const inputTrimArgs = clipSourceInputArgs({
    sourcePath: args.sourcePath,
    // A lane crossing this clip splits it — seek to where the piece really starts.
    trimIn: args.clip.trimIn + localStart,
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

/**
 * Composite bottom→top picture lanes into one silent segment (audio mixed later).
 * Single-layer stacks reuse renderClipSegment for fades/text.
 */
async function renderStackedPictureSegment(args: {
  layers: Array<{ clip: ExportPictureClip; sourcePath: string }>;
  dest: string;
  startTime: number;
  duration: number;
  textClips: ExportTextClip[];
  width: number;
  height: number;
  fontCacheDir: string;
  /**
   * Lane whose soundtrack rides along with the picture. It has to stay embedded
   * so a transition dip lands on the same frames as the xfade; every other lane
   * is mixed in later as a bed.
   */
  audioTrackId: string | null;
  mutedTrackIds: ReadonlySet<string>;
}): Promise<void> {
  const { layers, dest, duration, width, height } = args;
  if (layers.length === 0) {
    throw new Error("Nothing to composite.");
  }
  const ownsAudio = (clip: ExportPictureClip) =>
    clip.trackId === args.audioTrackId && !args.mutedTrackIds.has(clip.trackId);

  const visual = exportVisualStackBottomToTop(
    layers.map((layer) => layer.clip),
    args.textClips,
    args.startTime,
    duration,
  );
  const pictureIndexById = new Map(
    layers.map((layer, index) => [layer.clip.id, index] as const),
  );
  const visualIndexByPictureId = new Map<string, number>();
  visual.forEach((item, index) => {
    if (item.kind === "picture") visualIndexByPictureId.set(item.clip.id, index);
  });

  const inputArgs: string[] = [];
  const graphParts: string[] = [];
  let audioChain: string | null = null;
  for (const [index, layer] of layers.entries()) {
    const picture = await probePictureStream(layer.sourcePath);
    const sourceDurationSec = picture.present
      ? await probeMediaDurationSeconds(layer.sourcePath)
      : 0;
    const isStill = isStillExportSource({
      kind: layer.clip.kind,
      codec: picture.codec,
      nbFrames: picture.nbFrames,
      sourceDurationSec,
    });
    const clipDurationSec = pictureClipDuration(layer.clip);
    const localStart = Math.max(0, args.startTime - layer.clip.startTime);
    const sourceLen = Math.max(0.05, layer.clip.trimOut - layer.clip.trimIn - localStart);
    const trimIn = isStill ? 0 : layer.clip.trimIn + localStart;
    inputArgs.push(
      ...clipSourceInputArgs({
        sourcePath: layer.sourcePath,
        trimIn,
        sourceLen,
        identitySpeed: isIdentitySpeed(clipSpeedFromEffects(layer.clip.effects)),
        isStill,
        fps: EXPORT_FPS,
      }),
    );

    const overlay = (visualIndexByPictureId.get(layer.clip.id) ?? index) > 0;
    const chain = [
      normalizeVf(width, height, layer.clip.effects, {
        overlay,
        kind: layer.clip.kind,
      }),
    ];
    chain.push(
      ...pictureFadeFilterParts({
        effects: layer.clip.effects,
        clipDurationSec,
        localStartSec: localStart,
        segmentDurationSec: duration,
        overlay,
      }),
    );
    graphParts.push(`[${index}:v]${chain.join(",")}[v${index}]`);

    if (!audioChain && ownsAudio(layer.clip) && picture.present && !isStill) {
      const sourceAudio = await probeAudioStream(layer.sourcePath);
      const audioFilter = videoClipAudioFilter(
        layer.clip as unknown as EditorClip,
        false,
        duration,
        sourceAudio.channels,
        { localStartSec: localStart, clipDurationSec },
      );
      if (audioFilter && sourceAudio.present) {
        audioChain = `[${index}:a]${audioFilter},apad[aout]`;
      }
    }
  }

  const visualPaint = visual;
  let cur: string | null = null;
  let step = 0;
  const nextLabel = () => {
    const label = `vx${step}`;
    step += 1;
    return label;
  };
  if (visualPaint.length === 0 && layers.length > 0) {
    cur = "v0";
  }
  for (const item of visualPaint) {
    if (item.kind === "picture") {
      const index = pictureIndexById.get(item.clip.id);
      if (index == null) continue;
      const src = `v${index}`;
      if (!cur) {
        cur = src;
        continue;
      }
      const next = nextLabel();
      graphParts.push(`[${cur}][${src}]overlay=0:0:format=auto[${next}]`);
      cur = next;
      continue;
    }
    const fontfile = await resolveExportFontFile(item.clip.text, args.fontCacheDir);
    const textFileName = join(
      args.fontCacheDir,
      `overlay-${item.clip.id || "text"}-${args.startTime.toFixed(3)}.txt`,
    );
    const built = buildTextOverlayFilter({
      clip: item.clip,
      segmentStart: args.startTime,
      segmentDuration: duration,
      fontfile,
      textFileName,
    });
    if (!built) continue;
    await writeFile(textFileName, built.textFileBody, "utf8");
    if (!cur) {
      graphParts.push(
        `color=c=black:s=${width}x${height}:d=${duration}:r=${EXPORT_FPS},format=yuv420p[vbase]`,
      );
      cur = "vbase";
    }
    const next = nextLabel();
    graphParts.push(`[${cur}]${built.filter}[${next}]`);
    cur = next;
  }
  if (!cur) {
    graphParts.push(
      `color=c=black:s=${width}x${height}:d=${duration}:r=${EXPORT_FPS},format=yuv420p[vbase]`,
    );
    cur = "vbase";
  }
  graphParts.push(`[${cur}]format=yuv420p,setsar=1[vout]`);
  if (audioChain) graphParts.push(audioChain);

  await runFfmpeg([
    "-y",
    ...inputArgs,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    graphParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    audioChain ? "[aout]" : `${layers.length}:a`,
    "-t",
    String(duration),
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
  onProgress?: (ratio: number) => void,
): Promise<void> {
  let current = segmentPaths[0]!;
  const steps = Math.max(1, segmentPaths.length - 1);
  for (let i = 1; i < segmentPaths.length; i += 1) {
    const outPath = join(tempDir, `pair-cut-${i}.mp4`);
    const pairDur =
      (await probeMediaDurationSeconds(current)) +
      (await probeMediaDurationSeconds(segmentPaths[i]!));
    await withFfmpegProgress(
      {
        durationSec: Math.max(0.05, pairDur),
        onProgress: (ratio) =>
          onProgress?.((i - 1 + Math.max(0, Math.min(1, ratio))) / steps),
      },
      () => concatSegmentsHardCut([current, segmentPaths[i]!], outPath, width, height),
    );
    current = outPath;
  }
  await runFfmpeg(["-y", "-i", current, "-c", "copy", "-movflags", "+faststart", dest]);
  onProgress?.(1);
}

async function concatNormalizedSegments(
  segmentPaths: string[],
  transitionClips: Array<EditorClip | null>,
  tempDir: string,
  width: number,
  height: number,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const outputPath = join(tempDir, "video-composed.mp4");
  // Segments are already canvas-sized. Re-running normalizeVf at 4K
  // (scale+crop+pad+xfade) OOMs the action host; 1080 can afford the safety pass.
  const vf = isHeavyExportFrame(width, height)
    ? `fps=${EXPORT_FPS},setsar=1,format=yuv420p`
    : normalizeVf(width, height);
  const notify = (ratio: number) => onProgress?.(Math.max(0, Math.min(1, ratio)));
  const padded: string[] = [];
  for (const [index, path] of segmentPaths.entries()) {
    padded.push(
      await ensureSegmentAv(path, join(tempDir, `seg-av-${index}.mp4`), width, height),
    );
    notify(((index + 1) / Math.max(1, segmentPaths.length)) * 0.08);
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
    notify(1);
    return outputPath;
  }

  const hasTransition = transitionClips.some(
    (clip, index) =>
      index < transitionClips.length - 1 &&
      clip?.transitionOut?.type &&
      clip.transitionOut.type !== "none",
  );

  if (!hasTransition) {
    const totalDur = (
      await Promise.all(padded.map((path) => probeMediaDurationSeconds(path)))
    ).reduce((sum, value) => sum + value, 0);
    if (isHeavyExportFrame(width, height)) {
      await stitchPairwiseHardCut(padded, outputPath, tempDir, width, height, notify);
    } else {
      await withFfmpegProgress(
        { durationSec: Math.max(0.05, totalDur), onProgress: notify },
        () => concatSegmentsHardCut(padded, outputPath, width, height),
      );
    }
    notify(1);
    return outputPath;
  }

  // Pairwise xfade into intermediate files. If a wipe fails, hard-cut the rest.
  try {
    let currentPath = padded[0]!;
    let currentDuration = await probeMediaDurationSeconds(currentPath);

    const steps = Math.max(1, padded.length - 1);
    for (let i = 1; i < padded.length; i++) {
      const nextPath = padded[i]!;
      const prevClip = transitionClips[i - 1];
      const transition = prevClip?.transitionOut;
      const nextDuration = await probeMediaDurationSeconds(nextPath);
      const outPath = join(tempDir, `pair-${i}.mp4`);
      const pairProgress = (ratio: number) =>
        notify((i - 1 + Math.max(0, Math.min(1, ratio))) / steps);

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
          await withFfmpegProgress(
            {
              durationSec: Math.max(0.05, currentDuration + nextDuration - duration),
              onProgress: pairProgress,
            },
            () =>
              runFfmpeg([
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
              ]),
          );
          currentDuration = currentDuration + nextDuration - duration;
        } catch {
          await withFfmpegProgress(
            {
              durationSec: Math.max(0.05, currentDuration + nextDuration),
              onProgress: pairProgress,
            },
            () => concatSegmentsHardCut([currentPath, nextPath], outPath, width, height),
          );
          currentDuration += nextDuration;
        }
      } else {
        await withFfmpegProgress(
          {
            durationSec: Math.max(0.05, currentDuration + nextDuration),
            onProgress: pairProgress,
          },
          () => concatSegmentsHardCut([currentPath, nextPath], outPath, width, height),
        );
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
    notify(1);
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
  getAssetBunnyPath: (assetId: string) => Promise<string | null>;
  signCdnUrl: (path: string, expiresUnix: number) => Promise<string>;
  expiresUnix: number;
  tempDir: string;
  /** Full timeline length (video may already include black tail for late beds). */
  targetDurationSec?: number;
  onProgress?: (ratio: number) => void;
}): Promise<string> {
  const { videoPath, audioClips, getAssetBunnyPath, signCdnUrl, expiresUnix, tempDir } = args;
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
    const bunnyPath = await getAssetBunnyPath(clip.assetId);
    if (!bunnyPath) continue;
    const url = await signCdnUrl(bunnyPath, expiresUnix);
    // Detached beds reuse the video asset — keep a neutral extension; ffmpeg probes content.
    const sourcePath = join(tempDir, `audio-source-${index}.bin`);
    await downloadToFile(url, sourcePath);
    const bedAudio = await probeAudioStream(sourcePath);
    if (!bedAudio.present) continue;
    audioInputs.push("-i", sourcePath);
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const duration = clipDuration(clip);
    bedEnd = Math.max(bedEnd, clip.startTime + duration);
    const bedFilters = mixSourceAudioFilters(clip, duration, bedAudio.channels);
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
    await withFfmpegProgress(
      { durationSec: Math.max(0.05, targetDuration), onProgress: (ratio) => args.onProgress?.(ratio) },
      () =>
        runFfmpeg([
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
        ]),
    );
  } catch (error) {
    throw new Error(ffmpegFailMessage(error, "Could not mix audio onto the export."));
  }
  return outputPath;
}

export async function runStudioExport(
  host: StudioExportHost,
  userId: string,
  args: {
    projectId?: string;
    folderId: string;
    name: string;
    project: EditorProject;
    exportResolution?: ExportResolution;
    exportKind?: "video" | "audio";
    audioFormat?: ExportAudioFormat;
    jobId?: string;
  },
): Promise<{ assetId: string }> {
  const report = async (phase: string, progress: number) => {
    if (!args.jobId) return;
    try {
      await host.patchProgress(args.jobId, phase, progress);
    } catch {
      // Progress is best-effort; never fail the export on reporting.
    }
  };
  let lastPct = -1;
  let lastAt = 0;
  let reportChain = Promise.resolve();
  const setProgress = (phase: string, progress: number) => {
    const pct = Math.max(0, Math.min(99, Math.floor(progress)));
    const now = Date.now();
    if (pct < lastPct) return;
    if (pct === lastPct && now - lastAt < 400) return;
    lastPct = pct;
    lastAt = now;
    reportChain = reportChain.then(() => report(phase, pct)).catch(() => {});
  };
  const lerp = (from: number, to: number, t: number) =>
    from + (to - from) * Math.max(0, Math.min(1, t));

  try {
    await runFfmpeg(["-version"]);
    await runFfprobe(["-version"]);
  } catch {
    const message =
      "Export requires ffmpeg and ffprobe on the Studio ffmpeg worker.";
    if (args.jobId) {
      await host.failJob(args.jobId, message);
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
  const videoTracks = project.tracks.filter((track) => track.kind === "video");
  if (!videoTracks.length) {
    const message = "No video track in project.";
    if (args.jobId) {
      await host.failJob(args.jobId, message);
    }
    throw new Error(message);
  }

  const pictureClips = collectExportPictureClips(project);
  const hiddenTrackIds = new Set(
    project.tracks.filter((track) => track.hidden).map((track) => track.id),
  );
  const trackIndexById = new Map(
    project.tracks.map((track, index) => [track.id, index] as const),
  );

  const textClips =
    exportKind === "video"
      ? collectExportTextClips(
          project.clips.filter(
            (clip) => !clip.trackId || !hiddenTrackIds.has(clip.trackId),
          ),
          (clip) =>
            Math.max(0.05, Number(clip.trimOut ?? 3) - Number(clip.trimIn ?? 0) || 3),
          trackIndexById,
        )
      : [];
  // The top video lane with picture keeps its soundtrack inside the segments, so a
  // transition dip stays locked to the xfade that shortens the picture. Lanes below
  // it are mixed in afterwards as beds.
  const pictureTrackIds = new Set(pictureClips.map((clip) => clip.trackId));
  const audioBaseTrackId =
    videoTracks.find((track) => pictureTrackIds.has(track.id))?.id ?? null;
  const mutedTrackIds = new Set(
    project.tracks.filter((track) => track.muted).map((track) => track.id),
  );
  const audioClips = [
    ...collectExportAudioBeds(project),
    ...collectExportVideoSoundtracks(project, audioBaseTrackId),
  ];
  const coverUntil = exportCoverUntilSec({
    textEnds: textClips.map((clip) => clip.startTime + clip.duration),
    audioClips,
  });

  if (!pictureClips.length && coverUntil <= 0.02) {
    const message = "Add a video or audio clip before exporting.";
    if (args.jobId) {
      await host.failJob(args.jobId, message);
    }
    throw new Error(message);
  }

  const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60;
  const tempDir = await mkdtemp(join(tmpdir(), "studio-edit-"));
  const fontCacheDir = join(tempDir, "fonts");
  await mkdir(fontCacheDir, { recursive: true });
  const segmentPaths: string[] = [];
  const transitionClips: Array<EditorClip | null> = [];
  const clipById = new Map(project.clips.map((clip) => [clip.id, clip]));
  const sourceCache = new Map<string, string>();

  try {
    await report("Preparing clips…", 2);
    setProgress("Exporting", 2);
    // coverUntil pads black after the last video so trailing audio/text still render.
    const segments = pictureTimelineSegments(pictureClips, coverUntil);
    if (!segments.length) {
      throw new Error("Nothing to export on the timeline.");
    }
    const segmentWeights = segments.map((segment) => Math.max(0.05, segment.duration));
    const segmentWeightTotal = segmentWeights.reduce((sum, value) => sum + value, 0);
    let weightDone = 0;
    const RENDER_FROM = 3;
    const RENDER_TO = 62;
    for (const [index, segment] of segments.entries()) {
      const segmentPath = join(tempDir, `segment-${index}.mp4`);
      const weight = segmentWeights[index]!;
      const segFrom = lerp(RENDER_FROM, RENDER_TO, weightDone / segmentWeightTotal);
      const segTo = lerp(RENDER_FROM, RENDER_TO, (weightDone + weight) / segmentWeightTotal);
      const encodeFrom = lerp(segFrom, segTo, 0.12);
      if (segment.type === "gap") {
        const textParts = await buildTextOverlayParts(
          [...textClips].sort(
            (a, b) => (b.trackIndex ?? 0) - (a.trackIndex ?? 0),
          ),
          segment.startTime,
          segment.duration,
          fontCacheDir,
        );
        await withFfmpegProgress(
          {
            durationSec: Math.max(0.05, segment.duration),
            onProgress: (ratio) => setProgress("Exporting", lerp(segFrom, segTo, ratio)),
          },
          () =>
            makeBlackSegment(
              segmentPath,
              segment.duration,
              exportWidth,
              exportHeight,
              textParts,
            ),
        );
        transitionClips.push(null);
      } else {
        const resolvedLayers: Array<{ clip: ExportPictureClip; sourcePath: string }> = [];
        for (const layer of segment.layers) {
          let sourcePath = sourceCache.get(layer.assetId);
          if (!sourcePath) {
            const asset = await host.getAssetForExport(userId, String(layer.assetId));
            if (!asset?.bunnyPath) {
              throw new Error(`Missing media for clip "${layer.label}".`);
            }
            const url = await host.signCdnUrl(asset.bunnyPath, expiresUnix);
            sourcePath = join(tempDir, `source-${layer.assetId}.bin`);
            await downloadToFile(url, sourcePath, (ratio) =>
              setProgress("Exporting", lerp(segFrom, encodeFrom, ratio)),
            );
            sourceCache.set(layer.assetId, sourcePath);
          }
          resolvedLayers.push({ clip: layer, sourcePath });
        }
        await withFfmpegProgress(
          {
            durationSec: Math.max(0.05, segment.duration),
            onProgress: (ratio) => setProgress("Exporting", lerp(encodeFrom, segTo, ratio)),
          },
          () =>
            renderStackedPictureSegment({
              layers: resolvedLayers,
              dest: segmentPath,
              startTime: segment.startTime,
              duration: segment.duration,
              textClips,
              width: exportWidth,
              height: exportHeight,
              fontCacheDir,
              audioTrackId: audioBaseTrackId,
              mutedTrackIds,
            }),
        );
        const transitionClip = segmentTransitionClip(segment);
        transitionClips.push(
          transitionClip ? (clipById.get(transitionClip.id) ?? null) : null,
        );
      }
      segmentPaths.push(segmentPath);
      weightDone += weight;
      setProgress("Exporting", segTo);
    }

    setProgress("Exporting", 62);
    let composedPath: string;
    try {
      composedPath = await concatNormalizedSegments(
        segmentPaths,
        transitionClips,
        tempDir,
        exportWidth,
        exportHeight,
        (ratio) => setProgress("Exporting", lerp(62, 82, ratio)),
      );
    } catch (error) {
      throw new Error(
        ffmpegFailMessage(error, "Could not stitch the timeline together."),
      );
    }
    setProgress("Exporting", 82);
    composedPath = await mixAudioTrack({
      videoPath: composedPath,
      audioClips,
      getAssetBunnyPath: async (assetId) => {
        const asset = await host.getAssetForExport(userId, String(assetId));
        return asset?.bunnyPath ?? null;
      },
      signCdnUrl: (path, exp) => host.signCdnUrl(path, exp),
      expiresUnix,
      tempDir,
      targetDurationSec: coverUntil,
      onProgress: (ratio) => setProgress("Exporting", lerp(82, 92, ratio)),
    });

    let body: Buffer;
    let filename: string;
    let mimeType: string;
    let kind: "video" | "audio";

    if (exportKind === "audio") {
      setProgress("Exporting", 92);
      const audioOut = join(tempDir, `export-audio${audioExportExt(audioFormat)}`);
      const codecArgs =
        audioFormat === "wav"
          ? ["-vn", "-c:a", "pcm_s16le"]
          : audioFormat === "m4a"
            ? ["-vn", "-c:a", "aac", "-b:a", EXPORT_AUDIO_BITRATE]
            : ["-vn", "-c:a", "libmp3lame", "-b:a", EXPORT_AUDIO_BITRATE];
      const audioDur = await probeMediaDurationSeconds(composedPath);
      await withFfmpegProgress(
        {
          durationSec: Math.max(0.05, audioDur),
          onProgress: (ratio) => setProgress("Exporting", lerp(92, 96, ratio)),
        },
        () => runFfmpeg(["-y", "-i", composedPath, ...codecArgs, audioOut]),
      );
      body = await readFile(audioOut);
      const rawName = (args.name || "export").replace(/\.(mp3|wav|m4a|mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}${audioExportExt(audioFormat)}`;
      mimeType = audioExportMime(audioFormat);
      kind = "audio";
    } else {
      setProgress("Exporting", 93);
      body = await readFile(composedPath);
      const rawName = (args.name || "export").replace(/\.(mp4|mov|webm)$/i, "");
      filename = `${rawName.replace(/[^\w.-]+/g, "-").slice(0, 48) || "export"}.mp4`;
      mimeType = "video/mp4";
      kind = "video";
    }

    setProgress("Exporting", 96);
    const prepared = await host.createExportAsset({
      userId,
      folderId: args.folderId,
      name: filename,
      kind,
      mimeType,
    });
    await host.putObject({
      path: prepared.bunnyPath,
      body: new Uint8Array(body),
      contentType: mimeType,
    });
    setProgress("Exporting", 99);
    await host.finalizeExportAsset({
      assetId: prepared.assetId,
      byteSize: body.byteLength,
    });
    if (args.projectId && exportKind === "video") {
      await host.attachOutput({
        userId,
        projectId: args.projectId,
        outputAssetId: prepared.assetId,
      });
    }
    if (args.jobId) {
      await reportChain;
      await host.completeJob(args.jobId, prepared.assetId);
    }
    await report("Export ready", 100);
    return { assetId: prepared.assetId };
  } catch (error) {
    const message = ffmpegFailMessage(error, "Export failed.");
    if (args.jobId) {
      try {
        await host.failJob(args.jobId, message);
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

