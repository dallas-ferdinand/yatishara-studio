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
    effects?: ExportAudioEffects;
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
  const { fadeIn, fadeOut } = resolveExportAudioFades(clip.effects, duration, true);
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
