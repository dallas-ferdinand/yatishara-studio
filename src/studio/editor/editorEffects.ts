import type { ClipEffects, TextAnimation, TextClipContent, TransitionType } from "./types";

export const FADE_PRESETS = [
  { id: "none", label: "None", fadeIn: 0, fadeOut: 0 },
  { id: "soft", label: "Soft", fadeIn: 0.4, fadeOut: 0.4 },
  { id: "cinematic", label: "Cinematic", fadeIn: 0.8, fadeOut: 1.0 },
  { id: "flash", label: "Flash in", fadeIn: 0.15, fadeOut: 0.6 },
] as const;

export const TRANSITION_TEMPLATES: Array<{
  id: TransitionType;
  label: string;
  duration: number;
}> = [
  { id: "none", label: "Cut", duration: 0 },
  { id: "crossfade", label: "Crossfade", duration: 0.5 },
  { id: "dipToBlack", label: "Dip to black", duration: 0.4 },
  { id: "wipeLeft", label: "Wipe left", duration: 0.45 },
];

export const TEXT_ANIMATION_TEMPLATES: Array<{
  id: TextAnimation;
  label: string;
  duration: number;
}> = [
  { id: "none", label: "Static", duration: 0 },
  { id: "fadeIn", label: "Fade in", duration: 0.5 },
  { id: "fadeOut", label: "Fade out", duration: 0.5 },
  { id: "slideUp", label: "Slide up", duration: 0.55 },
  { id: "slideDown", label: "Slide down", duration: 0.55 },
  { id: "popIn", label: "Pop in", duration: 0.4 },
];

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
