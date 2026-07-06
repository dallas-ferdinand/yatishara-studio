export type TrackKind = "video" | "audio" | "text";

export type TransitionType = "none" | "crossfade" | "dipToBlack" | "wipeLeft";

export type TextAnimation = "none" | "fadeIn" | "fadeOut" | "slideUp" | "slideDown" | "popIn";

export type ClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
};

export type ClipTransition = {
  type: TransitionType;
  duration: number;
};

export type TextClipContent = {
  text: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  animation?: TextAnimation;
  animationDuration?: number;
};

export type EditorTrack = {
  id: string;
  kind: TrackKind;
  label: string;
  muted?: boolean;
  hidden?: boolean;
};

export type EditorClip = {
  id: string;
  assetId?: string;
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
  effects?: ClipEffects;
  transitionOut?: ClipTransition;
  text?: TextClipContent;
};

export type EditorMediaItem = {
  assetId: string;
  name: string;
  kind: "video" | "audio" | "image";
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
  { id: "track-text", kind: "text", label: "Text" },
  { id: "track-audio", kind: "audio", label: "Audio" },
];

export const MIN_PPS = 24;
export const MAX_PPS = 240;
export const DEFAULT_PPS = 72;
export const VIDEO_TRACK_HEIGHT = 44;
export const TEXT_TRACK_HEIGHT = 28;
export const AUDIO_TRACK_HEIGHT = 30;
export const TRACK_RAIL_WIDTH = 34;
export const RULER_HEIGHT = 18;
/** @deprecated use VIDEO_TRACK_HEIGHT or AUDIO_TRACK_HEIGHT */
export const TRACK_HEIGHT = VIDEO_TRACK_HEIGHT;
