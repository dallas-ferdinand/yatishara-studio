/** Shared export audio rules — keep preview mute/volume/fade parity here. */

import {
  clipSpeedFromEffects,
  isIdentitySpeed,
} from "./naturalAudioSpeed";

function sourceTrimSec(
  clip: { trimIn?: number; trimOut?: number },
  fallback = 0.05,
): number {
  const trimIn = Number(clip.trimIn ?? 0);
  const trimOut = Number(clip.trimOut ?? trimIn + fallback);
  const duration = trimOut - trimIn;
  return Number.isFinite(duration) && duration > 0.05 ? duration : Math.max(0.05, fallback);
}

/**
 * Timeline duration for export. Draft effects.speed is ignored —
 * Process bakes a new asset at 1× before length changes.
 */
export function timelineDurationSec(
  clip: {
    trimIn?: number;
    trimOut?: number;
    effects?: { speed?: number; volume?: number; fadeIn?: number; fadeOut?: number };
  },
  fallback = 0.05,
): number {
  void clip.effects;
  return sourceTrimSec(clip, fallback);
}

/**
 * Build ffmpeg -af chain for a video clip's embedded audio.
 * Volume + afade in timeline time (speed is baked via processClipSpeed).
 */
export function videoClipAudioFilter(
  clip: {
    effects?: { volume?: number; fadeIn?: number; fadeOut?: number; speed?: number };
    trimIn?: number;
    trimOut?: number;
  },
  muteAudio: boolean,
  durationSec?: number,
): string | null {
  const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
  if (muteAudio || volume <= 0.001) return null;

  const duration = Math.max(
    0.05,
    durationSec != null && Number.isFinite(durationSec)
      ? durationSec
      : timelineDurationSec(clip),
  );
  const fadeIn = Math.max(0, Math.min(duration, clip.effects?.fadeIn ?? 0));
  const fadeOut = Math.max(0, Math.min(duration, clip.effects?.fadeOut ?? 0));

  let af = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
  if (fadeIn > 0) af += `,afade=t=in:st=0:d=${fadeIn}:curve=qsin`;
  if (fadeOut > 0) {
    af += `,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}:curve=qsin`;
  }
  if (Math.abs(volume - 1) > 0.001) af += `,volume=${volume}`;
  return af;
}

/** Fragment for bed mix after atrim/asetpts (no aresample). */
export function bedClipAudioFilters(
  clip: {
    effects?: { volume?: number; fadeIn?: number; fadeOut?: number; speed?: number };
    trimIn?: number;
    trimOut?: number;
  },
  durationSec?: number,
): string {
  const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
  const duration = Math.max(
    0.05,
    durationSec != null && Number.isFinite(durationSec)
      ? durationSec
      : timelineDurationSec(clip),
  );
  const fadeIn = Math.max(0, Math.min(duration, clip.effects?.fadeIn ?? 0));
  const fadeOut = Math.max(0, Math.min(duration, clip.effects?.fadeOut ?? 0));
  const parts: string[] = [];
  if (fadeIn > 0) parts.push(`afade=t=in:st=0:d=${fadeIn}:curve=qsin`);
  if (fadeOut > 0) {
    parts.push(
      `afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}:curve=qsin`,
    );
  }
  if (Math.abs(volume - 1) > 0.001) parts.push(`volume=${volume}`);
  return parts.join(",");
}

export { isIdentitySpeed, clipSpeedFromEffects };
