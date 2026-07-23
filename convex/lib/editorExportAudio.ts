/** Shared export audio rules — keep preview mute/volume/fade parity here. */

function clipDurationSec(clip: { trimIn?: number; trimOut?: number }, fallback = 0.05): number {
  const trimIn = Number(clip.trimIn ?? 0);
  const trimOut = Number(clip.trimOut ?? trimIn + fallback);
  const duration = trimOut - trimIn;
  return Number.isFinite(duration) && duration > 0.05 ? duration : Math.max(0.05, fallback);
}

/**
 * Build ffmpeg -af chain for a video clip's embedded audio.
 * Applies volume + afade in/out (qsin ≈ preview quarter-sine ease-out).
 */
export function videoClipAudioFilter(
  clip: {
    effects?: { volume?: number; fadeIn?: number; fadeOut?: number };
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
    durationSec != null && Number.isFinite(durationSec) ? durationSec : clipDurationSec(clip),
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
