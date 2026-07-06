import type { EditorClip, EditorProject } from "./types";
import { clipDuration } from "./editorState";

export type RipplePlacement = {
  clipId: string;
  startTime: number;
  trackId: string;
};

export type RipplePreview = {
  trackId: string;
  draggedClipId: string;
  placements: RipplePlacement[];
};

export function trackClipsSorted(
  project: EditorProject,
  trackId: string,
  excludeId?: string | null,
): EditorClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId && clip.id !== excludeId)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}

/** Which slot the clip center falls into among sorted neighbors. */
export function insertIndexForTime(sortedClips: EditorClip[], centerTime: number): number {
  let index = 0;
  for (const clip of sortedClips) {
    const mid = clip.startTime + clipDuration(clip) / 2;
    if (centerTime > mid) index += 1;
    else break;
  }
  return Math.min(index, sortedClips.length);
}

export function computeRippleLayout(args: {
  project: EditorProject;
  trackId: string;
  draggedClip: EditorClip;
  centerTime: number;
}): RipplePlacement[] {
  const { project, trackId, draggedClip, centerTime } = args;
  const others = trackClipsSorted(project, trackId, draggedClip.id);
  const insertIndex = insertIndexForTime(others, centerTime);
  const ordered: EditorClip[] = [
    ...others.slice(0, insertIndex),
    { ...draggedClip, trackId },
    ...others.slice(insertIndex),
  ];

  let t = 0;
  return ordered.map((clip) => {
    const placement: RipplePlacement = { clipId: clip.id, startTime: t, trackId };
    t += clipDuration(clip);
    return placement;
  });
}

export function placementMap(preview: RipplePreview | null): Map<string, RipplePlacement> {
  const map = new Map<string, RipplePlacement>();
  if (!preview) return map;
  for (const placement of preview.placements) {
    map.set(placement.clipId, placement);
  }
  return map;
}

export function computeRippleInsertForNewClip(args: {
  project: EditorProject;
  trackId: string;
  clip: EditorClip;
  centerTime: number;
}): RipplePlacement[] {
  const others = trackClipsSorted(args.project, args.trackId, null);
  const insertIndex = insertIndexForTime(others, args.centerTime);
  const ordered = [...others.slice(0, insertIndex), args.clip, ...others.slice(insertIndex)];
  let t = 0;
  return ordered.map((clip) => {
    const placement: RipplePlacement = {
      clipId: clip.id,
      startTime: t,
      trackId: args.trackId,
    };
    t += clipDuration(clip);
    return placement;
  });
}
