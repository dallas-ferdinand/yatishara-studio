/**
 * Pitch-preserving tempo + gentle voice EQ (Audio Speedup recipe).
 * Shared by export and preview bake — keep free of Node/env.
 */

export const CLIP_SPEED_MIN = 0.5;
export const CLIP_SPEED_MAX = 2;

/** Clamp UI/export speed into the v1 range. Invalid → 1. */
export function clampClipSpeed(speed: unknown): number {
  const raw = typeof speed === "number" ? speed : Number(speed);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(CLIP_SPEED_MAX, Math.max(CLIP_SPEED_MIN, raw));
}

export function clipSpeedFromEffects(effects?: { speed?: number } | null): number {
  return clampClipSpeed(effects?.speed ?? 1);
}

export function isIdentitySpeed(speed: number): boolean {
  return Math.abs(clampClipSpeed(speed) - 1) < 0.001;
}

/**
 * Build atempo stages so each factor stays in [0.5, 2.0] and the product
 * equals `speed` (ffmpeg rejects a single atempo outside that range).
 */
export function buildAtempoChain(speed: number): string[] {
  let remaining = clampClipSpeed(speed);
  const stages: string[] = [];
  while (remaining > 2 + 1e-9) {
    stages.push("atempo=2.0");
    remaining /= 2;
  }
  while (remaining < 0.5 - 1e-9) {
    stages.push("atempo=0.5");
    remaining /= 0.5;
  }
  stages.push(`atempo=${remaining.toFixed(6)}`);
  return stages;
}

/** Presence/sibilance cuts + rumble highpass after tempo (voice narration). */
export const NATURAL_SPEED_EQ =
  "equalizer=f=3200:t=q:w=1.5:g=-1.5,equalizer=f=6000:t=q:w=2:g=-1,highpass=f=80";

/**
 * Full audio filter fragment for natural speed (no aresample/afade/volume).
 * Empty string when speed ≈ 1.
 */
export function buildNaturalSpeedAudioFilters(speed: number): string {
  const s = clampClipSpeed(speed);
  if (isIdentitySpeed(s)) return "";
  return [...buildAtempoChain(s), NATURAL_SPEED_EQ].join(",");
}

/** Video setpts so picture duration matches atempo'd audio. Empty when speed ≈ 1. */
export function buildSpeedSetptsFilter(speed: number): string {
  const s = clampClipSpeed(speed);
  if (isIdentitySpeed(s)) return "";
  return `setpts=PTS/${s.toFixed(6)}`;
}
