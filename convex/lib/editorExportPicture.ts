/** Picture-source rules for export — stills vs movies vs audio-only. */

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
  };
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

/** Every video/image clip on a video lane (multi-row picture stack). */
export function collectExportPictureClips(project: {
  tracks: Array<{ id: string; kind: string }>;
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
  }>;
}): ExportPictureClip[] {
  const trackIndexById = new Map(
    project.tracks.map((track, index) => [track.id, index] as const),
  );
  const videoTrackIds = new Set(
    project.tracks.filter((track) => track.kind === "video").map((track) => track.id),
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
    }))
    .sort(
      (a, b) =>
        a.startTime - b.startTime || a.trackIndex - b.trackIndex || a.id.localeCompare(b.id),
    );
}

function pictureClipEnd(clip: { startTime: number; trimIn: number; trimOut: number }): number {
  return clip.startTime + Math.max(0.05, Number(clip.trimOut) - Number(clip.trimIn) || 0.05);
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
