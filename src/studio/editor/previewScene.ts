"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clipDuration } from "./editorState";
import {
  contentRectForTransform,
  normalizeClipTransform,
  overlaySourceSize,
  resolveFitMode,
} from "./clipTransform";
import { textClipAnimationStyle } from "./editorEffects";
import { normalizeTextTransform, textLayoutRect } from "./textLayout";
import { hitTransformHandle, pointHitsContentRect } from "./transformHit";
import type { ClipKind, EditorClip, EditorMediaItem, EditorProject } from "./types";

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
    if (track.kind !== "video" && track.kind !== "text") continue;
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
  probedSizes: Readonly<Record<string, { width: number; height: number }>> = {},
): { width: number; height: number } {
  const media = clip.assetId ? mediaById.get(clip.assetId) : undefined;
  const still = clip.kind === "image" || media?.kind === "image";
  if (still && clip.assetId) {
    const probed = overlaySourceSize(probedSizes[clip.assetId], null);
    if (probed) return probed;
    const decoded = overlaySourceSize(sourceSizes[clip.assetId], null);
    if (decoded) return decoded;
    return { width: canvasWidth, height: canvasHeight };
  }
  const decoded = clip.assetId ? sourceSizes[clip.assetId] : undefined;
  const measured = overlaySourceSize(decoded, null);
  if (measured) return measured;
  const fromMedia = overlaySourceSize(null, media);
  if (fromMedia) return fromMedia;
  return { width: canvasWidth, height: canvasHeight };
}

export function pictureContentRect(
  clip: EditorClip,
  mediaById: ReadonlyMap<string, EditorMediaItem>,
  sourceSizes: Readonly<Record<string, { width: number; height: number }>>,
  canvasWidth: number,
  canvasHeight: number,
  probedSizes: Readonly<Record<string, { width: number; height: number }>> = {},
): { left: number; top: number; width: number; height: number; rotation: number } {
  const source = pictureSourceSize(
    clip,
    mediaById,
    sourceSizes,
    canvasWidth,
    canvasHeight,
    probedSizes,
  );
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
  probedSizes: Readonly<Record<string, { width: number; height: number }>> = {},
): { left: number; top: number; width: number; height: number; rotation: number } {
  if (item.kind === "text") {
    return textContentRect(item.clip, canvasWidth, canvasHeight, playhead);
  }
  return pictureContentRect(
    item.clip,
    mediaById,
    sourceSizes,
    canvasWidth,
    canvasHeight,
    probedSizes,
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
 * Top lane wins. Hits the fitted bitmap rect / text box.
 * Stills contain (letterbox); video covers. Same rect as paint and overlay.
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
  probedSizes: Readonly<Record<string, { width: number; height: number }>> = {},
): SceneItem | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) return null;
  for (const item of sceneItemsTopToBottom(project, playhead)) {
    const rect = sceneItemContentRect(
      item,
      mediaById,
      sourceSizes,
      canvasWidth,
      canvasHeight,
      playhead,
      probedSizes,
    );
    if (pointHitsSceneItem(nx, ny, rect, canvasWidth, canvasHeight)) {
      return item;
    }
  }
  return null;
}

export function clipIsPictureKind(kind: ClipKind | undefined): boolean {
  return kind === "video" || kind === "image";
}

/**
 * Image assets often have no stored width/height. Probe natural size from the
 * signed URL so the fitted rect matches the compositor still.
 */
export function useProbedImageSizes(
  clips: readonly EditorClip[],
  mediaById: ReadonlyMap<string, EditorMediaItem>,
): Readonly<Record<string, { width: number; height: number }>> {
  const [probed, setProbed] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const probedRef = useRef(probed);
  probedRef.current = probed;
  const mediaRef = useRef(mediaById);
  mediaRef.current = mediaById;

  const missingKey = useMemo(() => {
    const ids: string[] = [];
    for (const clip of clips) {
      if (clip.kind !== "image" || !clip.assetId) continue;
      if (probed[clip.assetId]) continue;
      const media = mediaById.get(clip.assetId);
      if (!media?.url && !media?.thumbnailUrl) continue;
      ids.push(clip.assetId);
    }
    return ids.sort().join(",");
  }, [clips, mediaById, probed]);

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const images: HTMLImageElement[] = [];
    for (const assetId of missingKey.split(",")) {
      if (probedRef.current[assetId]) continue;
      const media = mediaRef.current.get(assetId);
      const url = media?.url || media?.thumbnailUrl;
      if (!url) continue;
      const img = new Image();
      images.push(img);
      img.onload = () => {
        if (cancelled) return;
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (width < 2 || height < 2) return;
        setProbed((current) => {
          const prev = current[assetId];
          if (prev?.width === width && prev?.height === height) return current;
          return { ...current, [assetId]: { width, height } };
        });
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
      for (const img of images) {
        img.onload = null;
        img.src = "";
      }
    };
  }, [missingKey]);

  return probed;
}
