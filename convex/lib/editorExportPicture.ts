/** Picture-source rules for export — stills vs movies vs audio-only. */

import type { ExportTextClip } from "./editorExportText";

const STILL_CODECS = new Set([
  "png",
  "mjpeg",
  "jpeg",
  "jpg",
  "webp",
  "bmp",
  "tiff",
  "gif",
  "ppm",
  "pam",
  "qoi",
]);

export type ExportPictureClip = {
  id: string;
  assetId: string;
  trackId: string;
  /** Index in project.tracks — lower = higher on the timeline = drawn last. */
  trackIndex: number;
  startTime: number;
  trimIn: number;
  trimOut: number;
  label: string;
  kind: string;
  effects?: {
    scale?: number;
    x?: number;
    y?: number;
    rotation?: number;
    opacity?: number;
    fadeIn?: number;
    fadeOut?: number;
    speed?: number;
    fitMode?: "contain" | "cover";
  };
  transitionOut?: { type?: string; duration?: number } | null;
};

export type PictureTimelineSegment =
  | { type: "gap"; startTime: number; duration: number }
  | {
      type: "layers";
      startTime: number;
      duration: number;
      /** Bottom → top (paint order). */
      layers: ExportPictureClip[];
    };

export type ExportVisualItem =
  | { kind: "picture"; clip: ExportPictureClip }
  | { kind: "text"; clip: ExportTextClip };

/**
 * Same law as preview: higher trackIndex paints first (bottom of timeline).
 * Pictures in `layers` are already the active stack for the segment; texts
 * that overlap the segment are interleaved by trackIndex.
 */
export function exportVisualStackBottomToTop(
  pictures: ExportPictureClip[],
  texts: ExportTextClip[],
  startTime: number,
  duration: number,
): ExportVisualItem[] {
  const end = startTime + duration;
  const items: ExportVisualItem[] = [
    ...pictures.map((clip) => ({ kind: "picture" as const, clip })),
    ...texts
      .filter(
        (clip) =>
          clip.startTime < end && clip.startTime + clip.duration > startTime,
      )
      .map((clip) => ({ kind: "text" as const, clip })),
  ];
  items.sort((a, b) => {
    const ai = a.clip.trackIndex ?? 0;
    const bi = b.clip.trackIndex ?? 0;
    if (ai !== bi) return bi - ai;
    if (a.kind !== b.kind) return a.kind === "picture" ? -1 : 1;
    return a.clip.id.localeCompare(b.clip.id);
  });
  return items;
}

/** Every video/image clip on a video lane (multi-row picture stack). */
export function collectExportPictureClips(project: {
  tracks: Array<{ id: string; kind: string; hidden?: boolean }>;
  clips: Array<{
    id: string;
    assetId?: string;
    trackId: string;
    startTime: number;
    trimIn: number;
    trimOut: number;
    label: string;
    kind: string;
    effects?: ExportPictureClip["effects"];
    transitionOut?: ExportPictureClip["transitionOut"];
  }>;
}): ExportPictureClip[] {
  const trackIndexById = new Map(
    project.tracks.map((track, index) => [track.id, index] as const),
  );
  const videoTrackIds = new Set(
    project.tracks
      .filter((track) => track.kind === "video" && !track.hidden)
      .map((track) => track.id),
  );
  return project.clips
    .filter((clip) => {
      if (!clip.assetId) return false;
      if (clip.kind !== "video" && clip.kind !== "image") return false;
      return videoTrackIds.has(clip.trackId);
    })
    .map((clip) => ({
      id: clip.id,
      assetId: clip.assetId as string,
      trackId: clip.trackId,
      trackIndex: trackIndexById.get(clip.trackId) ?? 0,
      startTime: clip.startTime,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      label: clip.label,
      kind: clip.kind,
      effects: clip.effects,
      transitionOut: clip.transitionOut ?? null,
    }))
    .sort(
      (a, b) =>
        a.startTime - b.startTime || a.trackIndex - b.trackIndex || a.id.localeCompare(b.id),
    );
}

export function pictureClipDuration(clip: { trimIn: number; trimOut: number }): number {
  return Math.max(0.05, Number(clip.trimOut) - Number(clip.trimIn) || 0.05);
}

export function pictureClipEnd(clip: {
  startTime: number;
  trimIn: number;
  trimOut: number;
}): number {
  return clip.startTime + pictureClipDuration(clip);
}

/**
 * The clip whose transition should play at the end of this segment.
 *
 * Segments are cut at every layer edge, so one clip can span several segments —
 * only the piece that ends where the clip ends may carry the transition. xfade
 * blends whole segments, so a stack of lanes has to hard-cut instead: blending
 * the composite would drag the overlays through the wipe too.
 */
export function segmentTransitionClip(
  segment: PictureTimelineSegment,
): ExportPictureClip | null {
  if (segment.type !== "layers" || segment.layers.length !== 1) return null;
  const only = segment.layers[0]!;
  const type = only.transitionOut?.type;
  if (!type || type === "none") return null;
  const segmentEnd = segment.startTime + segment.duration;
  return Math.abs(pictureClipEnd(only) - segmentEnd) <= 0.02 ? only : null;
}

/**
 * Cut the timeline wherever any picture layer starts/ends so each segment has
 * a stable stack (bottom → top). Matches preview compositing, not single-track export.
 */
