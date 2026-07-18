"use client";

import { useMemo } from "react";
import { Waveform } from "@/components/ui/waveform";

/** Same seeded envelope as StudioChatAudioPlayer — varied bar heights. */
function seedWaveform(seedKey: string, bars: number): number[] {
  let seed = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    seed ^= seedKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    const t = i / Math.max(1, bars - 1);
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    const n = ((seed >>> 0) % 1000) / 1000;
    const envelope =
      0.18 +
      0.32 * Math.sin(Math.PI * t) +
      0.24 * Math.sin(Math.PI * t * 3.4 + (seed % 7)) +
      0.2 * Math.sin(Math.PI * t * 7.1 + n * 4) +
      0.18 * n;
    out.push(Math.min(1, Math.max(0.1, envelope)));
  }
  return out;
}

/**
 * Timeline audio clip — chat-style ElevenLabs bars, fill track height,
 * peaks reach the clip container (no animation).
 */
export function ClipAudioWaveform({
  clipId,
  widthPx,
}: {
  clipId: string;
  widthPx: number;
  heightPx?: number;
}) {
  const width = Math.max(28, widthPx);
  const bars = Math.max(24, Math.min(200, Math.floor(width / 5)));
  const data = useMemo(() => seedWaveform(clipId, bars), [clipId, bars]);

  return (
    <div className="studio-editor-audio-wave" aria-hidden="true">
      <Waveform
        className="studio-editor-audio-waveform"
        data={data}
        height="100%"
        barWidth={3}
        barGap={2}
        barRadius={999}
        barHeight={2}
        fadeEdges
        fadeWidth={28}
        barColor="gray"
        amplitude={0.62}
      />
    </div>
  );
}
