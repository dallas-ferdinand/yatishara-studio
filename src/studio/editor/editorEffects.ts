import type {
  ClipEffects,
  TextAnimation,
  TextClipContent,
  TransitionType,
} from "./types";

export const TRANSITION_LIBRARY: Array<{
  id: TransitionType;
  label: string;
  duration: number;
  icon: string;
  group: "cut" | "dissolve" | "motion" | "stylized";
}> = [
  { id: "none", label: "Hard cut", duration: 0, icon: "scissors", group: "cut" },
  { id: "crossfade", label: "Crossfade", duration: 0.5, icon: "blend", group: "dissolve" },
  { id: "dipToBlack", label: "Dip black", duration: 0.45, icon: "moon", group: "dissolve" },
  { id: "dipToWhite", label: "Dip white", duration: 0.4, icon: "sun", group: "dissolve" },
  { id: "wipeLeft", label: "Wipe left", duration: 0.45, icon: "arrow-left", group: "motion" },
  { id: "wipeRight", label: "Wipe right", duration: 0.45, icon: "arrow-right", group: "motion" },
  { id: "wipeUp", label: "Wipe up", duration: 0.45, icon: "arrow-up", group: "motion" },
  { id: "slideLeft", label: "Slide", duration: 0.5, icon: "move", group: "motion" },
  { id: "zoomIn", label: "Zoom", duration: 0.4, icon: "zoom-in", group: "stylized" },
  { id: "blur", label: "Blur", duration: 0.35, icon: "sparkles", group: "stylized" },
];

/** @deprecated use TRANSITION_LIBRARY */
export const TRANSITION_TEMPLATES = TRANSITION_LIBRARY;

/** Clip audio gain: default 100%, boost allowed to 200%. */
export const CLIP_VOLUME_DEFAULT = 1;
export const CLIP_VOLUME_MAX = 2;

export function clampClipVolume(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return CLIP_VOLUME_DEFAULT;
  return Math.max(0, Math.min(CLIP_VOLUME_MAX, n));
}

export const TEXT_ANIMATION_TEMPLATES: Array<{
  id: TextAnimation;
  label: string;
  duration: number;
  icon: string;
}> = [
  { id: "none", label: "Static", duration: 0, icon: "type" },
  { id: "fadeIn", label: "Fade in", duration: 0.5, icon: "sunrise" },
  { id: "fadeOut", label: "Fade out", duration: 0.5, icon: "sunset" },
  { id: "slideUp", label: "Slide up", duration: 0.55, icon: "arrow-up" },
  { id: "slideDown", label: "Slide down", duration: 0.55, icon: "arrow-down" },
  { id: "popIn", label: "Pop", duration: 0.4, icon: "zap" },
];

export const TEXT_ANIMATION_IN_TEMPLATES = TEXT_ANIMATION_TEMPLATES.filter(
  (item) => item.id !== "fadeOut",
);

export const TEXT_ANIMATION_OUT_TEMPLATES = TEXT_ANIMATION_TEMPLATES.filter(
  (item) => item.id !== "fadeIn",
).map((item) =>
  item.id === "fadeOut" ? item : item.id === "none" ? item : { ...item, label: item.label.replace(/ in$/i, "") },
);

export type TextMotionPair = {
  animationIn: TextAnimation;
  animationInDuration: number;
  animationOut: TextAnimation;
  animationOutDuration: number;
};

