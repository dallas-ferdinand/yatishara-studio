/**
 * Pure EditorProject timeline ops for API / MCP.
 * Keep aligned with src/studio/editor/editorState.ts duration + split math.
 */

import {
  EDITOR_TRANSITION_SPECS,
  type EditorTransitionName,
  normalizeEditorTransition,
} from "./editorEffectContract";

export const DEFAULT_IMAGE_CLIP_SEC = 3;
export const DEFAULT_MEDIA_CLIP_SEC = 5;
export const MIN_CLIP_SEC = 0.05;

export type FrameRatio = "16:9" | "9:16" | "1:1";

export type EditorClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
};

export type EditorClipTransition = {
  type: EditorTransitionName;
  duration: number;
};

export type EditorTextContent = {
  text: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
};

export type EditorTrack = {
  id: string;
  kind: "video" | "audio" | "text";
  label: string;
  muted?: boolean;
  hidden?: boolean;
};

export type EditorClip = {
  id: string;
  assetId?: string;
  trackId: string;
  startTime: number;
  trimIn: number;
  trimOut: number;
  sourceDuration?: number;
  label: string;
  kind: "video" | "audio" | "text";
  effects?: EditorClipEffects;
  transitionOut?: EditorClipTransition;
  text?: EditorTextContent;
};

export type EditorProject = {
  name: string;
  folderId: string;
  sourceAssetId?: string;
  duration: number;
  frameRatio?: FrameRatio;
  tracks: EditorTrack[];
  clips: EditorClip[];
};

export type SeedAsset = {
  id: string;
  name: string;
  kind: "image" | "video" | "audio" | "document";
  durationSeconds?: number;
};

export type ClipPatch = {
  clipId: string;
  startTime?: number;
  trimIn?: number;
  trimOut?: number;
  trackId?: string;
  label?: string;
  effects?: EditorClipEffects | null;
  transitionOut?: EditorClipTransition | null;
};

export type AppendClipSpec = {
  assetId: string;
  trackId?: string;
  startTime?: number;
  trimIn?: number;
  trimOut?: number;
  label?: string;
  duration?: number;
};

