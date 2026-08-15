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
type ExportAudioEffects = {
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  audioFadeIn?: number;
  audioFadeOut?: number;
};

type ExportAudioBedClip = {
  id: string;
  trackId: string;
  assetId?: string;
  kind: string;
  startTime: number;
  trimIn?: number;
  trimOut?: number;
  effects?: ExportAudioEffects;
};

/**
 * All audible audio-lane beds for export (every unmuted Audio 1/2/… lane).
 * Separate-audio / detached beds often land on Audio 2+ — must not drop them.
 */
export function collectExportAudioBeds<T extends ExportAudioBedClip>(project: {
  tracks: Array<{ id: string; kind: string; muted?: boolean }>;
  clips: T[];
}): T[] {
  const unmutedAudioTrackIds = new Set(
    project.tracks
      .filter((track) => track.kind === "audio" && !track.muted)
      .map((track) => track.id),
  );
  return project.clips
    .filter((clip) => {
      if (clip.kind !== "audio" || !clip.assetId) return false;
      if (!unmutedAudioTrackIds.has(clip.trackId)) return false;
      const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
      return volume > 0.001;
    })
    .sort((a, b) => a.startTime - b.startTime);
}

/** Timeline end for a bed/clip (start + source trim length). */
export function exportClipEndSec(clip: {
  startTime: number;
  trimIn?: number;
  trimOut?: number;
}): number {
  return Math.max(0, Number(clip.startTime) || 0) + timelineDurationSec(clip);
}

/**
 * How far the export canvas must run so trailing text/audio after the last
 * video still renders (black picture under late beds).
 */
export function exportCoverUntilSec(args: {
  textEnds?: number[];
  audioClips?: Array<{ startTime: number; trimIn?: number; trimOut?: number }>;
}): number {
  let end = 0;
  for (const value of args.textEnds ?? []) {
    if (Number.isFinite(value)) end = Math.max(end, value);
  }
  for (const clip of args.audioClips ?? []) {
    end = Math.max(end, exportClipEndSec(clip));
  }
  return end;
}

export function timelineDurationSec(
  clip: {
    trimIn?: number;
    trimOut?: number;
    effects?: ExportAudioEffects;
  },
  fallback = 0.05,
): number {
  void clip.effects;
  return sourceTrimSec(clip, fallback);
}

/** Prefer dedicated audio fades; legacy audio beds may still use fadeIn/fadeOut. */
function resolveExportAudioFades(
  effects: ExportAudioEffects | undefined,
  duration: number,
  legacySharedFields: boolean,
): { fadeIn: number; fadeOut: number } {
  const dedicated =
    effects?.audioFadeIn != null || effects?.audioFadeOut != null;
  let fadeIn = 0;
  let fadeOut = 0;
  if (dedicated) {
    fadeIn = Number(effects?.audioFadeIn) || 0;
    fadeOut = Number(effects?.audioFadeOut) || 0;
  } else if (legacySharedFields) {
    fadeIn = Number(effects?.fadeIn) || 0;
    fadeOut = Number(effects?.fadeOut) || 0;
  }
  fadeIn = Math.max(0, Math.min(duration, fadeIn));
  fadeOut = Math.max(0, Math.min(duration, fadeOut));
  if (fadeIn + fadeOut > duration && fadeIn + fadeOut > 0) {
    const scale = duration / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return { fadeIn, fadeOut };
}

/**
 * Force every source to 44.1k stereo before mixing.
 *
 * Mono must be duplicated at unity gain (`pan`), matching the Web Audio
 * up-mix the preview uses. swr's mono→stereo rematrix costs 3 dB, and a
 * single mono lane left unconverted makes amix negotiate mono and downmix
 * the whole export.
 */
export function exportAudioLayoutFilter(channels?: number): string {
  const mono = channels === 1;
  return mono
    ? "aresample=44100,pan=stereo|c0=c0|c1=c0"
    : "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
}

/**
 * Build ffmpeg -af chain for a video clip's embedded audio.
 * Volume + afade in timeline time (speed is baked via processClipSpeed).
 * Uses audioFadeIn/Out only — picture fadeIn/Out do not affect audio.
 */
export function videoClipAudioFilter(
  clip: {
    effects?: ExportAudioEffects;
    trimIn?: number;
    trimOut?: number;
  },
  muteAudio: boolean,
  durationSec?: number,
  channels?: number,
): string | null {
  const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
  if (muteAudio || volume <= 0.001) return null;

  const duration = Math.max(
    0.05,
    durationSec != null && Number.isFinite(durationSec)
      ? durationSec
      : timelineDurationSec(clip),
  );
  const { fadeIn, fadeOut } = resolveExportAudioFades(clip.effects, duration, false);

  let af = exportAudioLayoutFilter(channels);
  if (fadeIn > 0) af += `,afade=t=in:st=0:d=${fadeIn}:curve=qsin`;
  if (fadeOut > 0) {
    af += `,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}:curve=qsin`;
  }
  if (Math.abs(volume - 1) > 0.001) af += `,volume=${volume}`;
  return af;
}

/**
 * Soundtrack for a picture transition, matching the preview's
 * transitionAudioGain: the outgoing clip ramps to silence over the first half
 * of the transition and the incoming clip rises over the second half, so the
 * two soundtracks never play through each other. ffmpeg's acrossfade overlaps
 * them for the whole transition, which is why it is not used here.
 *
 * `offsetSec` is where the transition starts in the outgoing clip — the same
 * offset handed to xfade, so audio and picture stay locked.
 */
export function transitionAudioMixFilter(args: {
  durationSec: number;
  offsetSec: number;
}): string {
  const duration = Math.max(0.02, args.durationSec);
  const offset = Math.max(0, args.offsetSec);
  const half = duration / 2;
  const delayMs = Math.round(offset * 1000);
  return (
    `[0:a]afade=t=out:st=${offset.toFixed(3)}:d=${half.toFixed(3)}:curve=tri[xa0];` +
    `[1:a]afade=t=in:st=${half.toFixed(3)}:d=${half.toFixed(3)}:curve=tri,` +
    `adelay=${delayMs}:all=1[xa1];` +
    "[xa0][xa1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]"
  );
}

/** Fragment for bed mix after atrim/asetpts. */
export function bedClipAudioFilters(
  clip: {
    effects?: ExportAudioEffects;
    trimIn?: number;
    trimOut?: number;
  },
  durationSec?: number,
  channels?: number,
): string {
  const volume = Math.max(0, Math.min(2, clip.effects?.volume ?? 1));
  const duration = Math.max(
    0.05,
    durationSec != null && Number.isFinite(durationSec)
      ? durationSec
      : timelineDurationSec(clip),
  );
  const { fadeIn, fadeOut } = resolveExportAudioFades(clip.effects, duration, true);
  const parts: string[] = [exportAudioLayoutFilter(channels)];
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
