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
import {
  defaultInsertIndex,
  insertTrackAt,
  nextTrackId,
  pruneEmptyTracks,
} from "./editorTimelineUtils";
import { computeRippleInsertForNewClip } from "./editorRipple";
import { normalizeFrameRatio } from "./projectContract";

export function newClipId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clipDuration(clip: EditorClip): number {
  return Math.max(0.05, clip.trimOut - clip.trimIn);
}

const JOINT_GAP_SEC = 0.05;

function clearTransitionOut(clip: EditorClip): EditorClip {
  if (!clip.transitionOut || clip.transitionOut.type === "none") return clip;
  const next = { ...clip };
  delete next.transitionOut;
  return next;
}

/** Previous video clip on the same track when abutting (within joint gap). */
function previousAdjacentClip(clips: EditorClip[], clip: EditorClip): EditorClip | null {
  if (clip.kind !== "video") return null;
  const sorted = clips
    .filter((item) => item.trackId === clip.trackId && item.kind === "video")
    .sort((a, b) => a.startTime - b.startTime);
  const idx = sorted.findIndex((item) => item.id === clip.id);
  if (idx <= 0) return null;
  const prev = sorted[idx - 1]!;
  const prevEnd = prev.startTime + clipDuration(prev);
  if (clip.startTime - prevEnd > JOINT_GAP_SEC) return null;
  return prev;
}

/** Drop transitions on a moved clip and its former left neighbor. */
function stripTransitionsForMovedClips(
  originalClips: EditorClip[],
  nextClips: EditorClip[],
  movedIds: Iterable<string>,
): EditorClip[] {
  const clearIds = new Set<string>();
  for (const id of movedIds) {
    const before = originalClips.find((clip) => clip.id === id);
    if (!before || before.kind !== "video") continue;
    clearIds.add(id);
    const prev = previousAdjacentClip(originalClips, before);
    if (prev) clearIds.add(prev.id);
  }
  if (clearIds.size === 0) return nextClips;
  return nextClips.map((clip) => (clearIds.has(clip.id) ? clearTransitionOut(clip) : clip));
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
    frameRatio: "16:9",
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    clips: [],
  });
}

export function normalizeProject(project: EditorProject): EditorProject {
  const seen = new Set<string>();
  const tracks = project.tracks.map((track) => {
    const id = LEGACY_TRACK_MAP[track.id] ?? track.id;
    return { ...track, id };
  }).filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
  if (!tracks.some((track) => track.kind === "video")) {
    tracks.unshift({ id: "track-v1", kind: "video", label: "V1" });
  }
  if (!tracks.some((track) => track.kind === "audio")) {
    tracks.push({ id: "track-audio", kind: "audio", label: "Audio" });
  }

  const clips = project.clips.map((clip) => {
    const mappedId = LEGACY_TRACK_MAP[clip.trackId] ?? clip.trackId;
    const track =
      tracks.find((item) => item.id === mappedId) ??
      tracks.find((item) => item.kind === clip.kind);
    return {
      ...clip,
      trackId: track?.id ?? mappedId,
      kind: track?.kind ?? clip.kind,
      effects: clip.effects ?? undefined,
    };
  });

  return pruneEmptyTracks({
    ...project,
    frameRatio: normalizeFrameRatio(project.frameRatio),
    tracks,
    clips,
  });
}

export function createInitialState(project: EditorProject): EditorState {
  const normalized = normalizeProject(project);
  return {
    project: {
      ...normalized,
      duration: Math.max(normalized.duration, projectEndTime(normalized)),
    },
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
    liveBaseline: null,
  };
}

function withHistory(state: EditorState, nextProject: EditorProject): EditorState {
  const pruned = pruneEmptyTracks({
    ...nextProject,
    duration: Math.max(nextProject.duration, projectEndTime(nextProject)),
  });
  return {
    ...state,
    project: {
      ...pruned,
      duration: Math.max(pruned.duration, projectEndTime(pruned)),
    },
    past: [...state.past.slice(-49), state.liveBaseline ?? state.project],
    future: [],
    liveBaseline: null,
  };
}

function withLive(state: EditorState, nextProject: EditorProject): EditorState {
  return {
    ...state,
    liveBaseline: state.liveBaseline ?? state.project,
    project: {
      ...nextProject,
      duration: Math.max(nextProject.duration, projectEndTime(nextProject)),
    },
  };
}

