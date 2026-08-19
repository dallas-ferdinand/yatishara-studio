"use client";

import { clipDuration } from "./editorState";
import {
  contentRectForTransform,
  normalizeClipTransform,
  overlaySourceSize,
  resolveFitMode,
} from "./clipTransform";
import { textClipAnimationStyle } from "./editorEffects";
import type { PaintedSceneHit } from "./playback/compositor-2d";
import { normalizeTextTransform, textLayoutRect } from "./textLayout";
import { hitTransformHandle, pointHitsContentRect } from "./transformHit";
import type { ClipKind, EditorClip, EditorMediaItem, EditorProject } from "./types";

export type { PaintedSceneHit };

export type SceneItemKind = "video" | "image" | "text";

export type SceneItem = {
  clip: EditorClip;
  kind: SceneItemKind;
  trackIndex: number;
};

function sceneKind(clip: EditorClip): SceneItemKind | null {
  if (clip.kind === "text") return "text";
  if (clip.kind === "image") return "image";
  if (clip.kind === "video") return "video";
  return null;
}

/** Same-track overlays: text, then stills, then video. Matches paint (stills sit on video). */
function sceneHitRank(kind: SceneItemKind): number {
  if (kind === "text") return 0;
  if (kind === "image") return 1;
  return 2;
}

/**
 * Every overlapping picture/text clip at the playhead — not one per track.
 * The compositor paints all overlapping lanes; one-per-track dropped stills
 * stacked on the same row as a video, so clicks fell through.
 */
export function sceneItemsAtPlayhead(
  project: EditorProject,
  playhead: number,
): SceneItem[] {
  const trackIndexById = new Map(
    project.tracks.map((track, trackIndex) => [track.id, trackIndex]),
  );
  const items: SceneItem[] = [];
  for (const clip of project.clips) {
    const track = project.tracks.find((item) => item.id === clip.trackId);
    if (!track || track.hidden) continue;
    // Picture stills were briefly stored on invalid kind:"image" lanes —
    // skip only audio so overlay stills still pick.
    if (track.kind === "audio") continue;
    const kind = sceneKind(clip);
    if (!kind) continue;
    if (kind === "text" && !clip.text?.text) continue;
    if (
      playhead < clip.startTime ||
      playhead >= clip.startTime + clipDuration(clip)
    ) {
      continue;
    }
    items.push({
      clip,
      kind,
      trackIndex: trackIndexById.get(clip.trackId) ?? 0,
    });
  }
  return items;
}

function sceneStackKey(a: SceneItem, b: SceneItem): number {
  if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
  const rank = sceneHitRank(a.kind) - sceneHitRank(b.kind);
  if (rank !== 0) return rank;
  if (a.clip.startTime !== b.clip.startTime) {
    return a.clip.startTime - b.clip.startTime;
  }
  return a.clip.id.localeCompare(b.clip.id);
}

/** Paint order: bottom of timeline first, top lane last. */
export function sceneItemsBottomToTop(
  project: EditorProject,
  playhead: number,
): SceneItem[] {
  return sceneItemsAtPlayhead(project, playhead)
    .slice()
    .sort((a, b) => -sceneStackKey(a, b));
}

/** Hit-test order: top of timeline first. Stills over video on the same track. */
export function sceneItemsTopToBottom(
  project: EditorProject,
  playhead: number,
): SceneItem[] {
  return sceneItemsAtPlayhead(project, playhead)
    .slice()
    .sort(sceneStackKey);
}

export function pictureSourceSize(
  clip: EditorClip,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number } | null {
  const media = clip.assetId ? mediaById.get(clip.assetId) : undefined;
  const decoded = clip.assetId ? sourceSizes[clip.assetId] : undefined;
  const measured = overlaySourceSize(decoded, null);
  if (measured) return measured;
  const still = clip.kind === "image" || media?.kind === "image";
  if (still) return null;
  const fromMedia = overlaySourceSize(null, media);
  if (fromMedia) return fromMedia;
  if (canvasWidth > 1 && canvasHeight > 1) {
    return { width: canvasWidth, height: canvasHeight };
  }
  return null;
}

