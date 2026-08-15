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