export function pictureTimelineSegments(
  clips: ExportPictureClip[],
  coverUntil = 0,
): PictureTimelineSegment[] {
  const pictureEnd = clips.reduce((max, clip) => Math.max(max, pictureClipEnd(clip)), 0);
  const end = Math.max(pictureEnd, coverUntil);
  if (end <= 0.02) return [];

  const cuts = new Set<number>([0, end]);
  for (const clip of clips) {
    cuts.add(Math.max(0, clip.startTime));
    cuts.add(Math.min(end, pictureClipEnd(clip)));
  }
  const times = [...cuts]
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= end + 1e-6)
    .sort((a, b) => a - b);

  const segments: PictureTimelineSegment[] = [];
  for (let i = 0; i < times.length - 1; i += 1) {
    const startTime = times[i]!;
    const next = times[i + 1]!;
    const duration = next - startTime;
    if (duration <= 0.02) continue;
    const mid = startTime + duration / 2;
    const active = clips
      .filter((clip) => mid >= clip.startTime && mid < pictureClipEnd(clip))
      // Bottom lane first (highest trackIndex), then overlays toward the top.
      .sort((a, b) => b.trackIndex - a.trackIndex || a.startTime - b.startTime);
    if (!active.length) {
      segments.push({ type: "gap", startTime, duration });
    } else {
      segments.push({ type: "layers", startTime, duration, layers: active });
    }
  }
  return segments;
}

/** Clip fades, scaled so a long fade pair never exceeds the clip. */
export function resolveClipFades(
  effects: { fadeIn?: number; fadeOut?: number } | undefined,
  clipDurationSec: number,
): { fadeIn: number; fadeOut: number } {
  const dur = Math.max(0.05, clipDurationSec);
  let fadeIn = Math.min(dur, Math.max(0, Number(effects?.fadeIn) || 0));
  let fadeOut = Math.min(dur, Math.max(0, Number(effects?.fadeOut) || 0));
  if (fadeIn + fadeOut > dur) {
    const scale = dur / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return { fadeIn, fadeOut };
}

/**
 * Fade filters for one segment of a clip.
 *
 * Fades belong to the whole clip, but an overlapping lane splits that clip into
 * several segments. Timing each piece from its own start made every piece fade
 * in and out again (black flashes mid-clip), so shift PTS into clip-local time,
 * fade there, then shift back: `fade` rejects a negative `st`.
 *
 * Overlay lanes fade their alpha so the lane underneath shows through instead of
 * black.
 */
export function pictureFadeFilterParts(args: {
  effects?: { fadeIn?: number; fadeOut?: number };
  clipDurationSec: number;
  /** Segment start measured from the clip start. */
  localStartSec: number;
  segmentDurationSec: number;
  overlay?: boolean;
}): string[] {
  const clipDur = Math.max(0.05, args.clipDurationSec);
  const { fadeIn, fadeOut } = resolveClipFades(args.effects, clipDur);
  const localStart = Math.max(0, args.localStartSec);
  const localEnd = localStart + Math.max(0.05, args.segmentDurationSec);
  const fadeOutStart = Math.max(0, clipDur - fadeOut);
  const wantIn = fadeIn > 0.001 && localStart < fadeIn - 0.001;
  const wantOut = fadeOut > 0.001 && localEnd > fadeOutStart + 0.001;
  if (!wantIn && !wantOut) return [];

  const alpha = args.overlay ? ":alpha=1" : "";
  const shift = localStart > 0.001;
  const parts: string[] = [];
  if (shift) parts.push(`setpts=PTS+${localStart.toFixed(4)}/TB`);
  if (wantIn) parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}${alpha}`);
  if (wantOut) {
    parts.push(`fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}${alpha}`);
  }
  if (shift) parts.push(`setpts=PTS-${localStart.toFixed(4)}/TB`);
  return parts;
}

export function isStillImageCodec(codec: string | undefined): boolean {
  return STILL_CODECS.has(String(codec ?? "").toLowerCase());
}

export function isStillExportSource(args: {
  kind?: string;
  codec?: string;
  nbFrames?: number;
  /** Source file duration — 1-frame mp4s often report N/A frames and ~0.04s. */
  sourceDurationSec?: number;
}): boolean {
  if (args.kind === "image") return true;
  if (isStillImageCodec(args.codec)) return true;
  if (args.nbFrames === 1) return true;
  const duration = Number(args.sourceDurationSec);
  return Number.isFinite(duration) && duration > 0 && duration <= 0.12;
}

/** ffmpeg input args so a still holds for the clip length instead of one frame. */
export function clipSourceInputArgs(args: {
  sourcePath: string;
  trimIn: number;
  sourceLen: number;
  identitySpeed: boolean;
  isStill: boolean;
  fps?: number;
}): string[] {
  if (args.isStill) {
    return ["-loop", "1", "-framerate", String(args.fps ?? 30), "-i", args.sourcePath];
  }
  if (args.identitySpeed) {
    return ["-ss", String(args.trimIn), "-i", args.sourcePath];
  }
  return ["-ss", String(args.trimIn), "-t", String(args.sourceLen), "-i", args.sourcePath];
}

/** Even-pixel contain so yuv420p never dies on odd scaled sizes (common on generated plates). */
export function safeContainVf(width: number, height: number, fps = 30): string {
  const w = Math.max(2, width - (width % 2));
  const h = Math.max(2, height - (height % 2));
  return (
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `scale=trunc(iw/2)*2:trunc(ih/2)*2,` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,` +
    `fps=${fps},setsar=1,format=yuv420p`
  );
}
