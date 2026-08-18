import { contentRectForTransform, type ClipTransform } from "../clipTransform";
import { loadGoogleFont } from "../loadGoogleFont";
import { normalizeEditorTransition } from "../../../../convex/lib/editorEffectContract";
import type { TransitionType } from "../types";

export type CompositorLayer = {
  frame?: VideoFrame;
  textureKey?: string;
  transform?: [number, number, number, number];
  opacity?: number;
  width?: number;
  height?: number;
};

export type CompositorTextItem = {
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  opacity: number;
  translateY: number;
  scale: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  strokeColor: string;
  strokeWidth: number;
  flipX: boolean;
  flipY: boolean;
  poseX: number;
  poseY: number;
  poseScale: number;
  rotation: number;
  clipId?: string;
  underline?: boolean;
  textCase?: "none" | "upper" | "lower" | "title";
  letterSpacing?: number;
  lineHeight?: number;
  verticalAlign?: "top" | "middle" | "bottom";
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
};

export type CompositorPaintArgs = {
  frameA?: VideoFrame;
  frameB?: VideoFrame;
  textureKeyA?: string;
  textureKeyB?: string;
  transformA?: [number, number, number, number];
  transformB?: [number, number, number, number];
  opacityA?: number;
  opacityB?: number;
  transition?: TransitionType;
  progress?: number;
  background?: [number, number, number, number];
  textsUnder?: CompositorTextItem[];
  textsOver?: CompositorTextItem[];
  stack?: CompositorLayer[];
  layers?: CompositorLayer[];
};

type TransformTuple = [number, number, number, number];
const IDENTITY: TransformTuple = [1, 0, 0, 0];
const STILL_CACHE_MAX = 12;

const SYSTEM_STACKS: Record<string, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sans: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  display: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
};

function closeFrame(frame?: VideoFrame): void {
  if (!frame) return;
  try {
    frame.close();
  } catch {
    /* already closed */
  }
}

function closeLayers(layers: CompositorLayer[] | undefined): void {
  for (const layer of layers ?? []) closeFrame(layer.frame);
}

function tupleToTransform(tuple: TransformTuple): ClipTransform {
  return {
    scale: tuple[0],
    x: tuple[1],
    y: tuple[2],
    rotation: tuple[3],
  };
}

function cssFontFamily(family: string): string {
  const id = family || "system";
  if (id in SYSTEM_STACKS) return SYSTEM_STACKS[id]!;
  const safe = id.includes(" ") ? `'${id.replace(/'/g, "\\'")}'` : id;
  return `${safe}, system-ui, sans-serif`;
}

function applyCase(
  text: string,
  mode: CompositorTextItem["textCase"],
): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") {
    return text.replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
  }
  return text;
}

type Drawable = VideoFrame | ImageBitmap;

function sourceSize(
  drawable: Drawable,
  layer: Pick<CompositorLayer, "width" | "height">,
): { width: number; height: number } {
  if (layer.width && layer.height) return { width: layer.width, height: layer.height };
  if (drawable instanceof VideoFrame) {
    return { width: drawable.displayWidth, height: drawable.displayHeight };
  }
  return { width: drawable.width, height: drawable.height };
}

function drawContained(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable,
  canvasW: number,
  canvasH: number,
  layer: CompositorLayer,
): void {
  const size = sourceSize(drawable, layer);
  const transform = tupleToTransform(layer.transform ?? IDENTITY);
  const rect = contentRectForTransform(
    transform,
    canvasW,
    canvasH,
    size.width,
    size.height,
  );
  const destW = rect.width * canvasW;
  const destH = rect.height * canvasH;
  if (destW < 0.5 || destH < 0.5) return;
  ctx.save();
  ctx.globalAlpha *= Number.isFinite(layer.opacity) ? Number(layer.opacity) : 1;
  ctx.translate((rect.left + rect.width / 2) * canvasW, (rect.top + rect.height / 2) * canvasH);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.drawImage(drawable, -destW / 2, -destH / 2, destW, destH);
  ctx.restore();
}

