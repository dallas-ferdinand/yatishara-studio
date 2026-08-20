import {
  canvasAspectForState,
  compositorZoom,
  isAudioOnlyKind,
  resolvedMaskRect,
  resolveLiveSource,
  type LiveBorder,
  type LiveFill,
  type LiveRect,
  type LiveMixerState,
  type LiveSource,
} from "./liveMixerModel";

export type LivePaintInput = {
  video?: CanvasImageSource | null;
  image?: CanvasImageSource | null;
};

function mediaSize(source: CanvasImageSource, fallbackW: number, fallbackH: number) {
  if ("videoWidth" in source && typeof source.videoWidth === "number") {
    const vw = source.videoWidth;
    const vh = "videoHeight" in source ? Number(source.videoHeight) : 0;
    return { vw, vh };
  }
  const vw =
    "naturalWidth" in source && typeof source.naturalWidth === "number" && source.naturalWidth > 0
      ? source.naturalWidth
      : "width" in source && typeof source.width === "number"
        ? Number(source.width)
        : fallbackW;
  const vh =
    "naturalHeight" in source && typeof source.naturalHeight === "number" && source.naturalHeight > 0
      ? source.naturalHeight
      : "height" in source && typeof source.height === "number"
        ? Number(source.height)
        : fallbackH;
  return { vw: vw || fallbackW, vh: vh || fallbackH };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.rect(x, y, w, h);
}

function strokeBorder(
  ctx: CanvasRenderingContext2D,
  border: LiveBorder | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  canvasH: number,
) {
  if (!border?.enabled || w <= 0 || h <= 0) return;
  const line = Math.max(1, border.width * (canvasH / 1080));
  ctx.save();
  ctx.lineWidth = line;
  ctx.strokeStyle = border.color || "#ffffff";
  ctx.lineJoin = "round";
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

function hexWithAlpha(hex: string, alpha: number) {
  const raw = hex.trim();
  const n = raw.startsWith("#") ? raw.slice(1) : raw;
  const full =
    n.length === 3
      ? `${n[0]}${n[0]}${n[1]}${n[1]}${n[2]}${n[2]}`
      : n.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function fillFor(
  ctx: CanvasRenderingContext2D,
  fill: LiveFill,
  rect: LiveRect,
  canvasW: number,
  canvasH: number,
) {
  const x = rect.x * canvasW;
  const y = rect.y * canvasH;
  const w = rect.w * canvasW;
  const h = rect.h * canvasH;
  if (fill.mode !== "gradient") return fill.color;
  const rad = ((fill.angle - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.hypot(w, h) / 2;
  const grad = ctx.createLinearGradient(
    cx - Math.cos(rad) * len,
    cy - Math.sin(rad) * len,
    cx + Math.cos(rad) * len,
    cy + Math.sin(rad) * len,
  );
  grad.addColorStop(0, fill.color);
  grad.addColorStop(1, fill.color2);
  return grad;
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
) {
  const { vw, vh } = mediaSize(source, w, h);
  if (!vw || !vh || w <= 0 || h <= 0) return;
  const punch = Math.max(1, zoom);
  const scale = Math.min(w / vw, h / vh) * punch;
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function paintMedia(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  source: LiveSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  if (source.mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    drawContain(ctx, frame, 0, 0, w, h, compositorZoom(source));
  } else {
    drawContain(ctx, frame, x, y, w, h, compositorZoom(source));
  }
  ctx.restore();
}

function paintSource(
  ctx: CanvasRenderingContext2D,
  source: LiveSource,
  frame: CanvasImageSource | null,
  canvasW: number,
  canvasH: number,
  revealMask: boolean,
  canvasAspect: number,
) {
  const resolved = resolveLiveSource(source);
  const vx = resolved.rect.x * canvasW;
  const vy = resolved.rect.y * canvasH;
  const vw = resolved.rect.w * canvasW;
  const vh = resolved.rect.h * canvasH;
  if (vw <= 0 || vh <= 0) return;
  const mask = resolvedMaskRect(resolved, canvasAspect);
  const clip = mask ?? resolved.rect;
  const cx = clip.x * canvasW;
  const cy = clip.y * canvasH;
  const cw = clip.w * canvasW;
  const ch = clip.h * canvasH;
  const radius = (resolved.radius ?? 0) * Math.min(cw, ch);
  const shadow = resolved.shadow;
  const alpha = resolved.opacity ?? 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow?.enabled) {
    ctx.save();
    ctx.shadowColor = hexWithAlpha(shadow.color, shadow.opacity);
    ctx.shadowBlur = shadow.blur * (canvasH / 1080);
    ctx.shadowOffsetY = Math.max(2, shadow.blur * 0.18 * (canvasH / 1080));
    roundRectPath(ctx, cx, cy, cw, ch, radius);
    ctx.fillStyle = hexWithAlpha(shadow.color, Math.min(1, shadow.opacity + 0.15));
    ctx.fill();
    ctx.restore();
  }
  if (resolved.kind === "background" || resolved.kind === "text") {
    ctx.save();
    roundRectPath(ctx, cx, cy, cw, ch, radius);
    ctx.clip();
    ctx.fillStyle = fillFor(ctx, resolved.fill, resolved.rect, canvasW, canvasH);
    ctx.fillRect(cx, cy, cw, ch);
    if (resolved.kind === "text") {
      const text = String(resolved.text ?? "").trim() || "Text";
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.max(18, Math.min(64, ch * 0.55))}px var(--font-onest, sans-serif)`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx + cw / 2, cy + ch / 2, cw - 16);
    }
    ctx.restore();
    strokeBorder(ctx, resolved.border, cx, cy, cw, ch, radius, canvasH);
    ctx.restore();
    return;
  }
  if (mask && revealMask && frame) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.52;
    roundRectPath(ctx, vx, vy, vw, vh, 0);
    ctx.clip();
    paintMedia(ctx, frame, resolved, vx, vy, vw, vh);
    ctx.restore();
  }
  ctx.save();
  roundRectPath(ctx, cx, cy, cw, ch, radius);
  ctx.clip();
  if (frame) paintMedia(ctx, frame, resolved, vx, vy, vw, vh);
  else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(cx, cy, cw, ch);
  }
  ctx.restore();
  strokeBorder(
    ctx,
    mask && resolved.maskBorder?.enabled ? resolved.maskBorder : resolved.border,
    cx,
    cy,
    cw,
    ch,
    radius,
    canvasH,
  );
  ctx.restore();
}

export function paintLiveFrame(
  ctx: CanvasRenderingContext2D,
  sources: LiveSource[],
  inputs: Map<string, LivePaintInput>,
  canvasW: number,
  canvasH: number,
  opts?: { revealSourceId?: string | null; mixer?: LiveMixerState },
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasW, canvasH);
  const canvasAspect =
    canvasH > 0 ? canvasW / canvasH : opts?.mixer ? canvasAspectForState(opts.mixer) : 16 / 9;
  for (const source of sources) {
    if (!source.visible || isAudioOnlyKind(source.kind)) continue;
    const input = inputs.get(source.id);
    const frame = (input?.video || input?.image) ?? null;
    paintSource(
      ctx,
      source,
      frame,
      canvasW,
      canvasH,
      opts?.revealSourceId === source.id,
      canvasAspect,
    );
  }
}