/** Map a stored text clip to independent in/out motion. */
export function resolveTextMotion(
  text?: Pick<
    TextClipContent,
    "animation" | "animationDuration" | "animationOut" | "animationOutDuration"
  > | null,
): TextMotionPair {
  const raw = text?.animation ?? "none";
  const rawDur = Math.max(0, Number(text?.animationDuration) || 0);
  const hasOutField = text?.animationOut != null;
  if (hasOutField) {
    const out = text.animationOut ?? "none";
    const inId = raw === "fadeOut" ? "none" : raw;
    return {
      animationIn: inId,
      animationInDuration:
        inId === "none" ? 0 : rawDur || 0.5,
      animationOut: out,
      animationOutDuration:
        out === "none"
          ? 0
          : Math.max(0, Number(text.animationOutDuration) || 0) || 0.5,
    };
  }
  if (raw === "fadeOut") {
    return {
      animationIn: "none",
      animationInDuration: 0,
      animationOut: "fadeOut",
      animationOutDuration: rawDur || 0.5,
    };
  }
  return {
    animationIn: raw,
    animationInDuration: raw === "none" ? 0 : rawDur || 0.5,
    animationOut: "none",
    animationOutDuration: 0,
  };
}

export function textMotionSummary(motion: TextMotionPair): string {
  const inLabel =
    TEXT_ANIMATION_TEMPLATES.find((item) => item.id === motion.animationIn)?.label ??
    "Static";
  const outLabel =
    TEXT_ANIMATION_OUT_TEMPLATES.find((item) => item.id === motion.animationOut)
      ?.label ?? "Static";
  if (motion.animationIn === "none" && motion.animationOut === "none") return "Static";
  if (motion.animationOut === "none") return inLabel;
  if (motion.animationIn === "none") return outLabel;
  return `${inLabel} · ${outLabel}`;
}

export const EDITOR_MODES = [
  { id: "select", label: "Edit", icon: "mouse-pointer" },
  { id: "transition", label: "Transitions", icon: "blend" },
  { id: "text", label: "Text", icon: "type" },
] as const;

/** Quick fade lengths offered in the inspector when a clip is selected. */
export const FADE_LENGTH_PRESETS = [0, 0.25, 0.5, 1, 1.5, 2] as const;

export const DEFAULT_TEXT_STYLE: TextClipContent = {
  text: "Your text",
  fontSize: 42,
  color: "#ffffff",
  align: "center",
  verticalAlign: "middle",
  animation: "fadeIn",
  animationDuration: 0.5,
  animationOut: "none",
  animationOutDuration: 0,
  fontFamily: "system",
  bold: false,
  italic: false,
  underline: false,
  textCase: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  strokeColor: "#000000",
  strokeWidth: 0,
  backgroundColor: null,
  backgroundPadding: 8,
  backgroundRadius: 0,
  shadowColor: null,
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  glow: false,
  glowColor: "#ffffff",
  glowBlur: 12,
  opacity: 1,
  flipX: false,
  flipY: false,
};

/** Default canvas pose for new text clips (lower-third). */
export const DEFAULT_TEXT_EFFECTS = {
  scale: 1,
  x: 0,
  y: 0.32,
  rotation: 0,
} as const;

/**
 * Resolve audio fade lengths. Prefer dedicated audioFadeIn/Out.
 * Legacy audio-only clips stored fades on fadeIn/fadeOut — honor that when
 * kind is "audio" and the dedicated fields were never set.
 */
export function resolveAudioFadePair(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  kind?: ClipEffectsKind,
): { fadeIn: number; fadeOut: number } {
  const dedicated =
    effects?.audioFadeIn != null || effects?.audioFadeOut != null;
  if (dedicated) {
    return clampAudioFadePair(
      effects?.audioFadeIn ?? 0,
      effects?.audioFadeOut ?? 0,
      clipDurationSec,
    );
  }
  if (kind === "audio") {
    return clampAudioFadePair(
      effects?.fadeIn ?? 0,
      effects?.fadeOut ?? 0,
      clipDurationSec,
    );
  }
  return { fadeIn: 0, fadeOut: 0 };
}

type ClipEffectsKind = "video" | "audio" | "image" | "text";

/**
 * Picture opacity envelope for clip-local time (fadeIn/fadeOut only).
 * Independent of audio fades and of transitions between clips.
 */
