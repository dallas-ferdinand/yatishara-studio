import { clipOpacityAtLocalTime, textClipAnimationStyle } from "../editorEffects";
import { normalizeTextTransform } from "../textLayout";
import type { CompositorTextItem, CompositorVisualItem } from "./compositor-2d";
import type { PictureLayer } from "./picture-layers";
import type { RenderSlice } from "./timeline-compiler";

export function mapTextItems(
  items: RenderSlice["text"],
  timelineTime: number,
): CompositorTextItem[] {
  return items
    .filter((item) => Boolean(item.clip.text?.text))
    .map((item) => {
      const local = timelineTime - item.timelineStart;
      const duration = item.timelineEnd - item.timelineStart;
      const animation = textClipAnimationStyle(item.clip.text, local, duration);
      const translateY = /translateY\((-?[\d.]+)px\)/.exec(animation.transform);
      const scale = /scale\(([\d.]+)\)/.exec(animation.transform);
      const pose = normalizeTextTransform(item.clip.effects);
      const t = item.clip.text;
      const staticOpacity = Number(t?.opacity);
      return {
        clipId: item.clipId,
        text: t?.text ?? "",
        fontSize: Math.max(12, Math.min(200, Number(t?.fontSize) || 42)),
        color: t?.color ?? "#fff",
        align: t?.align ?? "center",
        opacity:
          animation.opacity *
          clipOpacityAtLocalTime(item.clip.effects, duration, local) *
          Math.max(0, Math.min(1, Number.isFinite(staticOpacity) ? staticOpacity : 1)),
        translateY: translateY ? Number(translateY[1]) : 0,
        scale: scale ? Number(scale[1]) : 1,
        fontFamily: t?.fontFamily ?? "system",
        bold: Boolean(t?.bold),
        italic: Boolean(t?.italic),
        strokeColor: t?.strokeColor ?? "#000000",
        strokeWidth: Math.max(0, Number(t?.strokeWidth) || 0),
        flipX: Boolean(t?.flipX),
        flipY: Boolean(t?.flipY),
        poseX: pose.x,
        poseY: pose.y,
        poseScale: pose.scale,
        rotation: pose.rotation,
        underline: Boolean(t?.underline),
        textCase: t?.textCase ?? "none",
        letterSpacing: Number(t?.letterSpacing) || 0,
        lineHeight: Math.max(0.8, Number(t?.lineHeight) || 1.2),
        verticalAlign: t?.verticalAlign ?? "middle",
        backgroundColor: t?.backgroundColor ?? null,
        backgroundPadding: Math.max(0, Number(t?.backgroundPadding) ?? 8),
        backgroundRadius: Math.max(0, Number(t?.backgroundRadius) ?? 0),
        shadowColor: t?.shadowColor ?? null,
        shadowBlur: Math.max(0, Number(t?.shadowBlur) || 0),
        shadowOffsetX: Number(t?.shadowOffsetX) || 0,
        shadowOffsetY: Number(t?.shadowOffsetY) || 0,
        glow: Boolean(t?.glow),
        glowColor: t?.glowColor ?? "#ffffff",
        glowBlur: Math.max(0, Number(t?.glowBlur) || 12),
      };
    });
}

export function compositorVisual(
  slice: RenderSlice,
  pictures: PictureLayer[],
  texts: CompositorTextItem[],
): CompositorVisualItem[] {
  const picById = new Map(pictures.map((layer) => [layer.clipId, layer]));
  const textById = new Map(texts.map((item) => [item.clipId, item]));
  const visual: CompositorVisualItem[] = [];
  for (const item of slice.visual) {
    if (item.kind === "picture") {
      const layer = picById.get(item.clipId);
      if (!layer) continue;
      visual.push({
        type: "picture",
        layer: {
          clipId: layer.clipId,
          frame: layer.frame,
          textureKey: layer.textureKey,
          transform: layer.transform,
          opacity: layer.opacity,
          width: layer.width,
          height: layer.height,
          role: layer.role ?? item.role,
          fitMode: layer.fitMode,
        },
      });
      continue;
    }
    const text = textById.get(item.clipId);
    if (!text) continue;
    visual.push({ type: "text", item: text });
  }
  return visual;
}
