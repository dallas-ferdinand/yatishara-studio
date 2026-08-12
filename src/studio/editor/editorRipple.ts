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

/** Base storyline — stable V1 id (not “first video in array”, which breaks when inserting above). */
export function mainStoryTrackId(project: EditorProject): string | null {
  const byId = project.tracks.find((track) => track.id === "track-v1" && track.kind === "video");
  if (byId) return byId.id;
  return project.tracks.find((track) => track.kind === "video")?.id ?? null;
}

export function isMainStoryTrack(project: EditorProject, trackId: string): boolean {
  const mainId = mainStoryTrackId(project);
  return mainId !== null && mainId === trackId;
}

/** Packed start times for remaining clips after one leaves (or is excluded). */
export function collapsePlacementsForTrack(
  project: EditorProject,
  trackId: string,
  excludeId?: string | null,
): RipplePlacement[] {
  const others = trackClipsSorted(project, trackId, excludeId);
  let t = 0;
  return others.map((clip) => {
    const placement: RipplePlacement = { clipId: clip.id, startTime: t, trackId };
    t += clipDuration(clip);
    return placement;
  });
}

export function trackClipsSorted(
  project: EditorProject,
  trackId: string,
  excludeId?: string | null,
): EditorClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId && clip.id !== excludeId)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}

/** Which slot the drop probe falls into among sorted neighbors (left-edge vs clip midpoints). */
export function insertIndexForTime(sortedClips: EditorClip[], probeTime: number): number {
  let index = 0;
  for (const clip of sortedClips) {
    const mid = clip.startTime + clipDuration(clip) / 2;
    if (probeTime >= mid) index += 1;
    else break;
  }
  return Math.min(index, sortedClips.length);
}

function packPlacements(
  ordered: EditorClip[],
  trackId: string,
): RipplePlacement[] {
  let t = 0;
  return ordered.map((clip) => {
    const placement: RipplePlacement = { clipId: clip.id, startTime: t, trackId };
    t += clipDuration(clip);
    return placement;
  });
}

/** Main storyline: insert by left-edge probe, pack end-to-end from 0 (no gaps). */
function computePackedLayout(args: {
  project: EditorProject;
  trackId: string;
  draggedClip: EditorClip;
  preferredStart: number;
}): RipplePlacement[] {
  const { project, trackId, draggedClip, preferredStart } = args;
  const others = trackClipsSorted(project, trackId, draggedClip.id);
  const insertIndex = insertIndexForTime(others, Math.max(0, preferredStart));
  const ordered: EditorClip[] = [
    ...others.slice(0, insertIndex),
    { ...draggedClip, trackId },
    ...others.slice(insertIndex),
  ];
  return packPlacements(ordered, trackId);
}

function placementsOnTrack(clips: EditorClip[], trackId: string): RipplePlacement[] {
  return clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
    .map((clip) => ({
      clipId: clip.id,
      startTime: clip.startTime,
      trackId: clip.trackId,
    }));
}

function overlapsOnTrack(start: number, duration: number, others: EditorClip[]): boolean {
  const end = start + duration;
  return others.some((clip) => {
    const clipEnd = clip.startTime + clipDuration(clip);
    return start < clipEnd - 1e-9 && end > clip.startTime + 1e-9;
  });
}

function applyPlacements(clips: EditorClip[], placements: RipplePlacement[]): EditorClip[] {
  const byId = new Map(placements.map((placement) => [placement.clipId, placement]));
  return clips.map((clip) => {
    const placement = byId.get(clip.id);
    if (!placement) return clip;
    return {
      ...clip,
      startTime: placement.startTime,
      trackId: placement.trackId,
    };
  });
}

/**
 * Overlay / audio / text: keep gaps when the drop fits. If the slot is too
 * small or occupied, stay there and shove later clips right (live hover too).
 * Dropping on the first half of the first clip inserts at the lane start.
 */
function computeOverlayLayout(args: {
  project: EditorProject;
  trackId: string;
  draggedClip: EditorClip;
  preferredStart: number;
}): RipplePlacement[] {
  const { project, trackId, draggedClip, preferredStart } = args;
  const others = trackClipsSorted(project, trackId, draggedClip.id);
  const duration = clipDuration(draggedClip);
  const start = Math.max(0, preferredStart);
  let draggedStart = start;
  if (overlapsOnTrack(start, duration, others)) {
    const insertIndex = insertIndexForTime(others, start);
    if (insertIndex === 0 && others[0]) {
      draggedStart = Math.max(0, Math.min(start, others[0].startTime));
    }
  }
  const dragged = { ...draggedClip, startTime: draggedStart, trackId };
  const provisional = project.clips.some((clip) => clip.id === dragged.id)
    ? project.clips.map((clip) => (clip.id === dragged.id ? dragged : clip))
    : [...project.clips, dragged];
  return placementsOnTrack(resolveTrackOverlaps(provisional, trackId, dragged.id), trackId);
}

