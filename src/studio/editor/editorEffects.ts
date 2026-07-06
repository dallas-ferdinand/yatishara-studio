import type { ClipEffects, TextAnimation, TextClipContent, TransitionType } from "./types";

export const FADE_PRESETS = [
  { id: "none", label: "None", fadeIn: 0, fadeOut: 0, icon: "circle" },
  { id: "soft", label: "Soft", fadeIn: 0.4, fadeOut: 0.4, icon: "sun" },
  { id: "cinematic", label: "Cinematic", fadeIn: 0.8, fadeOut: 1.0, icon: "film" },
  { id: "flash", label: "Flash", fadeIn: 0.15, fadeOut: 0.6, icon: "zap" },
  { id: "audio-out", label: "Audio tail", fadeIn: 0, fadeOut: 1.2, icon: "volume" },
] as const;

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
  { id: "fade", label: "Fade", icon: "sun" },
  { id: "transition", label: "Transitions", icon: "blend" },
  { id: "text", label: "Text", icon: "type" },
  { id: "layers", label: "Layers", icon: "layers" },
] as const;

export const DEFAULT_TEXT_STYLE: TextClipContent = {
  text: "Your text",
  fontSize: 42,
  color: "#ffffff",
  align: "center",
  animation: "fadeIn",
  animationDuration: 0.5,
};

export function clipOpacityAtLocalTime(
  effects: ClipEffects | undefined,
  clipDurationSec: number,
  localTime: number,
): number {
  const fadeIn = Math.max(0, effects?.fadeIn ?? 0);
  const fadeOut = Math.max(0, effects?.fadeOut ?? 0);
  let opacity = 1;
  if (fadeIn > 0 && localTime < fadeIn) {
    opacity = Math.min(opacity, localTime / fadeIn);
  }
  const fadeOutStart = clipDurationSec - fadeOut;
  if (fadeOut > 0 && localTime > fadeOutStart) {
    opacity = Math.min(opacity, Math.max(0, (clipDurationSec - localTime) / fadeOut));
  }
  return Math.max(0, Math.min(1, opacity));
}

export function applyFadePreset(effects: ClipEffects | undefined, presetId: string): ClipEffects {
  const preset = FADE_PRESETS.find((item) => item.id === presetId);
  if (!preset || preset.id === "none") {
    return { ...effects, fadeIn: 0, fadeOut: 0 };
  }
  return { ...effects, fadeIn: preset.fadeIn, fadeOut: preset.fadeOut };
}

export function toggleFadeEdge(
  effects: ClipEffects | undefined,
  edge: "in" | "out",
  duration = 0.5,
): ClipEffects {
  const current = effects ?? {};
  if (edge === "in") {
    const on = (current.fadeIn ?? 0) > 0;
    return { ...current, fadeIn: on ? 0 : duration };
  }
  const on = (current.fadeOut ?? 0) > 0;
  return { ...current, fadeOut: on ? 0 : duration };
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