export function clipOpacityAtLocalTime(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  localTime: number,
): number {
  const envelope = fadeEnvelopeAtLocalTime(
    effects?.fadeIn ?? 0,
    effects?.fadeOut ?? 0,
    clipDurationSec,
    localTime,
  );
  const opacity = Number(effects?.opacity);
  const base = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  return envelope * base;
}

/**
 * Smooth audio volume envelope for clip-local time (audioFadeIn/Out).
 * Ease-out (fast early, settles late). Fade-in and fade-out do not overlap
 * (sum is clamped to clip duration).
 */
export function audioFadeGainAtLocalTime(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  localTime: number,
  kind?: ClipEffectsKind,
): number {
  const { fadeIn, fadeOut } = resolveAudioFadePair(effects, clipDurationSec, kind);
  return fadeEnvelopeAtLocalTime(fadeIn, fadeOut, clipDurationSec, localTime);
}

function fadeEnvelopeAtLocalTime(
  fadeInSec: number,
  fadeOutSec: number,
  clipDurationSec: number,
  localTime: number,
): number {
  const duration = Math.max(0.05, clipDurationSec);
  const t = Math.max(0, Math.min(duration, localTime));
  const { fadeIn, fadeOut } = clampAudioFadePair(fadeInSec, fadeOutSec, duration);
  let gain = 1;
  if (fadeIn > 0 && t < fadeIn) {
    gain *= fadeEaseOut(t / fadeIn);
  }
  if (fadeOut > 0 && t > duration - fadeOut) {
    gain *= fadeEaseOut(Math.max(0, (duration - t) / fadeOut));
  }
  return Math.max(0, Math.min(1, gain));
}

/** Ease-out 0→1: steeper early, gentler into full level (quarter-sine). */
function fadeEaseOut(unit: number): number {
  const u = Math.max(0, Math.min(1, unit));
  return Math.sin((Math.PI / 2) * u);
}

/**
 * Clamp one fade duration so it cannot overlap the other side.
 * `otherFadeSec` is reserved for the opposite fade (fadeIn↔fadeOut).
 */
export function clampAudioFadeSec(
  fadeSec: number,
  clipDurationSec: number,
  otherFadeSec = 0,
): number {
  const duration = Math.max(0.05, clipDurationSec);
  const other = Math.max(0, Number.isFinite(otherFadeSec) ? otherFadeSec : 0);
  const max = Math.max(0, duration - Math.min(duration, other));
  if (!Number.isFinite(fadeSec) || fadeSec <= 0) return 0;
  return Math.min(max, fadeSec);
}

/** Normalize a fade-in/out pair so they never overlap inside the clip. */
export function clampAudioFadePair(
  fadeInSec: number,
  fadeOutSec: number,
  clipDurationSec: number,
): { fadeIn: number; fadeOut: number } {
  const duration = Math.max(0.05, clipDurationSec);
  let fadeIn = Math.max(0, Number.isFinite(fadeInSec) ? fadeInSec : 0);
  let fadeOut = Math.max(0, Number.isFinite(fadeOutSec) ? fadeOutSec : 0);
  fadeIn = Math.min(duration, fadeIn);
  fadeOut = Math.min(duration, fadeOut);
  if (fadeIn + fadeOut <= duration) return { fadeIn, fadeOut };
  const total = fadeIn + fadeOut;
  if (total <= 0) return { fadeIn: 0, fadeOut: 0 };
  const scale = duration / total;
  return { fadeIn: fadeIn * scale, fadeOut: fadeOut * scale };
}

type MotionSample = { opacity: number; y: number; scale: number };

