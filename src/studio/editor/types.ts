export type TrackKind = "video" | "audio" | "text";

export type TransitionType =
  | "none"
  | "crossfade"
  | "dipToBlack"
  | "dipToWhite"
  | "wipeLeft"
  | "wipeRight"
  | "wipeUp"
  | "slideLeft"
  | "zoomIn"
  | "blur";

export type TextAnimation = "none" | "fadeIn" | "fadeOut" | "slideUp" | "slideDown" | "popIn";

export type EditorMode = "select" | "fade" | "transition" | "text" | "layers";

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
  startTime: number;
  trimIn: number;
  trimOut: number;
  sourceDuration?: number;
  label: string;
  kind: TrackKind;
  effects?: ClipEffects;
  transitionOut?: ClipTransition;
  text?: TextClipContent;
};

export type TransitionJoint = {
  key: string;
  trackId: string;
  leftClipId: string;
  rightClipId: string;
  time: number;
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
  selectedJointKey: string | null;
  pixelsPerSecond: number;
  playing: boolean;
  inspectorOpen: boolean;
  editorMode: EditorMode;
};

export type EditorState = {
  project: EditorProject;
  ui: EditorUiState;
  past: EditorProject[];
  future: EditorProject[];
};

export const LEGACY_TRACK_MAP: Record<string, string> = {
  "track-video": "track-v1",
  "track-text": "track-t1",
};

export const DEFAULT_TRACKS: EditorTrack[] = [
  { id: "track-v1", kind: "video", label: "V1" },
  { id: "track-audio", kind: "audio", label: "Audio" },
];

export const TRACK_INSERT_HEIGHT = 8;

export const MIN_PPS = 24;
export const MAX_PPS = 240;
export const DEFAULT_PPS = 72;
export const VIDEO_TRACK_HEIGHT = 48;
export const TEXT_TRACK_HEIGHT = 32;
export const AUDIO_TRACK_HEIGHT = 34;
export const TRACK_RAIL_WIDTH = 44;
export const RULER_HEIGHT = 22;
export const INSPECTOR_WIDTH = 300;
