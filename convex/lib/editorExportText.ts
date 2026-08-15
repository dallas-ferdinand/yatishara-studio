/**
 * FFmpeg drawtext overlays for editor export.
 * Uses textfile + expansion=none so quotes / % / colons cannot break the graph.
 */

export type ExportTextContent = {
  text?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  textCase?: "none" | "upper" | "lower" | "title";
  letterSpacing?: number;
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string | null;
  backgroundPadding?: number;
  shadowColor?: string | null;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glow?: boolean;
  glowColor?: string;
  opacity?: number;
  flipX?: boolean;
};

export type ExportTextClip = {
  id: string;
  startTime: number;
  duration: number;
  effects?: { scale?: number; x?: number; y?: number; rotation?: number };
  text?: ExportTextContent;
};

export type TextOverlayFilter = {
  filter: string;
  textFileBody: string;
  textFileName: string;
};

const DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu";

export function applyTextCase(
  text: string,
  mode?: ExportTextContent["textCase"],
): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") {
    return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return text;
}

export function isLegacySystemFont(family: string | undefined): boolean {
  return (
    !family ||
    family === "system" ||
    family === "sans" ||
    family === "serif" ||
    family === "mono" ||
    family === "display"
  );
}

export function textFontFile(content: ExportTextContent | undefined): string | null {
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
  if (bold) return `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`;
  return `${DEJAVU_DIR}/DejaVuSans.ttf`;
}

export function hexToFfmpegColor(hex?: string, alpha = 1): string {
  const raw = (hex ?? "#ffffff").replace("#", "");
  const a = Math.max(0, Math.min(1, alpha));
  if (raw.length === 6 && /^[0-9a-fA-F]+$/.test(raw)) {
    if (a >= 0.999) return `0x${raw}`;
    const aa = Math.round(a * 255).toString(16).padStart(2, "0");
    return `0x${raw}${aa}`;
  }
  return a >= 0.999 ? "white" : `white@${a.toFixed(3)}`;
}

export function normalizeTextPose(effects: ExportTextClip["effects"]): {
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
    scale: Math.min(6, Math.max(0.2, Number(effects?.scale) || 1)),
    x: Math.min(1.5, Math.max(-1.5, Number(effects?.x) || 0)),
    y: Math.min(1.5, Math.max(-1.5, Number(effects?.y) || 0)),
    rotation: Number(effects?.rotation) || 0,
  };
}

export function collectExportTextClips(
  clips: Array<{
    id: string;
    kind?: string;
    startTime: number;
    trimIn?: number;
    trimOut?: number;
    effects?: ExportTextClip["effects"];
    text?: ExportTextContent;
  }>,
  durationOf = (clip: { trimIn?: number; trimOut?: number }) =>
    Math.max(0.05, Number(clip.trimOut ?? 3) - Number(clip.trimIn ?? 0) || 3),
): ExportTextClip[] {
  const out: ExportTextClip[] = [];
  for (const clip of clips) {
    if (clip.kind && clip.kind !== "text") continue;
    const raw = clip.text?.text?.trim();
    if (!raw) continue;
    out.push({
      id: clip.id,
      startTime: Number(clip.startTime) || 0,
      duration: durationOf(clip),
      effects: clip.effects,
      text: clip.text,
    });
  }
  return out;
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/'/g, "\\'");
}

