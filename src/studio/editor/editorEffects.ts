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

export const EDITOR_MODES = [
  { id: "select", label: "Edit", icon: "mouse-pointer" },
  { id: "transition", label: "Transitions", icon: "blend" },
  { id: "text", label: "Text", icon: "type" },
] as const;

export const DEFAULT_TEXT_STYLE: TextClipContent = {
  text: "Your text",
  fontSize: 42,
  color: "#ffffff",
  align: "center",
  animation: "fadeIn",
  animationDuration: 0.5,
};

/** Clip picture edge fades were removed — transitions handle dissolves. Kept for call sites. */
export function clipOpacityAtLocalTime(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  localTime: number,
): number {
  void effects;
  void clipDurationSec;
  void localTime;
  return 1;
}

/**
 * Smooth audio volume envelope for clip-local time.
 * Ease-out (fast early, settles late). Fade-in and fade-out do not overlap
 * (sum is clamped to clip duration).
 */
export function audioFadeGainAtLocalTime(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  localTime: number,
): number {
  const duration = Math.max(0.05, clipDurationSec);
  const t = Math.max(0, Math.min(duration, localTime));
  const { fadeIn, fadeOut } = clampAudioFadePair(
    effects?.fadeIn ?? 0,
    effects?.fadeOut ?? 0,
    duration,
  );
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

export function textAnimationStyle(
  animation: TextAnimation | undefined,
  animationDuration: number,
  localTime: number,
  clipDurationSec: number,
): { opacity: number; transform: string } {
  const dur = Math.max(0.05, animationDuration || 0.5);
  const anim = animation ?? "none";

  if (anim === "fadeIn") {
    const t = Math.min(1, localTime / dur);
    return { opacity: t, transform: "translateY(0)" };
  }
  if (anim === "fadeOut") {
    const start = Math.max(0, clipDurationSec - dur);
    const t = localTime < start ? 1 : Math.max(0, 1 - (localTime - start) / dur);
    return { opacity: t, transform: "translateY(0)" };
  }
  if (anim === "slideUp") {
    const t = Math.min(1, localTime / dur);
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.min(1, t * 1.2), transform: `translateY(${(1 - ease) * 28}px)` };
  }
  if (anim === "slideDown") {
    const t = Math.min(1, localTime / dur);
    const ease = 1 - (1 - t) ** 3;
    return { opacity: Math.min(1, t * 1.2), transform: `translateY(${(ease - 1) * 28}px)` };
  }
  if (anim === "popIn") {
    const t = Math.min(1, localTime / dur);
    const scale = 0.85 + 0.15 * (1 - (1 - t) ** 3);
    return { opacity: Math.min(1, t * 1.4), transform: `scale(${scale})` };
  }
  return { opacity: 1, transform: "none" };
}

export function transitionLabel(type: TransitionType | undefined): string {
  return TRANSITION_LIBRARY.find((item) => item.id === type)?.label ?? "Cut";
}
