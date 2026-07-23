import type { EditorClip, EditorProject } from "./types";
import { clipDuration } from "./editorState";

export const SNAP_THRESHOLD_PX = 10;

export function snapThresholdSec(pixelsPerSecond: number): number {
  return SNAP_THRESHOLD_PX / Math.max(pixelsPerSecond, 1);
}

export function collectSnapTimes(
  project: EditorProject,
  _trackId: string,
  excludeClipId: string | null,
  playhead: number,
): number[] {
  const times = new Set<number>([0]);
  if (Number.isFinite(playhead) && playhead >= 0) {
    times.add(playhead);
  }
  // Every clip edge — drops can align vertically with clips on other lanes.
  for (const clip of project.clips) {
    if (clip.id === excludeClipId) continue;
    times.add(clip.startTime);
    times.add(clip.startTime + clipDuration(clip));
  }
  return [...times].sort((a, b) => a - b);
}

export function nearestSnap(
  time: number,
  snapTimes: number[],
  thresholdSec: number,
): { time: number; snapped: boolean; guide: number | null } {
  let best = time;
  let bestDist = thresholdSec;
  let guide: number | null = null;

  for (const target of snapTimes) {
    const dist = Math.abs(time - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
      guide = target;
    }
  }

  return { time: best, snapped: guide !== null, guide };
}

export function snapClipStart(
  proposedStart: number,
  clipDurationSec: number,
  snapTimes: number[],
  thresholdSec: number,
  disableSnap = false,
): { startTime: number; guide: number | null } {
  const start = Math.max(0, proposedStart);
  if (disableSnap) {
    return { startTime: start, guide: null };
  }
  const end = start + clipDurationSec;

  const startSnap = nearestSnap(start, snapTimes, thresholdSec);
  if (startSnap.snapped) {
    return { startTime: startSnap.time, guide: startSnap.guide };
  }

  const endSnap = nearestSnap(end, snapTimes, thresholdSec);
  if (endSnap.snapped) {
    return { startTime: Math.max(0, endSnap.time - clipDurationSec), guide: endSnap.guide };
  }

  return { startTime: start, guide: null };
}

export function snapClipMove(
  clip: EditorClip,
  proposedStart: number,
  snapTimes: number[],
  thresholdSec: number,
  disableSnap = false,
): { startTime: number; guide: number | null } {
  return snapClipStart(proposedStart, clipDuration(clip), snapTimes, thresholdSec, disableSnap);
}

export function snapTrimLeft(
  clip: EditorClip,
  proposedTrimIn: number,
  proposedStart: number,
  snapTimes: number[],
  thresholdSec: number,
  disableSnap = false,
): { trimIn: number; startTime: number; guide: number | null } {
  if (disableSnap) {
    return { trimIn: proposedTrimIn, startTime: proposedStart, guide: null };
  }
  const startSnap = nearestSnap(proposedStart, snapTimes, thresholdSec);
  if (startSnap.snapped) {
    const delta = startSnap.time - proposedStart;
    return {
      trimIn: Math.max(0, proposedTrimIn + delta),
      startTime: startSnap.time,
      guide: startSnap.guide,
    };
  }
  return { trimIn: proposedTrimIn, startTime: proposedStart, guide: null };
}

export function snapTrimRight(
  clip: EditorClip,
  proposedTrimOut: number,
  snapTimes: number[],
  thresholdSec: number,
  disableSnap = false,
): { trimOut: number; guide: number | null } {
  if (disableSnap) {
    return { trimOut: proposedTrimOut, guide: null };
  }
  const endTime = clip.startTime + (proposedTrimOut - clip.trimIn);
  const endSnap = nearestSnap(endTime, snapTimes, thresholdSec);
  if (endSnap.snapped) {
    const delta = endSnap.time - endTime;
    return { trimOut: proposedTrimOut + delta, guide: endSnap.guide };
  }
  return { trimOut: proposedTrimOut, guide: null };
}

export function snapDropStart(
  proposedStart: number,
  clipDurationSec: number,
  snapTimes: number[],
  thresholdSec: number,
): { startTime: number; guide: number | null } {
  return snapClipStart(proposedStart, clipDurationSec, snapTimes, thresholdSec);
}