export function buildTextOverlayFilter(args: {
  clip: ExportTextClip;
  segmentStart: number;
  segmentDuration: number;
  fontfile: string | null;
  textFileName: string;
}): TextOverlayFilter | null {
  const rawText = args.clip.text?.text?.trim();
  if (!rawText) return null;
  const textEnd = args.clip.startTime + args.clip.duration;
  if (textEnd <= args.segmentStart || args.clip.startTime >= args.segmentStart + args.segmentDuration) {
    return null;
  }

  const localStart = Math.max(0, args.clip.startTime - args.segmentStart);
  const localEnd = Math.min(args.segmentDuration, textEnd - args.segmentStart);
  const content = args.clip.text;
  const text = applyTextCase(rawText, content?.textCase);
  const pose = normalizeTextPose(args.clip.effects);
  const fontSize = Math.max(12, Math.min(600, Math.round((content?.fontSize ?? 42) * pose.scale)));
  const opacityRaw = Number(content?.opacity);
  const styleAlpha = Math.max(0, Math.min(1, Number.isFinite(opacityRaw) ? opacityRaw : 1));
  const color = hexToFfmpegColor(content?.color, styleAlpha);
  const align = content?.align ?? "center";
  const vAlign = content?.verticalAlign ?? "middle";
  const strokeWidth = Math.max(0, Math.round(Number(content?.strokeWidth) || 0));
  const strokeColor = hexToFfmpegColor(content?.strokeColor ?? "#000000", styleAlpha);
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
    `textfile='${escapeFilterPath(args.textFileName)}'`,
    "expansion=none",
    `fontsize=${fontSize}`,
    `fontcolor=${color}`,
    `x=${xExpr}`,
    `y=${yExpr}`,
    `enable='between(t\\,${localStart.toFixed(3)}\\,${localEnd.toFixed(3)})'`,
  ];
  if (args.fontfile) {
    opts.push(`fontfile='${escapeFilterPath(args.fontfile)}'`);
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
  const lineHeight = Number(content?.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0 && text.includes("\n")) {
    const extra = Math.max(0, Math.round(fontSize * (lineHeight - 1)));
    if (extra > 0) opts.push(`line_spacing=${extra}`);
  }
  if (Math.abs(pose.rotation) > 0.05) {
    const rad = (-pose.rotation * Math.PI) / 180;
    opts.push(`angle=${rad.toFixed(5)}`);
  }

  return {
    filter: `drawtext=${opts.join(":")}`,
    textFileBody: text,
    textFileName: args.textFileName,
  };
}

function isFfmpegChatter(line: string): boolean {
  return (
    /^(frame|fps|q|size|time|bitrate|speed|out_time)\s*=/i.test(line) ||
    /^frame=\s*\d+/i.test(line) ||
    /^Press \[q\]/i.test(line) ||
    /^(Input|Output) #/i.test(line) ||
    /^Stream mapping:/i.test(line) ||
    /^Metadata:/i.test(line) ||
    /^encoder\s*:/i.test(line) ||
    /^Stream #\d/.test(line) ||
    /^\[(libx264|aac|libmp3lame|out#|in#) @/i.test(line) ||
    /H\.264\/MPEG-4 AVC codec/i.test(line) ||
    /videolan\.org\/x264/i.test(line) ||
    /^x264 \[info\]/i.test(line) ||
    /^Command failed:/i.test(line)
  );
}

function isFfmpegErrorLine(line: string): boolean {
  return (
    /error applying option/i.test(line) ||
    /option not found/i.test(line) ||
    /invalid argument/i.test(line) ||
    /invalid data/i.test(line) ||
    /conversion failed/i.test(line) ||
    /matches no streams/i.test(line) ||
    /nothing was written/i.test(line) ||
    /\b(error|failed|not found|no such|cannot|unable)\b/i.test(line)
  );
}

/** Drop \r progress / codec banners so the last lines are the real error. */
export function ffmpegUsefulStderr(stderr: string): string {
  const lines = String(stderr)
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isFfmpegChatter(line));
  const errors = lines.filter(isFfmpegErrorLine);
  return (errors.length ? errors : lines).slice(-4).join(" ");
}

export function ffmpegFailMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const err = error as { stderr?: string; message?: string };
  const stderr = String(err.stderr ?? "");
  const message = String(err.message ?? "");
  const last = ffmpegUsefulStderr(stderr) || ffmpegUsefulStderr(message);
  if (/drawtext|fontfile|textfile|No such file|Invalid argument/i.test(stderr + message)) {
    return `Text overlay export failed. ${last || fallback}`;
  }
  if (/maxBuffer/i.test(message)) {
    return "Export ran too long for the server log buffer. Retry — this was fixed.";
  }
  return last || fallback;
}
