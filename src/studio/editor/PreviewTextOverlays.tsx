"use client";

import { clipAtPlayhead, clipDuration } from "./editorState";
import { textAnimationStyle } from "./editorEffects";
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
};

/** Match compositor.worker text placement (baseline middle at ~82% height). */
function textHitRect(
  clip: EditorClip,
  canvasWidth: number,
  canvasHeight: number,
  playhead: number,
): { left: number; top: number; width: number; height: number } {
  const content = clip.text;
  const text = content?.text ?? "";
  const fontSize = content?.fontSize ?? 42;
  const align = content?.align ?? "center";
  const duration = clipDuration(clip);
  const local = playhead - clip.startTime;
  const animation = textAnimationStyle(
    content?.animation,
    content?.animationDuration ?? 0.5,
    local,
    duration,
  );
  const translateYMatch = /translateY\((-?[\d.]+)px\)/.exec(animation.transform);
  const scaleMatch = /scale\(([\d.]+)\)/.exec(animation.transform);
  const translateY = translateYMatch ? Number(translateYMatch[1]) : 0;
  const scale = scaleMatch ? Number(scaleMatch[1]) : 1;

  const height = Math.max(18, fontSize * 1.35 * scale);
  const width = Math.min(
    canvasWidth * 0.84,
    Math.max(fontSize * 1.4 * scale, text.length * fontSize * 0.55 * scale),
  );
  const anchorX =
    align === "left"
      ? canvasWidth * 0.08
      : align === "right"
        ? canvasWidth * 0.92
        : canvasWidth * 0.5;
  const left =
    align === "left"
      ? anchorX
      : align === "right"
        ? anchorX - width
        : anchorX - width / 2;
  const centerY = canvasHeight * 0.82 + translateY;
  const top = centerY - height / 2;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.min(width, canvasWidth - Math.max(0, left)),
    height: Math.min(height, canvasHeight - Math.max(0, top)),
  };
}

function activeTextClipsAtPlayhead(
  project: EditorProject,
  playhead: number,
): { under: EditorClip[]; over: EditorClip[] } {
  const under: EditorClip[] = [];
  const over: EditorClip[] = [];
  const videoIndex = project.tracks.findIndex((track) => track.kind === "video");
  // Topmost active video lane (lowest track index among video tracks with a clip).
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
}: PreviewTextOverlaysProps) {
  const { under, over } = activeTextClipsAtPlayhead(project, playhead);
  const clips = layer === "under" ? under : over;

  if (clips.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;

  return (
    <div
      className={`studio-editor-text-layer is-${layer}`}
      data-text-layer={layer}
    >
      {clips.map((clip) => {
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
              // Beat the video transform hit layer underneath (over layer only).
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