function sampleEnterMotion(
  animation: TextAnimation,
  durationSec: number,
  localTime: number,
): MotionSample {
  if (animation === "none" || animation === "fadeOut") {
    return { opacity: 1, y: 0, scale: 1 };
  }
  const dur = Math.max(0.05, durationSec || 0.5);
  const t = Math.min(1, localTime / dur);
  if (animation === "fadeIn") {
    return { opacity: t, y: 0, scale: 1 };
  }
  if (animation === "slideUp") {
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.min(1, t * 1.2), y: (1 - ease) * 28, scale: 1 };
  }
  if (animation === "slideDown") {
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.min(1, t * 1.2), y: (ease - 1) * 28, scale: 1 };
  }
  if (animation === "popIn") {
    const scale = 0.85 + 0.15 * (1 - (1 - t) ** 3);
    return { opacity: Math.min(1, t * 1.4), y: 0, scale };
  }
  return { opacity: 1, y: 0, scale: 1 };
}

function sampleExitMotion(
  animation: TextAnimation,
  durationSec: number,
  localTime: number,
  clipDurationSec: number,
): MotionSample {
  if (animation === "none" || animation === "fadeIn") {
    return { opacity: 1, y: 0, scale: 1 };
  }
  const dur = Math.max(0.05, durationSec || 0.5);
  const start = Math.max(0, clipDurationSec - dur);
  const t = localTime < start ? 0 : Math.min(1, (localTime - start) / dur);
  if (t <= 0) return { opacity: 1, y: 0, scale: 1 };
  if (animation === "fadeOut") {
    return { opacity: 1 - t, y: 0, scale: 1 };
  }
  if (animation === "slideUp") {
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.max(0, 1 - t * 1.2), y: -ease * 28, scale: 1 };
  }
  if (animation === "slideDown") {
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.max(0, 1 - t * 1.2), y: ease * 28, scale: 1 };
  }
  if (animation === "popIn") {
    const scale = 1 - 0.15 * (1 - (1 - t) ** 3);
    return { opacity: Math.max(0, 1 - t * 1.4), y: 0, scale };
  }
  return { opacity: 1, y: 0, scale: 1 };
}

function motionToStyle(sample: MotionSample): { opacity: number; transform: string } {
  const y = Number.isFinite(sample.y) ? sample.y : 0;
  const scale = Number.isFinite(sample.scale) ? sample.scale : 1;
  if (Math.abs(y) < 0.01 && Math.abs(scale - 1) < 0.001) {
    return { opacity: sample.opacity, transform: "none" };
  }
  if (Math.abs(scale - 1) < 0.001) {
    return { opacity: sample.opacity, transform: `translateY(${y}px)` };
  }
  if (Math.abs(y) < 0.01) {
    return { opacity: sample.opacity, transform: `scale(${scale})` };
  }
  return { opacity: sample.opacity, transform: `translateY(${y}px) scale(${scale})` };
}

export function textAnimationStyle(
  animation: TextAnimation | undefined,
  animationDuration: number,
  localTime: number,
  clipDurationSec: number,
  animationOut?: TextAnimation,
  animationOutDuration?: number,
): { opacity: number; transform: string } {
  const motion = resolveTextMotion({
    animation,
    animationDuration,
    animationOut,
    animationOutDuration,
  });
  const enter = sampleEnterMotion(
    motion.animationIn,
    motion.animationInDuration,
    localTime,
  );
  const exit = sampleExitMotion(
    motion.animationOut,
    motion.animationOutDuration,
    localTime,
    clipDurationSec,
  );
  return motionToStyle({
    opacity: enter.opacity * exit.opacity,
    y: enter.y + exit.y,
    scale: enter.scale * exit.scale,
  });
}

export function textClipAnimationStyle(
  text: TextClipContent | undefined,
  localTime: number,
  clipDurationSec: number,
): { opacity: number; transform: string } {
  const motion = resolveTextMotion(text);
  return textAnimationStyle(
    motion.animationIn,
    motion.animationInDuration,
    localTime,
    clipDurationSec,
    motion.animationOut,
    motion.animationOutDuration,
  );
}

export function transitionLabel(type: TransitionType | undefined): string {
  return TRANSITION_LIBRARY.find((item) => item.id === type)?.label ?? "Cut";
}
