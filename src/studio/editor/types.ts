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

export type EditorMode = "select" | "transition" | "text";

export type ClipEffects = {
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
  /** Canvas zoom. 1 = 100% cover fill. */
  scale?: number;
  /** Horizontal pan as a fraction of canvas width. */
  x?: number;
  /** Vertical pan as a fraction of canvas height. */
  y?: number;
  /** Rotation in degrees. */
  rotation?: number;
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
  /** Original source URL. Export always resolves the original asset server-side. */
  url?: string;
  /** Normalized short-GOP MP4 used by the realtime editor engine. */
  proxyUrl?: string;
  proxyHighUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  videoCodec?: string;
  videoProfile?: string;
  audioCodec?: string;
  proxyKeyframeIntervalSeconds?: number;
  byteSize?: number;
  proxyByteSize?: number;
  proxyHighByteSize?: number;
  proxyStatus?: "pending" | "processing" | "ready" | "failed";
};

export type FrameRatio = "16:9" | "9:16" | "1:1";

export type EditorProject = {
  name: string;
  folderId: string;
  sourceAssetId?: string;
  duration: number;
  /** Output canvas aspect ratio. Defaults to 16:9 when missing. */
  frameRatio?: FrameRatio;
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
  /** Snapshot taken at the start of a live drag/trim gesture for correct undo. */
  liveBaseline: EditorProject | null;
};

export const LEGACY_TRACK_MAP: Record<string, string> = {
  "track-video": "track-v1",
  "track-text": "track-t1",
};

export const DEFAULT_TRACKS: EditorTrack[] = [
  { id: "track-v1", kind: "video", label: "V1" },
  { id: "track-audio", kind: "audio", label: "Audio" },
];

/** Hairline insert indicator; hit target is larger (TRACK_INSERT_HIT_PX). */
export const TRACK_INSERT_HEIGHT = 1;
export const TRACK_INSERT_HIT_PX = 16;

export const MIN_PPS = 24;
export const MAX_PPS = 240;
export const DEFAULT_PPS = 72;
export const VIDEO_TRACK_HEIGHT = 50;
export const TEXT_TRACK_HEIGHT = 28;
export const AUDIO_TRACK_HEIGHT = VIDEO_TRACK_HEIGHT;
export const TRACK_RAIL_WIDTH = 40;
export const RULER_HEIGHT = 26;
export const INSPECTOR_WIDTH = 300;
