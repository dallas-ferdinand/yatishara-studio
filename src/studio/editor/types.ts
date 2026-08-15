export type TrackKind = "video" | "audio" | "text";

/** Picture/audio/text on a clip — images sit on video tracks but keep kind "image". */
export type ClipKind = TrackKind | "image";

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

export type EditorSidePanel = "inspect" | "export";

export type ClipEffects = {
  /** Picture edge fade-in seconds (timeline diamonds + preview/export opacity). */
  fadeIn?: number;
  /** Picture edge fade-out seconds (timeline diamonds + preview/export opacity). */
  fadeOut?: number;
  /** Audio edge fade-in seconds (inspector only — not timeline diamonds). */
  audioFadeIn?: number;
  /** Audio edge fade-out seconds (inspector only — not timeline diamonds). */
  audioFadeOut?: number;
  /**
   * Clip gain. Default 1 (100%). Inspector allows 0–2 (200%) for boost;
   * preview GainNode + export ffmpeg `volume=` honor the same range.
   */
  volume?: number;
  /** CapCut-style playback rate. Timeline duration = sourceTrim / speed. Default 1. */
  speed?: number;
  /** Canvas zoom. 1 = 100% cover fill. */
  scale?: number;
  /** Horizontal pan as a fraction of canvas width. */
  x?: number;
  /** Vertical pan as a fraction of canvas height. */
  y?: number;
  /** Rotation in degrees. */
  rotation?: number;
  /** Static picture opacity 0–1 (multiplied with edge fade envelope). Default 1. */
  opacity?: number;
};

export type ClipTransition = {
  type: TransitionType;
  duration: number;
};

/** Legacy stack ids or any Google Font family name. */
export type TextFontFamily = string;

export type TextCase = "none" | "upper" | "lower" | "title";

export type TextVerticalAlign = "top" | "middle" | "bottom";

export type TextClipContent = {
  text: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: TextVerticalAlign;
  animation?: TextAnimation;
  animationDuration?: number;
  /** Legacy stack id or Google Font family name. */
  fontFamily?: TextFontFamily;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textCase?: TextCase;
  /** Em units relative to font size (0 = default). */
  letterSpacing?: number;
  /** Multiplier of font size (1 = default). */
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** Empty / omitted = no background box. */
  backgroundColor?: string | null;
  backgroundPadding?: number;
  /** Corner radius of the background box (px at 1× pose scale). */
  backgroundRadius?: number;
  shadowColor?: string | null;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glow?: boolean;
  glowColor?: string;
  glowBlur?: number;
  /** Static opacity 0–1 (multiplied with motion animation opacity). */
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
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
  kind: ClipKind;
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
  /** Multi-select (ctrl/cmd + marquee). Includes selectedClipId when set. */
  selectedClipIds: string[];
  selectedJointKey: string | null;
  pixelsPerSecond: number;
  playing: boolean;
  inspectorOpen: boolean;
  editorMode: EditorMode;
  sidePanel: EditorSidePanel;
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
/** ~48px per frame at 30fps — enough to land a 1-frame cut. */
export const MAX_PPS = 1440;
export const DEFAULT_PPS = 72;
export const VIDEO_TRACK_HEIGHT = 50;
export const TEXT_TRACK_HEIGHT = 28;
export const AUDIO_TRACK_HEIGHT = VIDEO_TRACK_HEIGHT;
export const TRACK_RAIL_WIDTH = 52;
export const RULER_HEIGHT = 26;
export const INSPECTOR_WIDTH = 300;
