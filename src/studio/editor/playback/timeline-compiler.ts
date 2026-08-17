import type {
  EditorClip,
  EditorProject,
  TransitionType,
} from "../types";
import { audioFadeGainAtLocalTime, clampClipVolume } from "../editorEffects";
import { clipDurationSec, sortedClipsOnTrack } from "../projectContract";

export type CompiledClip = {
  clipId: string;
  assetId?: string;
  trackId: string;
  /** Index in project.tracks — lower = higher on the timeline = higher preview z. */
  trackIndex: number;
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
  /** Upcoming audio beds to warm (same horizon as video preload). */
  preloadAudio: Array<{ clip: CompiledClip; sourceTime: number; gain: number }>;
  /** @deprecated Prefer textOver / textUnder — kept as over+under concat for callers. */
  text: CompiledClip[];
  /** Text lanes above the top active video (drawn on top of video). */
  textOver: CompiledClip[];
  /** Text lanes below the top active video (drawn under video). */
  textUnder: CompiledClip[];
  preload: VideoSample[];
};

const JOINT_TOLERANCE_SEC = 0.04;

function compileClip(
  clip: EditorClip,
  muted: boolean,
  trackIndex: number,
): CompiledClip {
  const duration = clipDurationSec(clip);
  return {
    clipId: clip.id,
    assetId: clip.assetId,
    trackId: clip.trackId,
    trackIndex,
    kind: clip.kind,
    timelineStart: clip.startTime,
    timelineEnd: clip.startTime + duration,
    sourceStart: clip.trimIn,
    sourceEnd: clip.trimOut,
    volume: clampClipVolume(clip.effects?.volume),
    muted,
    clip,
  };
}