/**
 * Live drop layout. Main video line packs tight; overlay lanes keep gaps or shove.
 */
export function computeRippleLayout(args: {
  project: EditorProject;
  trackId: string;
  draggedClip: EditorClip;
  /** Preferred left edge / insert probe. */
  centerTime: number;
}): RipplePlacement[] {
  const preferredStart = Math.max(0, args.centerTime);
  if (isMainStoryTrack(args.project, args.trackId)) {
    return computePackedLayout({ ...args, preferredStart });
  }
  return computeOverlayLayout({ ...args, preferredStart });
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
  const preferredStart = Math.max(0, args.centerTime);
  const clip = { ...args.clip, startTime: preferredStart, trackId: args.trackId };

  if (isMainStoryTrack(args.project, args.trackId)) {
    const others = trackClipsSorted(args.project, args.trackId, null);
    const insertIndex = insertIndexForTime(others, preferredStart);
    const ordered = [...others.slice(0, insertIndex), clip, ...others.slice(insertIndex)];
    return packPlacements(ordered, args.trackId);
  }

  return computeOverlayLayout({
    project: args.project,
    trackId: args.trackId,
    draggedClip: clip,
    preferredStart,
  });
}

/**
 * Pack all clips on a track end-to-end from 0 — closes gaps after delete/leave on the main line.
 */
export function collapseTrackLeft(clips: EditorClip[], trackId: string): EditorClip[] {
  const onTrack = clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));

  if (onTrack.length === 0) return clips;

  let t = 0;
  const nextStart = new Map<string, number>();
  for (const clip of onTrack) {
    nextStart.set(clip.id, t);
    t += clipDuration(clip);
  }

  let changed = false;
  const next = clips.map((clip) => {
    const start = nextStart.get(clip.id);
    if (start === undefined || start === clip.startTime) return clip;
    changed = true;
    return { ...clip, startTime: start };
  });
  return changed ? next : clips;
}

/**
 * Push clips right so nothing on a track overlaps.
 * Keeps intentional gaps; only moves a clip when it would collide with the previous one.
 * `preferClipId` wins start-time ties (the clip just dropped/edited).
 */
export function resolveTrackOverlaps(
  clips: EditorClip[],
  trackId: string,
  preferClipId?: string | null,
): EditorClip[] {
  const onTrack = clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (preferClipId && a.id === preferClipId) return -1;
      if (preferClipId && b.id === preferClipId) return 1;
      return a.id.localeCompare(b.id);
    });

  if (onTrack.length <= 1) return clips;

  let cursor = 0;
  const nextStart = new Map<string, number>();
  for (const clip of onTrack) {
    const start = Math.max(0, Math.max(clip.startTime, cursor));
    nextStart.set(clip.id, start);
    cursor = start + clipDuration(clip);
  }

  let changed = false;
  const next = clips.map((clip) => {
    const start = nextStart.get(clip.id);
    if (start === undefined || start === clip.startTime) return clip;
    changed = true;
    return { ...clip, startTime: start };
  });
  return changed ? next : clips;
}

/**
 * Drop a focus clip onto a track.
 * Main storyline: pack end-to-end from 0.
 * Overlay lanes: keep gaps when the drop fits; otherwise shove later clips right.
 */
export function arrangeTrackForDrop(args: {
  project: EditorProject;
  trackId: string;
  focusClip: EditorClip;
  preferredStart: number;
}): EditorClip[] {
  const { project, trackId, focusClip, preferredStart } = args;
  const start = Math.max(0, preferredStart);
  const dragged = { ...focusClip, startTime: start, trackId };

  const placements = isMainStoryTrack(project, trackId)
    ? computePackedLayout({
        project: {
          ...project,
          clips: project.clips.map((clip) => (clip.id === focusClip.id ? dragged : clip)),
        },
        trackId,
        draggedClip: dragged,
        preferredStart: start,
      })
    : computeOverlayLayout({
        project,
        trackId,
        draggedClip: dragged,
        preferredStart: start,
      });
  return applyPlacements(project.clips, placements);
}