function paintTextItems(
  ctx: CanvasRenderingContext2D,
  items: CompositorTextItem[],
  canvasW: number,
  canvasH: number,
): void {
  ctx.textBaseline = "middle";
  for (const item of items) {
    ctx.save();
    ctx.globalAlpha = item.opacity;
    const weight = item.bold ? "700" : "600";
    const style = item.italic ? "italic " : "";
    const family = cssFontFamily(item.fontFamily);
    const sizeScale = Math.max(0.05, item.poseScale * item.scale);
    const fontSize = item.fontSize * sizeScale;
    const strokeW = Math.max(0, item.strokeWidth) * sizeScale;
    const glowBlur = (item.glowBlur ?? 12) * sizeScale;
    const shadowBlur = (item.shadowBlur ?? 0) * sizeScale;
    const shadowOx = (item.shadowOffsetX ?? 0) * sizeScale;
    const shadowOy = (item.shadowOffsetY ?? 0) * sizeScale;
    ctx.font = `${style}${weight} ${fontSize}px ${family}`;
    ctx.textAlign = item.align;
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
        `${(item.letterSpacing ?? 0) * fontSize}px`;
    } catch {
      /* letterSpacing unsupported */
    }
    const display = applyCase(item.text, item.textCase ?? "none");
    const lines = display.split("\n");
    const lineHeight = fontSize * Math.max(0.8, item.lineHeight ?? 1.2);
    const blockH = Math.max(lineHeight, lines.length * lineHeight);
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line || " ").width);
    }
    const effectPad =
      strokeW * 0.6 +
      (item.glow ? glowBlur * 0.55 : 0) +
      (item.shadowColor
        ? Math.max(Math.abs(shadowOx), Math.abs(shadowOy)) + shadowBlur * 0.35
        : 0);
    const pad =
      (item.backgroundColor ? (item.backgroundPadding ?? 8) * sizeScale : 0) +
      (item.backgroundColor ? effectPad * 0.35 : 0);
    ctx.translate((0.5 + item.poseX) * canvasW, (0.5 + item.poseY) * canvasH + item.translateY);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
    const vAlign = item.verticalAlign ?? "middle";
    const blockTop = vAlign === "top" ? 0 : vAlign === "bottom" ? -blockH : -blockH / 2;
    const boxLeft =
      item.align === "left" ? -pad : item.align === "right" ? -maxW - pad : -maxW / 2 - pad;
    if (item.backgroundColor) {
      const bw = maxW + pad * 2;
      const bh = blockH + pad * 2;
      const radius = Math.max(
        0,
        Math.min((item.backgroundRadius ?? 0) * sizeScale, bw / 2, bh / 2),
      );
      ctx.fillStyle = item.backgroundColor;
      if (radius <= 0.5) ctx.fillRect(boxLeft, blockTop - pad, bw, bh);
      else {
        ctx.beginPath();
        const round = (
          ctx as CanvasRenderingContext2D & {
            roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
          }
        ).roundRect;
        if (typeof round === "function") {
          round.call(ctx, boxLeft, blockTop - pad, bw, bh, radius);
        } else {
          ctx.rect(boxLeft, blockTop - pad, bw, bh);
        }
        ctx.fill();
      }
    }
    const drawGlyphLine = (line: string, ly: number) => {
      if (strokeW > 0) {
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = item.strokeColor || "#000000";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(line, 0, ly);
      }
      ctx.fillText(line, 0, ly);
    };
    const drawAllLines = () => {
      ctx.fillStyle = item.color;
      for (let i = 0; i < lines.length; i += 1) {
        drawGlyphLine(lines[i] ?? "", blockTop + lineHeight * i + lineHeight / 2);
      }
    };
    if (item.glow) {
      ctx.shadowColor = item.glowColor || "#ffffff";
      ctx.shadowBlur = glowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      drawAllLines();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    if (item.shadowColor) {
      ctx.shadowColor = item.shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = shadowOx;
      ctx.shadowOffsetY = shadowOy;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    drawAllLines();
    if (item.underline) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = Math.max(1, fontSize * 0.06);
      for (let i = 0; i < lines.length; i += 1) {
        const ly = blockTop + lineHeight * i + lineHeight / 2;
        const line = lines[i] ?? "";
        const w = ctx.measureText(line || " ").width;
        const ux = item.align === "left" ? 0 : item.align === "right" ? -w : -w / 2;
        ctx.beginPath();
        ctx.moveTo(ux, ly + fontSize * 0.35);
        ctx.lineTo(ux + w, ly + fontSize * 0.35);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

type SceneLayer = {
  drawable: Drawable;
  textureKey?: string;
  transform: TransformTuple;
  opacity: number;
  width?: number;
  height?: number;
  retain: boolean;
};

/**
 * Preview compositor: Canvas2D on the visible canvas. No WebGL, no
 * OffscreenCanvas transfer — VPS / software-GL machines can still stack.
 */
export class Canvas2dCompositor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stills = new Map<string, VideoFrame>();
  private scene: {
    layers: SceneLayer[];
    textsUnder: CompositorTextItem[];
    textsOver: CompositorTextItem[];
    background: [number, number, number, number];
    transition: TransitionType;
    progress: number;
  } | null = null;
  private scratch: HTMLCanvasElement | null = null;
  disposed = false;
  onTextureMiss: ((textureKeys: string[]) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d", { alpha: false });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      throw new Error(
        "Canvas2D compositor is unavailable. Hard-refresh if this tab still holds the old GPU canvas.",
      );
    }
    this.ctx = ctx;
  }

  private sizeCanvas(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private rememberStill(key: string | undefined, frame?: VideoFrame): void {
    if (!key?.startsWith("image:") || !frame) return;
    const prev = this.stills.get(key);
    if (prev && prev !== frame) closeFrame(prev);
    this.stills.set(key, frame.clone());
    while (this.stills.size > STILL_CACHE_MAX) {
      const oldest = this.stills.keys().next().value;
      if (!oldest) break;
      closeFrame(this.stills.get(oldest));
      this.stills.delete(oldest);
    }
  }

  private resolveLayer(
    layer: CompositorLayer,
    missing: string[],
  ): Omit<SceneLayer, "transform" | "opacity"> | null {
    const key = layer.textureKey;
    if (key?.startsWith("image:")) {
      this.rememberStill(key, layer.frame);
      const cached = this.stills.get(key);
      if (cached) {
        return {
          drawable: cached,
          textureKey: key,
          width: layer.width ?? cached.displayWidth,
          height: layer.height ?? cached.displayHeight,
          retain: true,
        };
      }
      missing.push(key);
      return null;
    }
    if (layer.frame) {
      return {
        drawable: layer.frame,
        textureKey: key,
        width: layer.width,
        height: layer.height,
        retain: false,
      };
    }
    return null;
  }

  private scratchCtx(width: number, height: number): CanvasRenderingContext2D {
    if (!this.scratch) this.scratch = document.createElement("canvas");
    if (this.scratch.width !== width) this.scratch.width = width;
    if (this.scratch.height !== height) this.scratch.height = height;
    const ctx = this.scratch.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas2D scratch is unavailable.");
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }

  private paintLayerList(layers: SceneLayer[]): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (const layer of layers) {
      drawContained(ctx, layer.drawable, w, h, layer);
    }
  }

  private paintTransition(bottom: SceneLayer, top: SceneLayer, type: TransitionType, p: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const progress = Math.min(1, Math.max(0, p));
    const drawOnto = (target: CanvasRenderingContext2D, layer: SceneLayer) => {
      drawContained(target, layer.drawable, w, h, layer);
    };
    if (type === "none") {
      drawOnto(ctx, bottom);
      drawOnto(ctx, top);
      return;
    }
    if (type === "wipeLeft") {
      drawOnto(ctx, top);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w * progress, h);
      ctx.clip();
      drawOnto(ctx, bottom);
      ctx.restore();
      return;
    }
    if (type === "wipeRight") {
      drawOnto(ctx, top);
      ctx.save();
      ctx.beginPath();
      ctx.rect(w * (1 - progress), 0, w * progress, h);
      ctx.clip();
      drawOnto(ctx, bottom);
      ctx.restore();
      return;
    }
    if (type === "wipeUp") {
      drawOnto(ctx, top);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, h * (1 - progress), w, h * progress);
      ctx.clip();
      drawOnto(ctx, bottom);
      ctx.restore();
      return;
    }
    if (type === "dipToBlack" || type === "dipToWhite") {
      const dip = type === "dipToWhite" ? "#fff" : "#000";
      if (progress < 0.5) {
        drawOnto(ctx, top);
        ctx.save();
        ctx.globalAlpha = progress * 2;
        ctx.fillStyle = dip;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = dip;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = (progress - 0.5) * 2;
        drawOnto(ctx, bottom);
        ctx.restore();
      }
      return;
    }
    if (type === "slideLeft") {
      ctx.save();
      ctx.translate(-w * progress, 0);
      drawOnto(ctx, top);
      ctx.restore();
      ctx.save();
      ctx.translate(w * (1 - progress), 0);
      drawOnto(ctx, bottom);
      ctx.restore();
      return;
    }
    if (type === "zoomIn") {
      const scratch = this.scratchCtx(w, h);
      drawOnto(scratch, top);
      const scale = 1 + progress * 0.28;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(this.scratch!, -w / 2, -h / 2);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = progress;
      drawOnto(ctx, bottom);
      ctx.restore();
      return;
    }
    // crossfade + blur (blur ≈ fade; no GPU two-pass)
    drawOnto(ctx, top);
    ctx.save();
    ctx.globalAlpha = progress;
    if (type === "blur") ctx.filter = `blur(${Math.max(0, (1 - progress) * 8)}px)`;
    drawOnto(ctx, bottom);
    ctx.filter = "none";
    ctx.restore();
  }

  private redrawScene(): void {
    if (!this.scene) return;
    const { layers, textsUnder, textsOver, background, transition, progress } = this.scene;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const [r, g, b, a] = background;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    ctx.fillRect(0, 0, w, h);
    paintTextItems(ctx, textsUnder, w, h);
    const transitioning =
      layers.length === 2 && normalizeEditorTransition(transition) !== "none";
    if (transitioning) {
      this.paintTransition(
        layers[0]!,
        layers[1]!,
        normalizeEditorTransition(transition),
        progress,
      );
    } else {
      this.paintLayerList(layers);
    }
    paintTextItems(ctx, textsOver, w, h);
  }

  private releaseScene(keepStills = true): void {
    if (!this.scene) return;
    for (const layer of this.scene.layers) {
      if (layer.retain) continue;
      if (layer.drawable instanceof VideoFrame) closeFrame(layer.drawable);
    }
    this.scene = null;
    void keepStills;
  }

  paint(args: CompositorPaintArgs): string[] {
    if (this.disposed) {
      closeFrame(args.frameA);
      closeFrame(args.frameB);
      closeLayers(args.stack);
      closeLayers(args.layers);
      return [];
    }
    const missing: string[] = [];
    const incoming: CompositorLayer[] =
      args.layers?.length
        ? args.layers
        : [
            ...(args.frameB || args.textureKeyB
              ? [
                  {
                    frame: args.frameB,
                    textureKey: args.textureKeyB,
                    transform: args.transformB ?? IDENTITY,
                    opacity: args.opacityB ?? 1,
                  },
                ]
              : []),
            ...(args.stack ?? []),
            ...(args.frameA || args.textureKeyA
              ? [
                  {
                    frame: args.frameA,
                    textureKey: args.textureKeyA,
                    transform: args.transformA ?? IDENTITY,
                    opacity: args.opacityA ?? 1,
                  },
                ]
              : []),
          ];
    this.releaseScene();
    const layers: SceneLayer[] = [];
    for (const layer of incoming) {
      const resolved = this.resolveLayer(layer, missing);
      if (!resolved) continue;
      layers.push({
        ...resolved,
        transform: layer.transform ?? IDENTITY,
        opacity: Number.isFinite(layer.opacity) ? Number(layer.opacity) : 1,
      });
    }
    this.scene = {
      layers,
      textsUnder: args.textsUnder ?? [],
      textsOver: args.textsOver ?? [],
      background: args.background ?? [0, 0, 0, 1],
      transition: args.transition ?? "none",
      progress: args.progress ?? 0,
    };
    this.redrawScene();
    const held = new Set(
      layers.filter((layer) => !layer.retain).map((layer) => layer.drawable),
    );
    const maybeClose = (frame?: VideoFrame) => {
      if (!frame || held.has(frame)) return;
      closeFrame(frame);
    };
    for (const layer of incoming) maybeClose(layer.frame);
    maybeClose(args.frameA);
    maybeClose(args.frameB);
    for (const layer of args.stack ?? []) maybeClose(layer.frame);
    if (missing.length) this.onTextureMiss?.(missing);
    return missing;
  }

  updateTransform(transform: TransformTuple, target: "a" | "b" = "a"): void {
    if (!this.scene || this.scene.layers.length === 0) return;
    const layers = this.scene.layers;
    const index =
      target === "b" || layers.length === 1 ? 0 : layers.length - 1;
    const layer = layers[index];
    if (!layer) return;
    layer.transform = transform;
    this.redrawScene();
  }

  updateTextTransform(clipId: string, transform: TransformTuple): void {
    if (!this.scene) return;
    const patch = (items: CompositorTextItem[]) =>
      items.map((item) =>
        item.clipId === clipId
          ? {
              ...item,
              poseScale: transform[0],
              poseX: transform[1],
              poseY: transform[2],
              rotation: transform[3],
            }
          : item,
      );
    this.scene.textsUnder = patch(this.scene.textsUnder);
    this.scene.textsOver = patch(this.scene.textsOver);
    this.redrawScene();
  }

  resize(width: number, height: number): void {
    this.sizeCanvas(width, height);
    this.redrawScene();
  }

  async ensureFonts(families: string[]): Promise<void> {
    await Promise.all(families.map((family) => loadGoogleFont(family)));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseScene();
    for (const frame of this.stills.values()) closeFrame(frame);
    this.stills.clear();
    this.scratch = null;
  }
}