export function newClipId(now = Date.now()): string {
  return `clip_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clipDurationSec(clip: { trimIn: number; trimOut: number }): number {
  return Math.max(MIN_CLIP_SEC, clip.trimOut - clip.trimIn);
}

export function normalizeFrameRatio(value: unknown): FrameRatio {
  if (value === "9:16" || value === "1:1" || value === "16:9") return value;
  return "16:9";
}

export function parseEditorProject(value: unknown): EditorProject {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid editor project.");
  }
  const project = value as Record<string, unknown>;
  if (!Array.isArray(project.tracks) || !Array.isArray(project.clips)) {
    throw new Error("Invalid editor project: tracks and clips required.");
  }
  return project as unknown as EditorProject;
}

export function emptyEditorProject(
  name: string,
  folderId: string,
  frameRatio: FrameRatio = "16:9",
): EditorProject {
  return {
    name,
    folderId,
    duration: 30,
    frameRatio,
    tracks: [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ],
    clips: [],
  };
}

export function trackEndTime(project: EditorProject, trackId: string): number {
  let end = 0;
  for (const clip of project.clips) {
    if (clip.trackId !== trackId) continue;
    end = Math.max(end, clip.startTime + clipDurationSec(clip));
  }
  return end;
}

export function recomputeProjectDuration(project: EditorProject): EditorProject {
  let end = 0;
  for (const clip of project.clips) {
    end = Math.max(end, clip.startTime + clipDurationSec(clip));
  }
  return { ...project, duration: Math.max(30, end) };
}

export function clipsSummary(project: EditorProject) {
  return project.clips
    .slice()
    .sort((a, b) => a.startTime - b.startTime || a.trackId.localeCompare(b.trackId))
    .map((clip) => ({
      id: clip.id,
      trackId: clip.trackId,
      kind: clip.kind,
      label: clip.label,
      assetId: clip.assetId,
      startTime: round3(clip.startTime),
      trimIn: round3(clip.trimIn),
      trimOut: round3(clip.trimOut),
      duration: round3(clipDurationSec(clip)),
      transitionOut: clip.transitionOut ?? null,
    }));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function requireTrack(project: EditorProject, trackId: string): EditorTrack {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);
  return track;
}

function resolveVideoTrackId(project: EditorProject, preferred?: string): string {
  if (preferred) {
    const track = requireTrack(project, preferred);
    if (track.kind !== "video") throw new Error(`Track ${preferred} is not a video track.`);
    return track.id;
  }
  const video = project.tracks.find((track) => track.kind === "video");
  if (!video) throw new Error("No video track in project.");
  return video.id;
}

function resolveAudioTrackId(project: EditorProject, preferred?: string): string {
  if (preferred) {
    const track = requireTrack(project, preferred);
    if (track.kind !== "audio") throw new Error(`Track ${preferred} is not an audio track.`);
    return track.id;
  }
  const audio = project.tracks.find((track) => track.kind === "audio");
  if (!audio) throw new Error("No audio track in project.");
  return audio.id;
}

export function seedClipsFromAssets(
  project: EditorProject,
  assets: SeedAsset[],
): { project: EditorProject; changedClipIds: string[] } {
  const next = { ...project, clips: [...project.clips] };
  const changedClipIds: string[] = [];
  let videoCursor = trackEndTime(next, resolveVideoTrackId(next));
  let audioCursor = trackEndTime(next, resolveAudioTrackId(next));

  for (const asset of assets) {
    if (asset.kind === "video" || asset.kind === "image") {
      const trackId = resolveVideoTrackId(next);
      const duration =
        asset.kind === "image"
          ? DEFAULT_IMAGE_CLIP_SEC
          : Math.max(MIN_CLIP_SEC, asset.durationSeconds ?? DEFAULT_MEDIA_CLIP_SEC);
      const clip: EditorClip = {
        id: newClipId(),
        assetId: asset.id,
        trackId,
        startTime: videoCursor,
        trimIn: 0,
        trimOut: duration,
        sourceDuration: duration,
        label: asset.name,
        kind: "video",
      };
      next.clips.push(clip);
      changedClipIds.push(clip.id);
      videoCursor += duration;
    } else if (asset.kind === "audio") {
      const trackId = resolveAudioTrackId(next);
      const duration = Math.max(MIN_CLIP_SEC, asset.durationSeconds ?? DEFAULT_MEDIA_CLIP_SEC);
      const clip: EditorClip = {
        id: newClipId(),
        assetId: asset.id,
        trackId,
        startTime: audioCursor,
        trimIn: 0,
        trimOut: duration,
        sourceDuration: duration,
        label: asset.name,
        kind: "audio",
      };
      next.clips.push(clip);
      changedClipIds.push(clip.id);
      audioCursor += duration;
    }
  }

  return { project: recomputeProjectDuration(next), changedClipIds };
}

export function appendClips(
  project: EditorProject,
  specs: AppendClipSpec[],
  assetsById: Map<string, SeedAsset>,
  options?: { atTime?: number },
): { project: EditorProject; changedClipIds: string[] } {
  if (!specs.length) throw new Error("At least one clip spec is required.");
  const next = { ...project, clips: [...project.clips] };
  const changedClipIds: string[] = [];

  for (const spec of specs) {
    const asset = assetsById.get(spec.assetId);
    if (!asset) throw new Error(`Asset not found: ${spec.assetId}`);
    if (asset.kind === "document") {
      throw new Error(`Cannot add document asset to timeline: ${asset.name}`);
    }

    const isAudio = asset.kind === "audio";
    const trackId = isAudio
      ? resolveAudioTrackId(next, spec.trackId)
      : resolveVideoTrackId(next, spec.trackId);

    const defaultDuration =
      asset.kind === "image"
        ? DEFAULT_IMAGE_CLIP_SEC
        : Math.max(MIN_CLIP_SEC, asset.durationSeconds ?? DEFAULT_MEDIA_CLIP_SEC);

    const trimIn = Math.max(0, spec.trimIn ?? 0);
    const trimOut = Math.max(
      trimIn + MIN_CLIP_SEC,
      spec.trimOut ?? trimIn + (spec.duration ?? defaultDuration),
    );
    const startTime =
      spec.startTime ??
      options?.atTime ??
      trackEndTime(next, trackId);

    const clip: EditorClip = {
      id: newClipId(),
      assetId: asset.id,
      trackId,
      startTime: Math.max(0, startTime),
      trimIn,
      trimOut,
      sourceDuration: asset.durationSeconds ?? trimOut,
      label: spec.label?.trim() || asset.name,
      kind: isAudio ? "audio" : "video",
    };
    next.clips.push(clip);
    changedClipIds.push(clip.id);
  }

  return { project: recomputeProjectDuration(next), changedClipIds };
}

function normalizeTransition(
  value: EditorClipTransition | null | undefined,
): EditorClipTransition | undefined {
  if (value === null) return undefined;
  if (!value) return undefined;
  const type = normalizeEditorTransition(value.type);
  if (!(type in EDITOR_TRANSITION_SPECS)) {
    throw new Error(`Unsupported transition type: ${String(value.type)}`);
  }
  return {
    type,
    duration: Math.max(0.05, Number(value.duration) || 0.5),
  };
}

export function patchClips(
  project: EditorProject,
  patches: ClipPatch[],
): { project: EditorProject; changedClipIds: string[] } {
  if (!patches.length) throw new Error("At least one clip patch is required.");
  const byId = new Map(patches.map((patch) => [patch.clipId, patch]));
  const changedClipIds: string[] = [];
  const clips = project.clips.map((clip) => {
    const patch = byId.get(clip.id);
    if (!patch) return clip;
    changedClipIds.push(clip.id);
    let nextTrackId = clip.trackId;
    let nextKind = clip.kind;
    if (patch.trackId) {
      const track = requireTrack(project, patch.trackId);
      if (track.kind !== clip.kind) {
        throw new Error(`Cannot move ${clip.kind} clip onto ${track.kind} track.`);
      }
      nextTrackId = track.id;
      nextKind = track.kind;
    }
    const trimIn = patch.trimIn !== undefined ? Math.max(0, patch.trimIn) : clip.trimIn;
    const trimOut =
      patch.trimOut !== undefined
        ? Math.max(trimIn + MIN_CLIP_SEC, patch.trimOut)
        : Math.max(trimIn + MIN_CLIP_SEC, clip.trimOut);
    return {
      ...clip,
      trackId: nextTrackId,
      kind: nextKind,
      startTime: patch.startTime !== undefined ? Math.max(0, patch.startTime) : clip.startTime,
      trimIn,
      trimOut,
      label: patch.label?.trim() || clip.label,
      effects: patch.effects === null ? undefined : patch.effects ?? clip.effects,
      transitionOut:
        patch.transitionOut === undefined
          ? clip.transitionOut
          : normalizeTransition(patch.transitionOut),
    };
  });

  for (const patch of patches) {
    if (!project.clips.some((clip) => clip.id === patch.clipId)) {
      throw new Error(`Clip not found: ${patch.clipId}`);
    }
  }

  return {
    project: recomputeProjectDuration({ ...project, clips }),
    changedClipIds,
  };
}

export function removeClips(
  project: EditorProject,
  clipIds: string[],
  options?: { ripple?: boolean },
): { project: EditorProject; changedClipIds: string[] } {
  if (!clipIds.length) throw new Error("At least one clipId is required.");
  const removeSet = new Set(clipIds);
  for (const id of clipIds) {
    if (!project.clips.some((clip) => clip.id === id)) {
      throw new Error(`Clip not found: ${id}`);
    }
  }

  const removed = project.clips.filter((clip) => removeSet.has(clip.id));
  let clips = project.clips.filter((clip) => !removeSet.has(clip.id));

  if (options?.ripple) {
    // For each removed clip (right-to-left), shift later same-track clips left.
    for (const removedClip of removed.sort((a, b) => b.startTime - a.startTime)) {
      const delta = clipDurationSec(removedClip);
      clips = clips.map((clip) => {
        if (clip.trackId !== removedClip.trackId) return clip;
        if (clip.startTime >= removedClip.startTime - 1e-6) {
          return { ...clip, startTime: Math.max(0, clip.startTime - delta) };
        }
        return clip;
      });
    }
  }

  return {
    project: recomputeProjectDuration({ ...project, clips }),
    changedClipIds: clipIds,
  };
}

export function reorderTrackClips(
  project: EditorProject,
  trackId: string,
  clipIds: string[],
): { project: EditorProject; changedClipIds: string[] } {
  requireTrack(project, trackId);
  const onTrack = project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
  if (onTrack.length !== clipIds.length) {
    throw new Error("clipIds must include every clip on the track exactly once.");
  }
  const byId = new Map(onTrack.map((clip) => [clip.id, clip]));
  for (const id of clipIds) {
    if (!byId.has(id)) throw new Error(`Clip ${id} is not on track ${trackId}.`);
  }
  if (new Set(clipIds).size !== clipIds.length) {
    throw new Error("clipIds contains duplicates.");
  }

  let cursor = 0;
  const remapped = new Map<string, EditorClip>();
  for (const id of clipIds) {
    const clip = byId.get(id)!;
    remapped.set(id, { ...clip, startTime: cursor });
    cursor += clipDurationSec(clip);
  }

  const clips = project.clips.map((clip) => remapped.get(clip.id) ?? clip);
  return {
    project: recomputeProjectDuration({ ...project, clips }),
    changedClipIds: clipIds,
  };
}

export function splitClipAtTime(
  project: EditorProject,
  clipId: string,
  timeSec: number,
): { project: EditorProject; changedClipIds: string[] } {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`Clip not found: ${clipId}`);
  if (clip.kind === "text") throw new Error("Cannot split text clips.");

  const clipEnd = clip.startTime + clipDurationSec(clip);
  if (timeSec <= clip.startTime + MIN_CLIP_SEC || timeSec >= clipEnd - MIN_CLIP_SEC) {
    throw new Error("Split time must be inside the clip (with margin).");
  }

  const offset = timeSec - clip.startTime;
  const splitPoint = clip.trimIn + offset;
  const left: EditorClip = { ...clip, trimOut: splitPoint };
  const right: EditorClip = {
    ...clip,
    id: newClipId(),
    startTime: timeSec,
    trimIn: splitPoint,
  };

  const clips = project.clips.filter((item) => item.id !== clip.id).concat([left, right]);
  return {
    project: recomputeProjectDuration({ ...project, clips }),
    changedClipIds: [left.id, right.id],
  };
}

export function setClipTransition(
  project: EditorProject,
  clipId: string,
  transition: EditorClipTransition | null,
): { project: EditorProject; changedClipIds: string[] } {
  return patchClips(project, [{ clipId, transitionOut: transition }]);
}

/** Resolve which media clip covers a timeline playhead on the first video track. */
export function clipAtPlayhead(
  project: EditorProject,
  timeSec: number,
): { clip: EditorClip; localTime: number } | null {
  const videoTrack = project.tracks.find((track) => track.kind === "video");
  if (!videoTrack) return null;
  const t = Math.max(0, timeSec);
  const clips = project.clips
    .filter((clip) => clip.trackId === videoTrack.id && clip.assetId)
    .sort((a, b) => a.startTime - b.startTime);
  for (const clip of clips) {
    const end = clip.startTime + clipDurationSec(clip);
    if (t >= clip.startTime && t < end) {
      return { clip, localTime: clip.trimIn + (t - clip.startTime) };
    }
  }
  return null;
}