export function compileTimeline(project: EditorProject): PlaybackPlan {
  const mutedTracks = new Set(
    project.tracks.filter((track) => track.muted).map((track) => track.id),
  );
  const trackIndexById = new Map(
    project.tracks.map((track, index) => [track.id, index]),
  );
  const compiled = project.clips.map((clip) =>
    compileClip(
      clip,
      mutedTracks.has(clip.trackId),
      trackIndexById.get(clip.trackId) ?? 0,
    ),
  );
  const clipsById = new Map(compiled.map((clip) => [clip.clipId, clip]));
  const video = compiled
    .filter((clip) => clip.kind === "video" || clip.kind === "image")
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

export const MAX_PREVIEW_VIDEO_STACK = 8;

/** Top-to-bottom overlapping picture lanes for the preview compositor. */
export function stackOverlappingVideo<T>(
  active: T[],
  max = MAX_PREVIEW_VIDEO_STACK,
): T[] {
  if (active.length <= max) return active;
  const keepBottom = max - 1;
  return [active[0]!, ...active.slice(active.length - keepBottom)];
}

export type PictureStackPlan = {
  topIndex: number;
  bottomIndex: number;
  /** Timeline order (top → bottom), not paint order. */
  middleIndexes: number[];
};

/**
 * Compositor roles for the current slice. Indexes into slice.video
 * (already top-lane-first). A still on top is still index 0 — callers must
 * not treat that lane as the HTMLVideo play clock.
 */
export function pictureStackPlan(slice: RenderSlice): PictureStackPlan {
  const n = slice.video.length;
  if (n === 0) return { topIndex: -1, bottomIndex: -1, middleIndexes: [] };
  if (slice.transition) {
    const topIndex = slice.video.findIndex((sample) => sample.role === "outgoing");
    const bottomIndex = slice.video.findIndex((sample) => sample.role === "incoming");
    const middleIndexes = slice.video
      .map((sample, index) => (sample.role === "single" ? index : -1))
      .filter((index) => index >= 0);
    return {
      topIndex: topIndex >= 0 ? topIndex : 0,
      bottomIndex: bottomIndex >= 0 ? bottomIndex : Math.max(0, n - 1),
      middleIndexes,
    };
  }
  return {
    topIndex: 0,
    bottomIndex: n > 1 ? n - 1 : 0,
    middleIndexes: n > 2 ? Array.from({ length: n - 2 }, (_, i) => i + 1) : [],
  };
}

/**
 * Identity of everything that decides which bytes get decoded and which audio
 * is mixed. Cosmetic edits — transform drags, text styling, colours — leave it
 * unchanged, so the preview can repaint without restarting decode and audio.
 */
export function playbackSignature(plan: PlaybackPlan): string {
  const parts: string[] = [];
  for (const clip of [...plan.video, ...plan.audio]) {
    const effects = clip.clip.effects ?? {};
    parts.push(
      [
        clip.clipId,
        clip.assetId ?? "",
        clip.kind,
        clip.timelineStart.toFixed(4),
        clip.timelineEnd.toFixed(4),
        clip.sourceStart.toFixed(4),
        clip.sourceEnd.toFixed(4),
        clip.volume,
        clip.muted ? 1 : 0,
        effects.speed ?? 1,
        effects.audioFadeIn ?? 0,
        effects.audioFadeOut ?? 0,
      ].join(":"),
    );
  }
  for (const transition of plan.transitions) {
    parts.push(
      [
        transition.key,
        transition.type,
        transition.timelineStart.toFixed(4),
        transition.timelineEnd.toFixed(4),
      ].join(":"),
    );
  }
  return parts.join("|");
}

function contains(start: number, end: number, time: number): boolean {
  return time >= start && time < end;
}

function sourceAt(clip: CompiledClip, timelineTime: number): number {
  // Live speed remap removed — Process bakes a 1× copy. Draft effects.speed is ignored.
  const local = timelineTime - clip.timelineStart;
  return Math.max(
    clip.sourceStart,
    Math.min(clip.sourceEnd - 0.001, clip.sourceStart + local),
  );
}

/**
 * Resolve a timeline timestamp into immutable render/decode commands.
 * Transition sampling is continuous: A is never rewound when the window starts.
 */
export function sliceAt(plan: PlaybackPlan, timelineTime: number): RenderSlice {
  const time = Math.max(0, Math.min(plan.duration, timelineTime));
  const candidateTransition =
    plan.transitions.find((item) => contains(item.timelineStart, item.timelineEnd, time)) ??
    null;
  // The compositor can transition one picture lane faithfully. When another
  // picture lane overlaps, preview and export both hard-cut the transitioning
  // lane so lower/upper lanes keep their real z-order instead of being moved
  // above an opaque A/B transition result.
  const transition = candidateTransition
    ? plan.video.some(
        (clip) =>
          clip.clipId !== candidateTransition.outgoingClipId &&
          clip.clipId !== candidateTransition.incomingClipId &&
          contains(clip.timelineStart, clip.timelineEnd, time),
      )
      ? null
      : candidateTransition
    : null;
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
    // Keep other overlapping picture lanes (overlays) during the transition —
    // previously only A/B showed so middle/top media rows vanished on play/export feel.
    const transitionIds = new Set(video.map((sample) => sample.clip.clipId));
    const overlays = plan.video
      .filter(
        (clip) =>
          !transitionIds.has(clip.clipId) &&
          contains(clip.timelineStart, clip.timelineEnd, time),
      )
      .sort((a, b) => a.trackIndex - b.trackIndex || a.timelineStart - b.timelineStart);
    for (const clip of stackOverlappingVideo(overlays, Math.max(0, MAX_PREVIEW_VIDEO_STACK - 2))) {
      video.push({
        clip,
        sourceTime: sourceAt(clip, time),
        role: "single",
      });
    }
  } else {
    // Lowest trackIndex = top of timeline = drawn last (over). Stack every
    // overlapping picture lane so middle rows render, not only first+last.
    const active = plan.video
      .filter((clip) => contains(clip.timelineStart, clip.timelineEnd, time))
      .sort((a, b) => a.trackIndex - b.trackIndex || a.timelineStart - b.timelineStart);
    for (const clip of stackOverlappingVideo(active)) {
      video.push({
        clip,
        sourceTime: sourceAt(clip, time),
        role: "single",
      });
    }
  }

  const audio = plan.audio
    .filter((clip) => contains(clip.timelineStart, clip.timelineEnd, time))
    .map((clip) => {
      const local = time - clip.timelineStart;
      const duration = clip.timelineEnd - clip.timelineStart;
      return {
        clip,
        sourceTime: sourceAt(clip, time),
        gain:
          clip.volume *
          audioFadeGainAtLocalTime(clip.clip.effects, duration, local, clip.kind),
      };
    });
  const activeAudioIds = new Set(audio.map((item) => item.clip.clipId));
  const preloadAudio = plan.audio
    .filter(
      (clip) =>
        !activeAudioIds.has(clip.clipId) &&
        clip.timelineStart > time &&
        clip.timelineStart <= time + 2,
    )
    .map((clip) => ({
      clip,
      sourceTime: clip.sourceStart,
      gain:
        clip.volume *
        audioFadeGainAtLocalTime(
          clip.clip.effects,
          clip.timelineEnd - clip.timelineStart,
          0,
          clip.kind,
        ),
    }));
  const activeText = plan.text
    .filter((clip) => contains(clip.timelineStart, clip.timelineEnd, time))
    .sort((a, b) => b.trackIndex - a.trackIndex);
  // Text above the topmost active video draws over; text below draws under.
  const topVideoIndex = video.reduce(
    (min, sample) => Math.min(min, sample.clip.trackIndex),
    Number.POSITIVE_INFINITY,
  );
  const textOver = activeText.filter((clip) => clip.trackIndex < topVideoIndex);
  const textUnder = activeText.filter((clip) => clip.trackIndex > topVideoIndex);
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
    if (clip.timelineStart > time && clip.timelineStart <= time + 3.5) enqueuePreload(clip);
  }
  for (const upcoming of plan.transitions) {
    if (upcoming.timelineStart > time && upcoming.timelineStart <= time + 3.5) {
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
    preloadAudio,
    text: [...textUnder, ...textOver],
    textOver,
    textUnder,
    preload,
  };
}
