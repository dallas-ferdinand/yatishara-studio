import type { EditorClip, EditorProject } from "./types";
import { clipDurationSec } from "./projectContract";

export const SNAP_THRESHOLD_PX = 6;

export function snapThresholdSec(pixelsPerSecond: number): number {
  return SNAP_THRESHOLD_PX / Math.max(pixelsPerSecond, 1);
}

export function collectSnapTimes(
  project: EditorProject,
  _trackId: string,
  excludeClipId: string | null,
  playhead: number,
  options?: { includeTimelineStart?: boolean },
): number[] {
  const times = new Set<number>();
  if (options?.includeTimelineStart !== false) {
    times.add(0);
  }
  if (Number.isFinite(playhead) && playhead >= 0) {
    times.add(playhead);
  }
  // Every clip edge — drops can align vertically with clips on other lanes.
  for (const clip of project.clips) {
    if (clip.id === excludeClipId) continue;
    times.add(clip.startTime);
    times.add(clip.startTime + clipDurationSec(clip));
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
  return snapClipStart(proposedStart, clipDurationSec(clip), snapTimes, thresholdSec, disableSnap);
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
  durationSec: number,
  snapTimes: number[],
  thresholdSec: number,
): { startTime: number; guide: number | null } {
  return snapClipStart(proposedStart, durationSec, snapTimes, thresholdSec);
}

export const OVERLAY_SNAP_STORAGE_KEY = "studio-editor-overlay-snap";

export function readOverlaySnapEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(OVERLAY_SNAP_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeOverlaySnapEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(OVERLAY_SNAP_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type OverlayDropSticky = {
  side: "before" | "after";
  leftDock: number;
  rightDock: number;
};

/**
 * Overlay / secondary lanes: never move neighbors, never pack gaps.
 * Valid gap → keep preferredStart (optional magnet to edges).
 * Overlap / too-small gap → park at the touching dock; stay there until the
 * pointer crosses the midpoint toward the other dock.
 */
export function resolveSecondaryDropStart(args: {
  preferredStart: number;
  durationSec: number;
  others: Array<{ startTime: number; durationSec: number }>;
  snapEnabled?: boolean;
  snapTimes?: number[];
  thresholdSec?: number;
  sticky?: OverlayDropSticky | null;
}): { startTime: number; guide: number | null; sticky: OverlayDropSticky | null } {
  const duration = Math.max(0, args.durationSec);
  const raw = Math.max(0, args.preferredStart);
  const intervals = args.others
    .map((clip) => ({ start: clip.startTime, end: clip.startTime + clip.durationSec }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const overlaps = (start: number) => {
    const end = start + duration;
    return intervals.some((span) => start < span.end - 1e-9 && end > span.start + 1e-9);
  };

  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const span of intervals) {
    if (span.start > cursor + 1e-9) gaps.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  gaps.push({ start: cursor, end: Number.POSITIVE_INFINITY });
  const usable = gaps.filter((gap) => gap.end - gap.start >= duration - 1e-9);

  let candidate = raw;
  let guide: number | null = null;
  if (args.snapEnabled && args.snapTimes?.length && (args.thresholdSec ?? 0) > 0) {
    const snapped = snapClipStart(raw, duration, args.snapTimes, args.thresholdSec ?? 0);
    if (!overlaps(snapped.startTime)) {
      candidate = snapped.startTime;
      guide = snapped.guide;
    }
  }

  if (!overlaps(candidate)) {
    return { startTime: candidate, guide, sticky: null };
  }

  let leftDock: number | null = null;
  let rightDock: number | null = null;
  for (const gap of usable) {
    const minStart = Math.max(0, gap.start);
    const maxStart = Number.isFinite(gap.end) ? gap.end - duration : Number.POSITIVE_INFINITY;
    if (maxStart < minStart - 1e-9) continue;
    if (maxStart <= candidate + 1e-9) leftDock = maxStart;
    if (rightDock === null && minStart >= candidate - 1e-9) rightDock = minStart;
  }

  if (leftDock === null && rightDock === null) {
    const lastEnd = intervals.length ? intervals[intervals.length - 1]!.end : 0;
    return { startTime: Math.max(0, lastEnd), guide: lastEnd, sticky: null };
  }
  if (leftDock === null) {
    return {
      startTime: rightDock!,
      guide: rightDock,
      sticky: { side: "after", leftDock: rightDock!, rightDock: rightDock! },
    };
  }
  if (rightDock === null) {
    return {
      startTime: leftDock,
      guide: leftDock,
      sticky: { side: "before", leftDock, rightDock: leftDock },
    };
  }

  const sameDocks =
    args.sticky &&
    Math.abs(args.sticky.leftDock - leftDock) < 1e-6 &&
    Math.abs(args.sticky.rightDock - rightDock) < 1e-6;
  let side: "before" | "after";
  if (sameDocks && args.sticky) {
    // Stay pressed against the first touch until the pointer is in a new gap.
    side = args.sticky.side;
  } else {
    side = Math.abs(candidate - leftDock) <= Math.abs(candidate - rightDock) ? "before" : "after";
  }

  const startTime = side === "before" ? leftDock : rightDock;
  return {
    startTime,
    guide: startTime,
    sticky: { side, leftDock, rightDock },
  };
}
