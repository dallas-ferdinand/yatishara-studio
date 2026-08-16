"use client";

import { useEffect } from "react";
import { clipAtPlayhead, clipDuration } from "./editorState";
import { textClipAnimationStyle } from "./editorEffects";
import { textLayoutRect } from "./textLayout";
import { isLegacySystemFont, loadGoogleFont } from "./loadGoogleFont";
import type { EditorClip, EditorProject } from "./types";

type PreviewTextOverlaysProps = {
  project: EditorProject;
  playhead: number;
  canvasWidth: number;
  canvasHeight: number;
  selectedClipId: string | null;
  playing: boolean;
  onSelect: (clipId: string) => void;
  onTogglePlay: () => void;
  /** Match timeline stack: over = above video, under = below video. */
  layer?: "over" | "under";
  /** Hide hit target for the clip that owns the transform overlay. */
  suppressClipId?: string | null;
};

function textHitRect(
  clip: EditorClip,
  canvasWidth: number,
  canvasHeight: number,
  playhead: number,
): { left: number; top: number; width: number; height: number } {
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
  return {
    left: Math.max(0, layout.left),
    top: Math.max(0, layout.top),
    width: Math.min(layout.width, canvasWidth - Math.max(0, layout.left)),
    height: Math.min(layout.height, canvasHeight - Math.max(0, layout.top)),
  };
}

function activeTextClipsAtPlayhead(
  project: EditorProject,
  playhead: number,
): { under: EditorClip[]; over: EditorClip[] } {
  const under: EditorClip[] = [];
  const over: EditorClip[] = [];
  const videoIndex = project.tracks.findIndex((track) => track.kind === "video");
  let topVideoIndex = Number.POSITIVE_INFINITY;
  for (let i = 0; i < project.tracks.length; i += 1) {
    const track = project.tracks[i]!;
    if (track.kind !== "video" || track.hidden) continue;
    if (clipAtPlayhead(project, track.id, playhead)) {
      topVideoIndex = Math.min(topVideoIndex, i);
    }
  }
  if (!Number.isFinite(topVideoIndex) && videoIndex >= 0) {
    topVideoIndex = videoIndex;
  }
  for (let i = 0; i < project.tracks.length; i += 1) {
    const track = project.tracks[i]!;
    if (track.kind !== "text" || track.hidden) continue;
    const clip = clipAtPlayhead(project, track.id, playhead);
    if (!clip?.text?.text) continue;
    if (i < topVideoIndex) over.push(clip);
    else if (i > topVideoIndex) under.push(clip);
  }
  return { under, over };
}

export function PreviewTextOverlays({
  project,
  playhead,
  canvasWidth,
  canvasHeight,
  selectedClipId,
  playing,
  onSelect,
  onTogglePlay,
  layer = "over",
  suppressClipId = null,
}: PreviewTextOverlaysProps) {
  const { under, over } = activeTextClipsAtPlayhead(project, playhead);
  const clips = layer === "under" ? under : over;

  useEffect(() => {
    const families = new Set<string>();
    for (const clip of project.clips) {
      const family = clip.text?.fontFamily;
      if (!family || isLegacySystemFont(family)) continue;
      families.add(family);
    }
    for (const family of families) {
      void loadGoogleFont(family);
    }
  }, [project.clips]);

  if (playing) return null;
  if (clips.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;

  return (
    <div
      className={`studio-editor-text-layer is-${layer}`}
      data-text-layer={layer}
    >
      {clips
        .filter((clip) => clip.id !== suppressClipId)
        .map((clip) => {
        const rect = textHitRect(clip, canvasWidth, canvasHeight, playhead);
        const selected = selectedClipId === clip.id;
        const label = clip.text?.text ?? clip.label;
        return (
          <button
            key={clip.id}
            type="button"
            className={`studio-editor-text-hit${selected ? " is-selected" : ""}`}
            style={{
              left: `${(rect.left / canvasWidth) * 100}%`,
              top: `${(rect.top / canvasHeight) * 100}%`,
              width: `${(rect.width / canvasWidth) * 100}%`,
              height: `${(rect.height / canvasHeight) * 100}%`,
            }}
            aria-label={`Select text: ${label.slice(0, 48)}`}
            title={label}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (playing) {
                onTogglePlay();
                return;
              }
              onSelect(clip.id);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        );
      })}
    </div>
  );
}
