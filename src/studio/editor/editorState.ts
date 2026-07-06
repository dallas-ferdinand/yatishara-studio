import {
  DEFAULT_PPS,
  DEFAULT_TRACKS,
  type EditorClip,
  type EditorProject,
  type EditorState,
  type EditorTrack,
  type TrackKind,
} from "./types";

export function newClipId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clipDuration(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

export function projectEndTime(project: EditorProject): number {
  let end = 8;
  for (const clip of project.clips) {
    end = Math.max(end, clip.startTime + clipDuration(clip));
  }
  return end;
}

export function createEmptyProject(args: {
  name: string;
  folderId: string;
  sourceAssetId?: string;
}): EditorProject {
  return normalizeProject({
    name: args.name,
    folderId: args.folderId,
    sourceAssetId: args.sourceAssetId,
    duration: 30,
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    clips: [],
  });
}

/** Ensure saved projects include newer tracks (e.g. text) without dropping clips. */
export function normalizeProject(project: EditorProject): EditorProject {
  const tracks = [...project.tracks];
  for (const defaultTrack of DEFAULT_TRACKS) {
    if (!tracks.some((track) => track.id === defaultTrack.id)) {
      tracks.push({ ...defaultTrack });
    }
  }
  return {
    ...project,
    tracks,
    clips: project.clips.map((clip) => ({
      ...clip,
      effects: clip.effects ?? undefined,
    })),
  };
}

export function createInitialState(project: EditorProject): EditorState {
  return {
    project: { ...project, duration: Math.max(project.duration, projectEndTime(project)) },
    ui: {
      playhead: 0,
      selectedClipId: null,
      pixelsPerSecond: DEFAULT_PPS,
      playing: false,
    },
    past: [],
    future: [],
  };
}

function withHistory(state: EditorState, nextProject: EditorProject): EditorState {
  return {
    ...state,
    project: {
      ...nextProject,
      duration: Math.max(nextProject.duration, projectEndTime(nextProject)),
    },
    past: [...state.past.slice(-49), state.project],
    future: [],
  };
}

export type EditorAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select_clip"; clipId: string | null }
  | { type: "set_playhead"; time: number }
  | { type: "set_playing"; playing: boolean }
  | { type: "set_zoom"; pixelsPerSecond: number }
  | { type: "delete_selected" }
  | { type: "duplicate_selected" }
  | { type: "split_at_playhead" }
  | { type: "add_clip"; clip: Omit<EditorClip, "id"> }
  | { type: "add_text_clip"; startTime?: number }
  | { type: "update_clip"; clipId: string; patch: Partial<EditorClip> }
  | { type: "move_clip"; clipId: string; startTime: number; trackId?: string; live?: boolean }
  | { type: "trim_clip"; clipId: string; trimIn: number; trimOut: number; startTime?: number; live?: boolean }
  | { type: "toggle_track_mute"; trackId: string }
  | { type: "replace_project"; project: EditorProject };

function trackForKind(tracks: EditorTrack[], kind: TrackKind): EditorTrack {
  return tracks.find((track) => track.kind === kind) ?? tracks[0];
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        project: prev,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        project: next,
        past: [...state.past, state.project],
        future: state.future.slice(1),
      };
    }
    case "select_clip":
      return { ...state, ui: { ...state.ui, selectedClipId: action.clipId } };
    case "set_playhead":
      return {
        ...state,
        ui: {
          ...state.ui,
          playhead: Math.max(0, Math.min(action.time, state.project.duration)),
        },
      };
    case "set_playing":
      return { ...state, ui: { ...state.ui, playing: action.playing } };
    case "set_zoom":
      return { ...state, ui: { ...state.ui, pixelsPerSecond: action.pixelsPerSecond } };
    case "delete_selected": {
      if (!state.ui.selectedClipId) return state;
      const clips = state.project.clips.filter((clip) => clip.id !== state.ui.selectedClipId);
      return {
        ...withHistory(state, { ...state.project, clips }),
        ui: { ...state.ui, selectedClipId: null },
      };
    }
    case "duplicate_selected": {
      const clip = state.project.clips.find((item) => item.id === state.ui.selectedClipId);
      if (!clip) return state;
      const end = clip.startTime + clipDuration(clip);
      const duplicate: EditorClip = {
        ...clip,
        id: newClipId(),
        startTime: end + 0.05,
        label: `${clip.label} copy`,
      };
      return withHistory(state, {
        ...state.project,
        clips: [...state.project.clips, duplicate],
      });
    }
    case "add_text_clip": {
      const textTrack = state.project.tracks.find((track) => track.kind === "text");
      if (!textTrack) return state;
      const startTime = action.startTime ?? state.ui.playhead;
      const clip: EditorClip = {
        id: newClipId(),
        trackId: textTrack.id,
        startTime: Math.max(0, startTime),
        trimIn: 0,
        trimOut: 3,
        label: "Text",
        kind: "text",
        text: {
          text: "Your text",
          fontSize: 42,
          color: "#ffffff",
          align: "center",
          animation: "fadeIn",
          animationDuration: 0.5,
        },
      };
      return withHistory(state, {
        ...state.project,
        clips: [...state.project.clips, clip],
      });
    }
    case "update_clip": {
      const clips = state.project.clips.map((clip) =>
        clip.id === action.clipId ? { ...clip, ...action.patch, id: clip.id } : clip,
      );
      return withHistory(state, { ...state.project, clips });
    }
    case "split_at_playhead": {
      const clip = state.project.clips.find((item) => item.id === state.ui.selectedClipId);
      if (!clip) return state;
      const t = state.ui.playhead;
      const clipEnd = clip.startTime + clipDuration(clip);
      if (t <= clip.startTime + 0.05 || t >= clipEnd - 0.05) return state;
      const offset = t - clip.startTime;
      const splitPoint = clip.trimIn + offset;
      const left: EditorClip = { ...clip, trimOut: splitPoint };
      const right: EditorClip = {
        ...clip,
        id: newClipId(),
        startTime: t,
        trimIn: splitPoint,
      };
      const clips = state.project.clips
        .filter((item) => item.id !== clip.id)
        .concat([left, right]);
      return withHistory(state, { ...state.project, clips });
    }
    case "add_clip": {
      const track = trackForKind(state.project.tracks, action.clip.kind);
      const clip: EditorClip = {
        ...action.clip,
        id: newClipId(),
        trackId: action.clip.trackId || track.id,
      };
      return withHistory(state, {
        ...state.project,
        clips: [...state.project.clips, clip],
      });
    }
    case "move_clip": {
      const clips = state.project.clips.map((clip) => {
        if (clip.id !== action.clipId) return clip;
        const nextTrackId = action.trackId ?? clip.trackId;
        const track = state.project.tracks.find((item) => item.id === nextTrackId);
        const nextKind = track?.kind ?? clip.kind;
        return {
          ...clip,
          startTime: Math.max(0, action.startTime),
          trackId: nextTrackId,
          kind: nextKind,
        };
      });
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? { ...state, project: nextProject } : withHistory(state, nextProject);
    }
    case "trim_clip": {
      const clips = state.project.clips.map((clip) => {
        if (clip.id !== action.clipId) return clip;
        const next: EditorClip = {
          ...clip,
          trimIn: Math.max(0, action.trimIn),
          trimOut: Math.max(action.trimIn + 0.05, action.trimOut),
        };
        if (action.startTime !== undefined) {
          next.startTime = Math.max(0, action.startTime);
        }
        return next;
      });
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? { ...state, project: nextProject } : withHistory(state, nextProject);
    }
    case "toggle_track_mute": {
      const tracks = state.project.tracks.map((track) =>
        track.id === action.trackId ? { ...track, muted: !track.muted } : track,
      );
      return { ...state, project: { ...state.project, tracks } };
    }
    case "replace_project":
      return {
        ...state,
        project: {
          ...normalizeProject(action.project),
          duration: Math.max(action.project.duration, projectEndTime(normalizeProject(action.project))),
        },
        past: [],
        future: [],
      };
    default:
      return state;
  }
}

export function clipAtPlayhead(project: EditorProject, trackId: string, time: number): EditorClip | null {
  return (
    project.clips.find((clip) => {
      if (clip.trackId !== trackId) return false;
      const end = clip.startTime + clipDuration(clip);
      return time >= clip.startTime && time < end;
    }) ?? null
  );
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ms = Math.floor((seconds - total) * 10);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}

export function formatTimecodeRuler(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTimecodeFull(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
