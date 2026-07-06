import type { EditorClip, EditorProject, EditorTrack, TrackKind, TransitionJoint } from "./types";
import { clipDuration } from "./editorState";

const JOINT_GAP_SEC = 0.75;

export function clipsOnTrack(project: EditorProject, trackId: string): EditorClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
}

export function transitionJointsOnTrack(project: EditorProject, trackId: string): TransitionJoint[] {
  const trackClips = clipsOnTrack(project, trackId);
  const joints: TransitionJoint[] = [];

  for (let i = 0; i < trackClips.length - 1; i++) {
    const left = trackClips[i]!;
    const right = trackClips[i + 1]!;
    const leftEnd = left.startTime + clipDuration(left);
    if (right.startTime - leftEnd > JOINT_GAP_SEC) continue;
    joints.push({
      key: `${left.id}::${right.id}`,
      trackId,
      leftClipId: left.id,
      rightClipId: right.id,
      time: (leftEnd + right.startTime) / 2,
    });
  }

  return joints;
}

export function allTransitionJoints(project: EditorProject): TransitionJoint[] {
  const joints: TransitionJoint[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "video") continue;
    joints.push(...transitionJointsOnTrack(project, track.id));
  }
  return joints;
}

export function jointByKey(project: EditorProject, key: string | null): TransitionJoint | null {
  if (!key) return null;
  return allTransitionJoints(project).find((joint) => joint.key === key) ?? null;
}

export function leftClipForJoint(project: EditorProject, joint: TransitionJoint): EditorClip | null {
  return project.clips.find((clip) => clip.id === joint.leftClipId) ?? null;
}

export function tracksByKind(project: EditorProject, kind: EditorClip["kind"]) {
  return project.tracks.filter((track) => track.kind === kind);
}

export function nextTrackId(project: EditorProject, kind: TrackKind): string {
  const existing = project.tracks.filter((track) => track.kind === kind);
  const n = existing.length + 1;
  if (kind === "video") return `track-v${n}`;
  if (kind === "text") return `track-t${n}`;
  return n === 1 ? "track-audio" : `track-audio-${n}`;
}

export function trackLabelForKind(project: EditorProject, kind: TrackKind): string {
  const count = project.tracks.filter((track) => track.kind === kind).length + 1;
  if (kind === "video") return `V${count}`;
  if (kind === "text") return count === 1 ? "Title" : `Text ${count}`;
  return count === 1 ? "Audio" : `Audio ${count}`;
}

export function defaultInsertIndex(tracks: EditorTrack[], kind: TrackKind): number {
  if (kind === "audio") return tracks.length;
  if (kind === "text") {
    const audioIdx = tracks.findIndex((track) => track.kind === "audio");
    return audioIdx === -1 ? tracks.length : audioIdx;
  }
  const idx = tracks.findIndex((track) => track.kind !== "video");
  return idx === -1 ? tracks.length : idx;
}

export function insertTrackAt(
  project: EditorProject,
  kind: TrackKind,
  index: number,
): { project: EditorProject; trackId: string } {
  const track = {
    id: nextTrackId(project, kind),
    kind,
    label: trackLabelForKind(project, kind),
  };
  const tracks = [...project.tracks];
  tracks.splice(Math.max(0, Math.min(index, tracks.length)), 0, track);
  return { project: { ...project, tracks }, trackId: track.id };
}
