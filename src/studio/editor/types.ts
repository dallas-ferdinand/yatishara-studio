export type TrackKind = "video" | "audio";

export type EditorTrack = {
  id: string;
  kind: TrackKind;
  label: string;
  muted?: boolean;
  hidden?: boolean;
};

export type EditorClip = {
  id: string;
  assetId: string;
  trackId: string;
  /** Timeline position in seconds */
  startTime: number;
  /** Trim in-point within source media (seconds) */
  trimIn: number;
  /** Trim out-point within source media (seconds) */
  trimOut: number;
  /** Cached source duration when known */
  sourceDuration?: number;
  label: string;
  kind: TrackKind;
};

export type EditorMediaItem = {
  assetId: string;
  name: string;
  kind: TrackKind | "image";
  url?: string;
  thumbnailUrl?: string;
  duration?: number;
};

export type EditorProject = {
  name: string;
  folderId: string;
  sourceAssetId?: string;
  duration: number;
  tracks: EditorTrack[];
  clips: EditorClip[];
};

export type EditorUiState = {
  playhead: number;
  selectedClipId: string | null;
  pixelsPerSecond: number;
  playing: boolean;
};

export type EditorState = {
  project: EditorProject;
  ui: EditorUiState;
  past: EditorProject[];
  future: EditorProject[];
};

export const DEFAULT_TRACKS: EditorTrack[] = [
  { id: "track-video", kind: "video", label: "Video" },
  { id: "track-audio", kind: "audio", label: "Music" },
];

export const MIN_PPS = 24;
export const MAX_PPS = 240;
export const DEFAULT_PPS = 72;
export const VIDEO_TRACK_HEIGHT = 44;
export const AUDIO_TRACK_HEIGHT = 30;
export const TRACK_RAIL_WIDTH = 34;
export const RULER_HEIGHT = 18;
/** @deprecated use VIDEO_TRACK_HEIGHT or AUDIO_TRACK_HEIGHT */
export const TRACK_HEIGHT = VIDEO_TRACK_HEIGHT;