function withEdit(state: EditorState, nextProject: EditorProject): EditorState {
  return {
    ...withHistory(state, nextProject),
    ui: { ...state.ui, playing: false },
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
  | { type: "update_project"; patch: Partial<Pick<EditorProject, "frameRatio" | "name" | "duration">> }
  | {
      type: "set_joint_transition";
      jointKey: string;
      transition: EditorClip["transitionOut"];
      live?: boolean;
    }
  | { type: "move_clip"; clipId: string; startTime: number; trackId?: string; live?: boolean }
  | {
      type: "apply_track_layout";
      placements: Array<{ clipId: string; startTime: number; trackId: string }>;
      live?: boolean;
    }
  | { type: "ripple_add_clip"; clip: Omit<EditorClip, "id">; centerTime: number; insertTrackAt?: number }
  | {
      type: "move_clip_to_track";
      clipId: string;
      startTime: number;
      trackId?: string;
      insertTrackAt?: number;
      ripplePlacements?: Array<{ clipId: string; startTime: number; trackId: string }>;
    }
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

function ensureTextTrack(state: EditorState): { project: EditorProject; track: EditorTrack } {
  const existing = targetTextTrack(state);
  if (existing) return { project: state.project, track: existing };
  const inserted = insertTrackAt(state.project, "text", defaultInsertIndex(state.project.tracks, "text"));
  const track = inserted.project.tracks.find((item) => item.id === inserted.trackId)!;
  return { project: inserted.project, track };
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
      if (state.ui.selectedJointKey) {
        const [leftId] = state.ui.selectedJointKey.split("::");
        const clips = state.project.clips.map((clip) =>
          clip.id === leftId ? clearTransitionOut(clip) : clip,
        );
        return {
          ...withEdit(state, { ...state.project, clips }),
          ui: {
            ...state.ui,
            selectedJointKey: null,
            editorMode: "select",
            playing: false,
          },
        };
      }
      if (!state.ui.selectedClipId) return state;
      const deleted = state.project.clips.find((clip) => clip.id === state.ui.selectedClipId);
      const prev = deleted ? previousAdjacentClip(state.project.clips, deleted) : null;
      const clips = state.project.clips
        .filter((clip) => clip.id !== state.ui.selectedClipId)
        .map((clip) => (prev && clip.id === prev.id ? clearTransitionOut(clip) : clip));
      return {
        ...withEdit(state, { ...state.project, clips }),
        ui: { ...state.ui, selectedClipId: null, playing: false },
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
      const { project: textProject, track: textTrack } = action.trackId
        ? {
            project: state.project,
            track: targetTextTrack(state, action.trackId) ?? ensureTextTrack(state).track,
          }
        : ensureTextTrack(state);
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
      return withHistory(
        { ...state, project: textProject },
        {
          ...textProject,
          clips: [...textProject.clips, clip],
        },
      );
    }
    case "add_track_layer": {
      // Multi-layer export is not supported yet — keep a single video/text stack.
      return state;
    }
    case "update_clip": {
      const clips = state.project.clips.map((clip) =>
        clip.id === action.clipId ? { ...clip, ...action.patch, id: clip.id } : clip,
      );
      return withHistory(state, { ...state.project, clips });
    }
    case "update_project": {
      const next = normalizeProject({
        ...state.project,
        ...action.patch,
        frameRatio: action.patch.frameRatio
          ? normalizeFrameRatio(action.patch.frameRatio)
          : state.project.frameRatio,
      });
      return withHistory(state, next);
    }
    case "set_joint_transition": {
      const [leftId] = action.jointKey.split("::");
      const clips = state.project.clips.map((clip) =>
        clip.id === leftId ? { ...clip, transitionOut: action.transition } : clip,
      );
      const nextProject = { ...state.project, clips };
      return action.live ? withLive(state, nextProject) : withHistory(state, nextProject);
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
      return {
        ...withEdit(state, { ...state.project, clips }),
        ui: { ...state.ui, selectedClipId: right.id, playing: false },
      };
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
      const before = state.project.clips.find((clip) => clip.id === action.clipId);
      let clips = state.project.clips.map((clip) => {
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
      if (!action.live && before) {
        const after = clips.find((clip) => clip.id === action.clipId);
        if (
          after &&
          (after.startTime !== before.startTime || after.trackId !== before.trackId)
        ) {
          clips = stripTransitionsForMovedClips(state.project.clips, clips, [action.clipId]);
        }
      }
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? withLive(state, nextProject) : withHistory(state, nextProject);
    }
    case "apply_track_layout": {
      const positionById = new Map(action.placements.map((p) => [p.clipId, p]));
      let clips = state.project.clips.map((clip) => {
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
      if (!action.live) {
        const movedIds = action.placements
          .filter((placement) => {
            const before = state.project.clips.find((clip) => clip.id === placement.clipId);
            if (!before) return false;
            return (
              before.startTime !== placement.startTime || before.trackId !== placement.trackId
            );
          })
          .map((placement) => placement.clipId);
        clips = stripTransitionsForMovedClips(state.project.clips, clips, movedIds);
      }
      const nextProject = {
        ...state.project,
        clips,
        duration: Math.max(state.project.duration, projectEndTime({ ...state.project, clips })),
      };
      return action.live ? withLive(state, nextProject) : withEdit(state, nextProject);
    }
    case "move_clip_to_track": {
      const moving = state.project.clips.find((clip) => clip.id === action.clipId);
      if (!moving) return state;

      let project = state.project;
      let trackId = action.trackId ?? moving.trackId;

      if (action.insertTrackAt !== undefined) {
        const inserted = insertTrackAt(project, moving.kind, action.insertTrackAt);
        project = inserted.project;
        trackId = inserted.trackId;
      }

      if (action.ripplePlacements?.length) {
        const positionById = new Map(action.ripplePlacements.map((p) => [p.clipId, p]));
        let clips = project.clips.map((clip) => {
          const placement = positionById.get(clip.id);
          if (!placement) return clip;
          const track = project.tracks.find((item) => item.id === placement.trackId);
          return {
            ...clip,
            startTime: Math.max(0, placement.startTime),
            trackId: placement.trackId,
            kind: track?.kind ?? clip.kind,
          };
        });
        const movedIds = action.ripplePlacements
          .filter((placement) => {
            const before = project.clips.find((clip) => clip.id === placement.clipId);
            if (!before) return false;
            return (
              before.startTime !== placement.startTime || before.trackId !== placement.trackId
            );
          })
          .map((placement) => placement.clipId);
        clips = stripTransitionsForMovedClips(project.clips, clips, movedIds);
        return withEdit(state, { ...project, clips });
      }

      let clips = project.clips.map((clip) => {
        if (clip.id !== action.clipId) return clip;
        const track = project.tracks.find((item) => item.id === trackId);
        return {
          ...clip,
          startTime: Math.max(0, action.startTime),
          trackId,
          kind: track?.kind ?? clip.kind,
        };
      });
      if (
        action.startTime !== moving.startTime ||
        trackId !== moving.trackId
      ) {
        clips = stripTransitionsForMovedClips(project.clips, clips, [action.clipId]);
      }
      return withEdit(state, { ...project, clips });
    }
    case "ripple_add_clip": {
      let project = state.project;
      let trackId = action.clip.trackId;

      if (action.insertTrackAt !== undefined) {
        const kind = action.clip.kind ?? "video";
        const inserted = insertTrackAt(project, kind, action.insertTrackAt);
        project = inserted.project;
        trackId = inserted.trackId;
      }

      const track = trackForClip(project.tracks, { ...action.clip, trackId });
      const clip: EditorClip = {
        ...action.clip,
        id: newClipId(),
        trackId: track.id,
        kind: track.kind,
      };
      const placements = computeRippleInsertForNewClip({
        project,
        trackId: track.id,
        clip,
        centerTime: action.centerTime,
      });
      const positionById = new Map(placements.map((p) => [p.clipId, p]));
      const updated = project.clips.map((item) => {
        const placement = positionById.get(item.id);
        if (!placement) return item;
        return { ...item, startTime: placement.startTime, trackId: placement.trackId };
      });
      const placed = positionById.get(clip.id)!;
      const clips = [...updated, { ...clip, startTime: placed.startTime, trackId: placed.trackId }];
      return withEdit(state, { ...project, clips });
    }
    case "trim_clip": {
      const clips = state.project.clips.map((clip) => {
        if (clip.id !== action.clipId) return clip;
        const sourceMax =
          clip.sourceDuration != null && clip.sourceDuration > 0
            ? clip.sourceDuration
            : Number.POSITIVE_INFINITY;
        const nextTrimIn = Math.max(0, Math.min(action.trimIn, sourceMax - 0.05));
        const nextTrimOut = Math.max(
          nextTrimIn + 0.05,
          Math.min(action.trimOut, sourceMax),
        );
        const next: EditorClip = {
          ...clip,
          trimIn: nextTrimIn,
          trimOut: nextTrimOut,
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
      return action.live ? withLive(state, nextProject) : withHistory(state, nextProject);
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
        liveBaseline: null,
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
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const rest = total - m * 60;
  const whole = Math.floor(rest + 1e-9);
  const frac = rest - whole;

  // Sub-second majors (high zoom): show tenths or frames.
  if (frac > 1e-3 && frac < 1 - 1e-3) {
    if (Math.abs(frac - 0.5) < 0.02) {
      return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.5`;
    }
    const tenths = Math.round(frac * 10);
    if (Math.abs(frac * 10 - tenths) < 0.05) {
      return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${tenths}`;
    }
    const frames = Math.round(frac * 30);
    return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}`;
}

export function formatTimecodeFull(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
