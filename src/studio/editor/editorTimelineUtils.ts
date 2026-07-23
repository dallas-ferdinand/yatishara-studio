import type { EditorClip, EditorProject, EditorTrack, TrackKind, TransitionJoint } from "./types";
import { clipDuration } from "./editorState";

const JOINT_GAP_SEC = 0.05;

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
  const ids = new Set(project.tracks.map((track) => track.id));
  if (kind === "video") {
    let n = 1;
    while (ids.has(`track-v${n}`)) n += 1;
    return `track-v${n}`;
  }
  if (kind === "text") {
    let n = 1;
    while (ids.has(`track-t${n}`)) n += 1;
    return `track-t${n}`;
  }
  if (!ids.has("track-audio")) return "track-audio";
  let n = 2;
  while (ids.has(`track-audio-${n}`)) n += 1;
  return `track-audio-${n}`;
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
    // Title / overlay lane sits immediately above the first video lane.
    const videoIdx = tracks.findIndex((track) => track.kind === "video");
    return videoIdx === -1 ? 0 : videoIdx;
  }
  const idx = tracks.findIndex((track) => track.kind !== "video");
  return idx === -1 ? tracks.length : idx;
}

/** Index of the first video lane in project order (−1 if none). */
export function firstVideoTrackIndex(tracks: EditorTrack[]): number {
  return tracks.findIndex((track) => track.kind === "video");
}

/**
 * Main text (title) lane: the text track closest above the first video.
 * Falls back to any text track when none sit above video yet.
 */
export function mainTextTrack(project: EditorProject): EditorTrack | null {
  const videoIdx = firstVideoTrackIndex(project.tracks);
  if (videoIdx === -1) {
    return project.tracks.find((track) => track.kind === "text") ?? null;
  }
  for (let i = videoIdx - 1; i >= 0; i -= 1) {
    const track = project.tracks[i];
    if (track?.kind === "text") return track;
  }
  return project.tracks.find((track) => track.kind === "text") ?? null;
}

/**
 * Keep / create the main text lane directly above the first video track.
 * Moves an existing text track up if it drifted below video.
 */
export function ensureMainTextTrackAboveVideo(project: EditorProject): {
  project: EditorProject;
  track: EditorTrack;
} {
  const videoIdx = firstVideoTrackIndex(project.tracks);
  const existing = mainTextTrack(project);

  if (existing) {
    const textIdx = project.tracks.findIndex((track) => track.id === existing.id);
    if (videoIdx === -1 || textIdx < 0) {
      return { project, track: existing };
    }
    if (textIdx < videoIdx) {
      return { project, track: existing };
    }
    // Text is at/under the video — move it to sit immediately above.
    const tracks = [...project.tracks];
    const [moved] = tracks.splice(textIdx, 1);
    if (!moved) return { project, track: existing };
    const insertAt = Math.min(videoIdx, tracks.length);
    tracks.splice(insertAt, 0, moved);
    return { project: { ...project, tracks }, track: moved };
  }

  const inserted = insertTrackAt(project, "text", defaultInsertIndex(project.tracks, "text"));
  const track = inserted.project.tracks.find((item) => item.id === inserted.trackId)!;
  return { project: inserted.project, track };
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
  // Non-audio lanes never insert into/after the audio block.
  let insertAt = Math.max(0, Math.min(index, tracks.length));
  if (kind !== "audio") {
    const firstAudio = tracks.findIndex((item) => item.kind === "audio");
    if (firstAudio !== -1) insertAt = Math.min(insertAt, firstAudio);
  } else {
    // Audio always appends under everything (including other audio).
    insertAt = tracks.length;
  }
  tracks.splice(insertAt, 0, track);
  return { project: { ...project, tracks: pinAudioTracksBelow(tracks) }, trackId: track.id };
}

/** Audio lanes always sit under video/text — preserve relative order within each group. */
export function pinAudioTracksBelow(tracks: EditorTrack[]): EditorTrack[] {
  const above = tracks.filter((track) => track.kind !== "audio");
  const audio = tracks.filter((track) => track.kind === "audio");
  if (audio.length === 0) return tracks;
  return [...above, ...audio];
}

/**
 * Lanes the user can see — keep `project.tracks` order so text can sit above
 * or below video, with audio always pinned under everything.
 */
export function visibleTracks(project: EditorProject) {
  const clipTrackIds = new Set(project.clips.map((clip) => clip.trackId));
  const kept = project.tracks.filter((track) => clipTrackIds.has(track.id));

  if (!kept.some((track) => track.kind === "video")) {
    const fallback = project.tracks.find((track) => track.kind === "video");
    kept.unshift(fallback ?? { id: "track-v1", kind: "video", label: "V1" });
  }
  if (!kept.some((track) => track.kind === "audio")) {
    const fallback = project.tracks.find((track) => track.kind === "audio");
    kept.push(fallback ?? { id: "track-audio", kind: "audio", label: "Audio" });
  }

  const byProjectIndex = (a: EditorTrack, b: EditorTrack) =>
    project.tracks.findIndex((t) => t.id === a.id) - project.tracks.findIndex((t) => t.id === b.id);

  const seen = new Set<string>();
  const unique = kept.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });

  const ordered = [...unique].sort((a, b) => {
    const ai = project.tracks.findIndex((t) => t.id === a.id);
    const bi = project.tracks.findIndex((t) => t.id === b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return byProjectIndex(a, b);
  });

  return pinAudioTracksBelow(ordered);
}

export function pruneEmptyTracks(project: EditorProject): EditorProject {
  const clipTrackIds = new Set(project.clips.map((clip) => clip.trackId));
  const tracks = project.tracks.filter((track) => clipTrackIds.has(track.id));

  if (!tracks.some((track) => track.kind === "video")) {
    tracks.unshift(project.tracks.find((t) => t.kind === "video") ?? { id: "track-v1", kind: "video", label: "V1" });
  }
  if (!tracks.some((track) => track.kind === "audio")) {
    tracks.push(project.tracks.find((t) => t.kind === "audio") ?? { id: "track-audio", kind: "audio", label: "Audio" });
  }

  return { ...project, tracks: pinAudioTracksBelow(tracks) };
}
