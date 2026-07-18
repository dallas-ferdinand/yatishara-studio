/** Shared export audio rules — keep preview mute/volume parity here. */

export function videoClipAudioFilter(
  clip: { effects?: { volume?: number } },
  muteAudio: boolean,
): string | null {
  const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
  if (muteAudio || volume <= 0.001) return null;
  let af = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
  if (Math.abs(volume - 1) > 0.001) af += `,volume=${volume}`;
  return af;
}
