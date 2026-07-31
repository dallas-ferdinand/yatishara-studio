import {
  CLIP_TRANSFORM_LIMITS,
  clamp,
  normalizeClipTransform,
  type ClipTransform,
} from "./clipTransform";
import type {
  ClipEffects,
  TextCase,
  TextClipContent,
  TextFontFamily,
} from "./types";

/** Center Y ≈ 82% of canvas (legacy lower-third). */
export const DEFAULT_TEXT_TRANSFORM: ClipTransform = {
  scale: 1,
  x: 0,
  y: 0.32,
  rotation: 0,
};

export const SYSTEM_FONT_OPTIONS: Array<{ id: TextFontFamily; label: string }> = [
  { id: "system", label: "System" },
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
  { id: "display", label: "Display" },
];

/** @deprecated use SYSTEM_FONT_OPTIONS */
export const TEXT_FONT_OPTIONS = SYSTEM_FONT_OPTIONS;

const CSS_STACKS: Record<string, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sans: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  display: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
};

export function isSystemFontStack(family: string | undefined): boolean {
  return Boolean(family && family in CSS_STACKS);
}

export function textFontCssStack(family: TextFontFamily | undefined): string {
  const id = family ?? "system";
  if (id in CSS_STACKS) return CSS_STACKS[id]!;
  // Google Font family — quote if needed
  const safe = id.includes(" ") ? `'${id.replace(/'/g, "\\'")}'` : id;
  return `${safe}, system-ui, sans-serif`;
}

export function applyTextCase(text: string, textCase: TextCase | undefined): string {
  const mode = textCase ?? "none";
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") {
    return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return text;
}

export function textCanvasFont(
  content:
    | Pick<TextClipContent, "fontSize" | "fontFamily" | "bold" | "italic">
    | undefined,
  fontSizePx?: number,
): string {
  const size = fontSizePx ?? content?.fontSize ?? 42;
  const weight = content?.bold ? "700" : "600";
  const style = content?.italic ? "italic " : "";
  return `${style}${weight} ${size}px ${textFontCssStack(content?.fontFamily)}`;
}

export function hasTextPose(effects: ClipEffects | undefined): boolean {
  if (!effects) return false;
  return (
    effects.x !== undefined ||
    effects.y !== undefined ||
    effects.scale !== undefined ||
    effects.rotation !== undefined
  );
}

/** Normalize pose for text; legacy clips without effects stay lower-third. */
export function normalizeTextTransform(
  effects: ClipEffects | undefined,
): ClipTransform {
  if (!hasTextPose(effects)) return { ...DEFAULT_TEXT_TRANSFORM };
  return normalizeClipTransform(effects);
}

export type TextLayoutRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Anchor X in canvas px (text align origin). */
  anchorX: number;
  /** Anchor Y in canvas px (baseline middle). */
  anchorY: number;
};

/** Estimate text bounds in canvas pixels from typography + effects. */
export function textLayoutRect(
  content: TextClipContent | undefined,
  effects: ClipEffects | undefined,
  canvasWidth: number,
  canvasHeight: number,
  animTranslateY = 0,
  animScale = 1,
): TextLayoutRect {
  const transform = normalizeTextTransform(effects);
  const fontSize = content?.fontSize ?? 42;
  const display = applyTextCase(content?.text ?? "", content?.textCase);
  const align = content?.align ?? "center";
  const lineHeight = Math.max(0.8, content?.lineHeight ?? 1.2);
  const lines = display.split(/\n/).filter((l, i, a) => l.length || a.length === 1);
  const lineCount = Math.max(1, lines.length || 1);
  const combinedScale = transform.scale * animScale;
  const height = Math.max(
    18,
    fontSize * lineHeight * lineCount * combinedScale,
  );
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const tracking = (content?.letterSpacing ?? 0) * fontSize;
  const width = Math.min(
    canvasWidth * 0.92,
    Math.max(
      fontSize * 1.4 * combinedScale,
      (longest * fontSize * 0.55 + Math.max(0, longest - 1) * tracking) *
        combinedScale,
    ),
  );
  const bgPad = content?.backgroundColor
    ? (content.backgroundPadding ?? 8) * 2 * combinedScale
    : 0;
  // Include stroke / glow / shadow so selection chrome doesn't sit inside the halo.
  const strokePad = Math.max(0, Number(content?.strokeWidth) || 0) * combinedScale;
  const glowPad = content?.glow
    ? Math.max(0, Number(content.glowBlur) || 12) * 0.65 * combinedScale
    : 0;
  const shadowPad = content?.shadowColor
    ? (Math.max(
        Math.abs(Number(content.shadowOffsetX) || 0),
        Math.abs(Number(content.shadowOffsetY) || 0),
      ) +
        Math.max(0, Number(content.shadowBlur) || 0) * 0.5) *
      combinedScale
    : 0;
  const effectPad = Math.max(strokePad, glowPad, shadowPad);
  const pad = bgPad + effectPad * 2;
  const boxW = width + pad;
  const boxH = height + pad;
  const anchorX = (0.5 + transform.x) * canvasWidth;
  const anchorY = (0.5 + transform.y) * canvasHeight + animTranslateY;
  const left =
    align === "left"
      ? anchorX
      : align === "right"
        ? anchorX - boxW
        : anchorX - boxW / 2;
  const vAlign = content?.verticalAlign ?? "middle";
  const top =
    vAlign === "top"
      ? anchorY
      : vAlign === "bottom"
        ? anchorY - boxH
        : anchorY - boxH / 2;
  return {
    left,
    top,
    width: boxW,
    height: boxH,
    anchorX,
    anchorY,
  };
}

/** Normalized [0,1] content rect for transform overlay. */
export function textContentRectNormalized(
  content: TextClipContent | undefined,
  effects: ClipEffects | undefined,
  canvasWidth: number,
  canvasHeight: number,
): { left: number; top: number; width: number; height: number } {
  const layout = textLayoutRect(content, effects, canvasWidth, canvasHeight);
  return {
    left: layout.left / Math.max(1, canvasWidth),
    top: layout.top / Math.max(1, canvasHeight),
    width: layout.width / Math.max(1, canvasWidth),
    height: layout.height / Math.max(1, canvasHeight),
  };
}
