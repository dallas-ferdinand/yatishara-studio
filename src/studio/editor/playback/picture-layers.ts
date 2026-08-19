import { normalizeClipTransform, resolveFitMode, type MediaFitMode } from "../clipTransform";
import { clipOpacityAtLocalTime } from "../editorEffects";
import type { CompositorDrawable } from "./compositor-2d";
import type { RenderSlice } from "./timeline-compiler";

export type PictureLayer = {
  clipId: string;
  frame?: CompositorDrawable;
  textureKey?: string;
  transform: [number, number, number, number];
  opacity: number;
  width?: number;
  height?: number;
  role?: "single" | "outgoing" | "incoming";
  fitMode?: MediaFitMode;
};

export type ResolvedPictureLane = {
  clipId: string;
  frame?: CompositorDrawable;
  textureKey?: string;
  width?: number;
  height?: number;
};

/**
 * slice.video is top-lane-first. The compositor paints bottom → top.
 *
 * Every resolvable lane is a layer. There is no A/B/middle split: that
 * model dropped anything that failed to bind as "stack" and left only
 * the top still and the bottom movie.
 */
export function pictureLayersBottomToTop(
  lanes: Array<ResolvedPictureLane | null | undefined>,
  slice: RenderSlice,
): PictureLayer[] {
  const layers: PictureLayer[] = [];
  for (let index = lanes.length - 1; index >= 0; index -= 1) {
    const lane = lanes[index];
    const sample = slice.video[index];
    if (!lane || !sample) continue;
    if (!lane.frame && !lane.textureKey) continue;
    const duration = sample.clip.timelineEnd - sample.clip.timelineStart;
    const local = slice.timelineTime - sample.clip.timelineStart;
    const transform = normalizeClipTransform(sample.clip.clip.effects);
    layers.push({
      clipId: lane.clipId,
      frame: lane.frame,
      textureKey: lane.textureKey,
      transform: [transform.scale, transform.x, transform.y, transform.rotation],
      opacity: clipOpacityAtLocalTime(sample.clip.clip.effects, duration, local),
      width: lane.width,
      height: lane.height,
      role: sample.role,
      fitMode: resolveFitMode(sample.clip.clip.effects, sample.clip.kind),
    });
  }
  return layers;
}