export function pictureContentRect(
  clip: EditorClip,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  canvasWidth: number,
  canvasHeight: number,
): { left: number; top: number; width: number; height: number; rotation: number } | null {
  const source = pictureSourceSize(
    clip,
    mediaById,
    sourceSizes,
    canvasWidth,
    canvasHeight,
  );
  if (!source) return null;
  const transform = normalizeClipTransform(clip.effects);
  const rect = contentRectForTransform(
    transform,
    canvasWidth,
    canvasHeight,
    source.width,
    source.height,
    resolveFitMode(clip.effects, clip.kind),
  );
  return { ...rect, rotation: transform.rotation };
}

export function textContentRect(
  clip: EditorClip,
  canvasWidth: number,
  canvasHeight: number,
  playhead: number,
): { left: number; top: number; width: number; height: number; rotation: number } {
  const content = clip.text;
  const duration = clipDuration(clip);
  const local = playhead - clip.startTime;
  const animation = textClipAnimationStyle(content, local, duration);
  const translateYMatch = /translateY\((-?[\d.]+)px\)/.exec(animation.transform);
  const scaleMatch = /scale\(([\d.]+)\)/.exec(animation.transform);
  const translateY = translateYMatch ? Number(translateYMatch[1]) : 0;
  const animScale = scaleMatch ? Number(scaleMatch[1]) : 1;
  const layout = textLayoutRect(
    content,
    clip.effects,
    canvasWidth,
    canvasHeight,
    translateY,
    animScale,
  );
  const transform = normalizeTextTransform(clip.effects);
  return {
    left: layout.left / Math.max(1, canvasWidth),
    top: layout.top / Math.max(1, canvasHeight),
    width: layout.width / Math.max(1, canvasWidth),
    height: layout.height / Math.max(1, canvasHeight),
    rotation: transform.rotation,
  };
}

export function sceneItemContentRect(
  item: SceneItem,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  canvasWidth: number,
  canvasHeight: number,
  playhead: number,
): { left: number; top: number; width: number; height: number; rotation: number } | null {
  if (item.kind === "text") {
    return textContentRect(item.clip, canvasWidth, canvasHeight, playhead);
  }
  return pictureContentRect(
    item.clip,
    mediaById,
    sourceSizes,
    canvasWidth,
    canvasHeight,
  );
}

function pointHitsSceneItem(
  nx: number,
  ny: number,
  rect: { left: number; top: number; width: number; height: number; rotation: number },
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (hitTransformHandle(nx, ny, rect, rect.rotation, canvasWidth, canvasHeight)) {
    return true;
  }
  return pointHitsContentRect(nx, ny, rect, rect.rotation, canvasWidth, canvasHeight);
}

/**
 * Video cover-fills, so a missing size still becomes a full-frame box.
 * Stills contain-letterbox and used to return null — the click then fell
 * through to the video underneath. Occupy the frame until paint publishes
 * a real quad so stills pick like every other clip.
 */
export function pictureOccupancyRect(
  rotation: number,
): { left: number; top: number; width: number; height: number; rotation: number } {
  return { left: 0, top: 0, width: 1, height: 1, rotation };
}

/**
 * Top lane wins. Hits the fitted bitmap rect / text box.
 * Picture quads prefer the compositor's last paint when provided.
 */
export function hitSceneItemAtPoint(
  nx: number,
  ny: number,
  project: EditorProject,
  playhead: number,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  canvasWidth: number,
  canvasHeight: number,
  paintedHits: readonly PaintedSceneHit[] = [],
): SceneItem | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) return null;
  const paintedById = new Map(paintedHits.map((hit) => [hit.clipId, hit]));
  for (const item of sceneItemsTopToBottom(project, playhead)) {
    const painted = item.kind === "text" ? undefined : paintedById.get(item.clip.id);
    const computed = sceneItemContentRect(
      item,
      mediaById,
      sourceSizes,
      canvasWidth,
      canvasHeight,
      playhead,
    );
    const rect =
      painted ??
      computed ??
      (item.kind === "image"
        ? pictureOccupancyRect(normalizeClipTransform(item.clip.effects).rotation)
        : null);
    if (!rect) continue;
    if (pointHitsSceneItem(nx, ny, rect, canvasWidth, canvasHeight)) {
      return item;
    }
  }
  return null;
}

export function clipIsPictureKind(kind: ClipKind | undefined): boolean {
  return kind === "video" || kind === "image";
}
