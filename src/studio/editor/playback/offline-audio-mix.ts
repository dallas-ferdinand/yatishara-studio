import { audioFadeGainAtLocalTime } from "../editorEffects";
import { transitionAudioGain } from "./audio-mixer";
import type { RenderSlice } from "./timeline-compiler";

export type OfflineVoice = {
  clipId: string;
  assetId: string;
  sourceTime: number;
  gain: number;
};

/**
 * Same voices the preview mixer plays at this slice: audio beds plus
 * embedded video sound, with fade envelopes and the A/B dip.
 */
export function voicesAtSlice(slice: RenderSlice): OfflineVoice[] {
  const voices: OfflineVoice[] = [];
  for (const item of slice.audio) {
    if (item.clip.muted || !item.clip.assetId) continue;
    voices.push({
      clipId: item.clip.clipId,
      assetId: item.clip.assetId,
      sourceTime: item.sourceTime,
      gain: item.gain,
    });
  }
  for (const sample of slice.video) {
    const clip = sample.clip;
    if (clip.kind !== "video" || clip.muted || !clip.assetId) continue;
    if (
      slice.timelineTime < clip.timelineStart ||
      slice.timelineTime >= clip.timelineEnd
    ) {
      continue;
    }
    const localTime = slice.timelineTime - clip.timelineStart;
    const clipDuration = clip.timelineEnd - clip.timelineStart;
    const transitionGain = transitionAudioGain(
      sample.role,
      slice.transition?.progress ?? (sample.role === "incoming" ? 1 : 0),
    );
    const fade = audioFadeGainAtLocalTime(
      clip.clip.effects,
      clipDuration,
      localTime,
      clip.kind,
    );
    voices.push({
      clipId: `video:${clip.clipId}`,
      assetId: clip.assetId,
      sourceTime: sample.sourceTime,
      gain: clip.volume * fade * transitionGain,
    });
  }
  return voices;
}
