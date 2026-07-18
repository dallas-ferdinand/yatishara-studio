import type {
  EditorClip,
  EditorProject,
  TransitionType,
} from "../types";
import { clipDurationSec, sortedClipsOnTrack } from "../projectContract";

export type CompiledClip = {
  clipId: string;
  assetId?: string;
  trackId: string;
  kind: EditorClip["kind"];
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  sourceEnd: number;
  volume: number;
  muted: boolean;
  clip: EditorClip;
};

export type CompiledTransition = {
  key: string;
  type: TransitionType;
  timelineStart: number;
  timelineEnd: number;
  cutTime: number;
  duration: number;
  outgoingClipId: string;
  incomingClipId: string;
};

export type PlaybackPlan = {
  duration: number;
  video: CompiledClip[];
  audio: CompiledClip[];
  text: CompiledClip[];
  transitions: CompiledTransition[];
  clipsById: ReadonlyMap<string, CompiledClip>;
};

export type VideoSample = {
  clip: CompiledClip;
  sourceTime: number;
  role: "single" | "outgoing" | "incoming";
};

export type RenderSlice = {
  timelineTime: number;
  video: VideoSample[];
  transition: (CompiledTransition & { progress: number }) | null;
  audio: Array<{ clip: CompiledClip; sourceTime: number; gain: number }>;
  text: CompiledClip[];
  preload: VideoSample[];
};

const JOINT_TOLERANCE_SEC = 0.04;

function compileClip(clip: EditorClip, muted: boolean): CompiledClip {
  const duration = clipDurationSec(clip);
  return {
    clipId: clip.id,
    assetId: clip.assetId,
    trackId: clip.trackId,
    kind: clip.kind,
    timelineStart: clip.startTime,
    timelineEnd: clip.startTime + duration,
    sourceStart: clip.trimIn,
    sourceEnd: clip.trimOut,
    volume: Math.max(0, Math.min(2, clip.effects?.volume ?? 1)),
    muted,
    clip,
  };
}

export function compileTimeline(project: EditorProject): PlaybackPlan {
  const mutedTracks = new Set(
    project.tracks.filter((track) => track.muted).map((track) => track.id),
  );
  const compiled = project.clips.map((clip) =>
    compileClip(clip, mutedTracks.has(clip.trackId)),
  );
  const clipsById = new Map(compiled.map((clip) => [clip.clipId, clip]));
  const video = compiled
    .filter((clip) => clip.kind === "video")
    .sort((a, b) => a.timelineStart - b.timelineStart);
  const audio = compiled
    .filter((clip) => clip.kind === "audio")
    .sort((a, b) => a.timelineStart - b.timelineStart);
  const text = compiled
    .filter((clip) => clip.kind === "text")
    .sort((a, b) => a.timelineStart - b.timelineStart);
  const transitions: CompiledTransition[] = [];

  for (const track of project.tracks) {
    if (track.kind !== "video") continue;
    const clips = sortedClipsOnTrack(project.clips, track.id);
    for (let index = 0; index < clips.length - 1; index += 1) {
      const left = clips[index]!;
      const right = clips[index + 1]!;
      const type = left.transitionOut?.type;
      if (!type || type === "none") continue;
      const leftCompiled = clipsById.get(left.id)!;
      const rightCompiled = clipsById.get(right.id)!;
      if (rightCompiled.timelineStart - leftCompiled.timelineEnd > JOINT_TOLERANCE_SEC) {
        continue;
      }
      const maxDuration = Math.min(
        clipDurationSec(left),
        clipDurationSec(right),
        Math.max(0.05, left.transitionOut?.duration ?? 0.5),
      );
      const duration = Math.max(0.05, maxDuration);
      const cutTime = (leftCompiled.timelineEnd + rightCompiled.timelineStart) / 2;
      transitions.push({
        key: `${left.id}::${right.id}`,
        type,
        timelineStart: cutTime - duration / 2,
        timelineEnd: cutTime + duration / 2,
        cutTime,
        duration,
        outgoingClipId: left.id,
        incomingClipId: right.id,
      });
    }
  }

  const end = compiled.reduce((value, clip) => Math.max(value, clip.timelineEnd), 0);
  return {
    duration: Math.max(project.duration, end),
    video,
    audio,
    text,
    transitions: transitions.sort((a, b) => a.timelineStart - b.timelineStart),
    clipsById,
  };
}

function contains(start: number, end: number, time: number): boolean {
  return time >= start && time < end;
}

function sourceAt(clip: CompiledClip, timelineTime: number): number {
  return Math.max(
    clip.sourceStart,
    Math.min(clip.sourceEnd - 0.001, clip.sourceStart + timelineTime - clip.timelineStart),
  );
}

/**
 * Resolve a timeline timestamp into immutable render/decode commands.
 * Transition sampling is continuous: A is never rewound when the window starts.
 */
export function sliceAt(plan: PlaybackPlan, timelineTime: number): RenderSlice {
  const time = Math.max(0, Math.min(plan.duration, timelineTime));
  const transition =
    plan.transitions.find((item) => contains(item.timelineStart, item.timelineEnd, time)) ??
    null;
  const video: VideoSample[] = [];

  if (transition) {
    const outgoing = plan.clipsById.get(transition.outgoingClipId);
    const incoming = plan.clipsById.get(transition.incomingClipId);
    if (outgoing) {
      video.push({
        clip: outgoing,
        sourceTime: sourceAt(outgoing, Math.min(time, outgoing.timelineEnd - 0.001)),
        role: "outgoing",
      });
    }
    if (incoming) {
      // Without hidden media handles, hold B's first frame before its timeline
      // start, then advance continuously. This preserves project duration and
      // guarantees there is no backward jump when the transition window ends.
      video.push({
        clip: incoming,
        sourceTime: sourceAt(incoming, time),
        role: "incoming",
      });
    }
  } else {
    const active = plan.video
      .filter((clip) => contains(clip.timelineStart, clip.timelineEnd, time))
      .at(-1);
    if (active) {
      video.push({ clip: active, sourceTime: sourceAt(active, time), role: "single" });
    }
  }

  const audio = plan.audio
    .filter((clip) => contains(clip.timelineStart, clip.timelineEnd, time))
    .map((clip) => ({
      clip,
      sourceTime: sourceAt(clip, time),
      gain: clip.volume,
    }));
  const activeText = plan.text.filter((clip) =>
    contains(clip.timelineStart, clip.timelineEnd, time),
  );
  const currentIds = new Set(video.map((sample) => sample.clip.clipId));
  const preloadIds = new Set<string>();
  const preload: VideoSample[] = [];
  const enqueuePreload = (clip: CompiledClip) => {
    if (currentIds.has(clip.clipId) || preloadIds.has(clip.clipId)) return;
    preloadIds.add(clip.clipId);
    preload.push({
      clip,
      sourceTime: clip.sourceStart,
      role: "single",
    });
  };
  for (const clip of plan.video) {
    if (clip.timelineStart > time && clip.timelineStart <= time + 2) enqueuePreload(clip);
  }
  for (const upcoming of plan.transitions) {
    if (upcoming.timelineStart > time && upcoming.timelineStart <= time + 2) {
      const incoming = plan.clipsById.get(upcoming.incomingClipId);
      if (incoming) enqueuePreload(incoming);
    }
  }

  return {
    timelineTime: time,
    video,
    transition: transition
      ? {
          ...transition,
          progress: Math.max(
            0,
            Math.min(1, (time - transition.timelineStart) / transition.duration),
          ),
        }
      : null,
    audio,
    text: activeText,
    preload,
  };
}
