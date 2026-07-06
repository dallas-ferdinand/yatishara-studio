import {
  DEFAULT_PPS,
  DEFAULT_TRACKS,
  LEGACY_TRACK_MAP,
  type EditorClip,
  type EditorMode,
  type EditorProject,
  type EditorState,
  type EditorTrack,
} from "./types";
import { nextTrackId } from "./editorTimelineUtils";
import { computeRippleInsertForNewClip } from "./editorRipple";

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

export function normalizeProject(project: EditorProject): EditorProject {
  const tracks = [...project.tracks];
  for (const defaultTrack of DEFAULT_TRACKS) {
    if (!tracks.some((track) => track.id === defaultTrack.id)) {
      tracks.push({ ...defaultTrack });
    }
  }

  const clips = project.clips.map((clip) => {
    const trackId = LEGACY_TRACK_MAP[clip.trackId] ?? clip.trackId;
    const track = tracks.find((item) => item.id === trackId);
    return {
      ...clip,
      trackId: track?.id ?? trackId,
      kind: track?.kind ?? clip.kind,
      effects: clip.effects ?? undefined,
    };
  });

  return { ...project, tracks, clips };
}

export function createInitialState(project: EditorProject): EditorState {
  return {
    project: { ...project, duration: Math.max(project.duration, projectEndTime(project)) },
    ui: {
      playhead: 0,
      selectedClipId: null,
      selectedJointKey: null,
      pixelsPerSecond: DEFAULT_PPS,
      playing: false,
      inspectorOpen: true,
      editorMode: "select",
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
  | { type: "select_joint"; jointKey: string | null }
  | { type: "set_playhead"; time: number }
  | { type: "set_playing"; playing: boolean }
  | { type: "set_zoom"; pixelsPerSecond: number }
  | { type: "set_inspector_open"; open: boolean }
  | { type: "set_editor_mode"; mode: EditorMode }
  | { type: "delete_selected" }
  | { type: "duplicate_selected" }
  | { type: "split_at_playhead" }
  | { type: "add_clip"; clip: Omit<EditorClip, "id"> }
  | { type: "add_text_clip"; startTime?: number; trackId?: string }
  | { type: "add_track_layer"; kind: "video" | "text" }
  | { type: "update_clip"; clipId: string; patch: Partial<EditorClip> }
  | { type: "set_joint_transition"; jointKey: string; transition: EditorClip["transitionOut"] }
  | { type: "move_clip"; clipId: string; startTime: number; trackId?: string; live?: boolean }
  | {
      type: "apply_track_layout";
      placements: Array<{ clipId: string; startTime: number; trackId: string }>;
      live?: boolean;
    }
  | { type: "ripple_add_clip"; clip: Omit<EditorClip, "id">; centerTime: number }
  | { type: "trim_clip"; clipId: string; trimIn: number; trimOut: number; startTime?: number; live?: boolean }
  | { type: "toggle_track_mute"; trackId: string }
  | { type: "replace_project"; project: EditorProject };

function trackForClip(tracks: EditorTrack[], clip: Omit<EditorClip, "id">): EditorTrack {
  if (clip.trackId) {
    const explicit = tracks.find((track) => track.id === clip.trackId);
    if (explicit) return explicit;
  }
  return tracks.find((track) => track.kind === clip.kind) ?? tracks[0]!;
}

function targetTextTrack(state: EditorState, trackId?: string): EditorTrack | null {
  if (trackId) {
    return state.project.tracks.find((track) => track.id === trackId && track.kind === "text") ?? null;
  }
  return state.project.tracks.find((track) => track.kind === "text") ?? null;
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
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedClipId: action.clipId,
          selectedJointKey: null,
        },
      };
    case "select_joint":
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedJointKey: action.jointKey,
          selectedClipId: null,
          editorMode: action.jointKey ? "transition" : state.ui.editorMode,
          inspectorOpen: action.jointKey ? true : state.ui.inspectorOpen,
        },
      };
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
    case "set_inspector_open":
      return { ...state, ui: { ...state.ui, inspectorOpen: action.open } };
    case "set_editor_mode":
      return {
        ...state,
        ui: {
          ...state.ui,
          editorMode: action.mode,
          inspectorOpen: true,
          selectedJointKey: action.mode === "transition" ? state.ui.selectedJointKey : null,
        },
      };
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
      const textTrack = targetTextTrack(state, action.trackId);
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
    case "add_track_layer": {
      const id = nextTrackId(state.project, action.kind);
      const label =
        action.kind === "video"
          ? `V${state.project.tracks.filter((t) => t.kind === "video").length + 1}`
          : action.kind === "text"
            ? `Text ${state.project.tracks.filter((t) => t.kind === "text").length + 1}`
            : "Audio";
      const track: EditorTrack = { id, kind: action.kind, label };
      return withHistory(state, {
        ...state.project,
        tracks: [...state.project.tracks, track],
      });
    }
    case "update_clip": {
      const clips = state.project.clips.map((clip) =>
        clip.id === action.clipId ? { ...clip, ...action.patch, id: clip.id } : clip,
      );
      return withHistory(state, { ...state.project, clips });
    }
    case "set_joint_transition": {
      const [leftId] = action.jointKey.split("::");
      const clips = state.project.clips.map((clip) =>
        clip.id === leftId ? { ...clip, transitionOut: action.transition } : clip,
      );
      return withHistory(state, { ...state.project, clips });
    }
    case "split_at_playhead": {
      const clip = state.project.clips.find((item) => item.id === state.ui.selectedClipId);
      if (!clip || clip.kind === "text") return state;
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
      const track = trackForClip(state.project.tracks, action.clip);
      const clip: EditorClip = {
        ...action.clip,
        id: newClipId(),
        trackId: track.id,
        kind: track.kind,
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
        if (track && track.kind !== clip.kind) return { ...clip, startTime: Math.max(0, action.startTime) };
        return {
          ...clip,
          startTime: Math.max(0, action.startTime),
          trackId: nextTrackId,
          kind: track?.kind ?? clip.kind,
        };
      });
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? { ...state, project: nextProject } : withHistory(state, nextProject);
    }
    case "apply_track_layout": {
      const positionById = new Map(action.placements.map((p) => [p.clipId, p]));
      const clips = state.project.clips.map((clip) => {
        const placement = positionById.get(clip.id);
        if (!placement) return clip;
        const track = state.project.tracks.find((item) => item.id === placement.trackId);
        return {
          ...clip,
          startTime: Math.max(0, placement.startTime),
          trackId: placement.trackId,
          kind: track?.kind ?? clip.kind,
        };
      });
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? { ...state, project: nextProject } : withHistory(state, nextProject);
    }
    case "ripple_add_clip": {
      const track = trackForClip(state.project.tracks, action.clip);
      const clip: EditorClip = {
        ...action.clip,
        id: newClipId(),
        trackId: track.id,
        kind: track.kind,
      };
      const placements = computeRippleInsertForNewClip({
        project: state.project,
        trackId: track.id,
        clip,
        centerTime: action.centerTime,
      });
      const positionById = new Map(placements.map((p) => [p.clipId, p]));
      const updated = state.project.clips.map((item) => {
        const placement = positionById.get(item.id);
        if (!placement) return item;
        return { ...item, startTime: placement.startTime, trackId: placement.trackId };
      });
      const placed = positionById.get(clip.id)!;
      const clips = [...updated, { ...clip, startTime: placed.startTime, trackId: placed.trackId }];
      return withHistory(state, { ...state.project, clips });
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

export function topVideoClipAtPlayhead(project: EditorProject, time: number): EditorClip | null {
  const videoTracks = project.tracks.filter((track) => track.kind === "video");
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const clip = clipAtPlayhead(project, videoTracks[i]!.id, time);
    if (clip) return clip;
  }
  return null;
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
