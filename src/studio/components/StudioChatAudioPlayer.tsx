"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AudioPlayerDuration,
  AudioPlayerProvider,
  AudioPlayerTime,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player";
import { ScrollingWaveform } from "@/components/ui/waveform";
import { cn } from "@/lib/utils";
import { StudioOrbPlayButton } from "@/studio/components/StudioOrbPlayButton";
import { MediaLoadWave } from "@/studio/components/media-load-frame";
import "./studio-chat-audio-player.css";

type Props = {
  src: string;
  title?: string;
  variant?: "chat" | "pane";
  onDownload?: () => void;
};

/** Stable envelope fed into ScrollingWaveform so the first view is full. */
function seedWaveform(seedKey: string, bars = 96): number[] {
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
      0.22 +
      0.28 * Math.sin(Math.PI * t) +
      0.22 * Math.sin(Math.PI * t * 3.4 + (seed % 7)) +
      0.18 * Math.sin(Math.PI * t * 7.1 + n * 4) +
      0.16 * n;
    out.push(Math.min(0.95, Math.max(0.12, envelope)));
  }
  return out;
}

function AudioPlayerTrack({ src, title }: { src: string; title?: string }) {
  const { setActiveItem } = useAudioPlayer<{ title?: string }>();

  useEffect(() => {
    void setActiveItem({
      id: src,
      src,
      data: title ? { title } : undefined,
    });
  }, [setActiveItem, src, title]);

  return null;
}

/**
 * ElevenLabs ScrollingWaveform: full bars in view from the left on mount,
 * scrolls while playing, click/drag seeks (no playhead line).
 */
function WaveformScrubber({
  data,
  height,
}: {
  data: number[];
  height: number;
}) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const duration =
    player.duration !== undefined &&
    Number.isFinite(player.duration) &&
    !Number.isNaN(player.duration) &&
    player.duration > 0
      ? player.duration
      : 0;
  const playing = player.isPlaying;

  function seekFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    player.seek(ratio * duration);
  }

  return (
    <div
      ref={trackRef}
      className="studio-chat-audio-wave"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={time}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        seekFromClientX(event.clientX);
      }}
    >
      <ScrollingWaveform
        className="studio-chat-audio-waveform"
        data={data}
        height={height}
        barWidth={3}
        barGap={2}
        barRadius={999}
        barHeight={3}
        barCount={80}
        fadeEdges
        fadeWidth={28}
        barColor="gray"
        speed={playing ? 30 : 0}
      />
    </div>
  );
}

function PlayControl({ disabled }: { disabled?: boolean }) {
  const player = useAudioPlayer();
  const playing = player.isPlaying;
  const loading = player.isBuffering && playing;

  return (
    <StudioOrbPlayButton
      size="md"
      playing={playing}
      loading={loading}
      showGlyph
      disabled={disabled || !player.activeItem}
      seed={2100}
      onClick={() => {
        if (playing) player.pause();
        else void player.play();
      }}
    />
  );
}

function AudioPlayerBody({
  src,
  title,
  isPane,
}: {
  src: string;
  title?: string;
  isPane: boolean;
}) {
  const player = useAudioPlayer();
  const failed = Boolean(player.error);
  const waveform = useMemo(
    () => seedWaveform(src, isPane ? 120 : 96),
    [src, isPane],
  );

  return (
    <div
      className={cn("studio-chat-audio-player", isPane && "is-pane")}
      title={title}
    >
      {isPane ? (
        <div className="studio-chat-audio-orb-hero">
          <StudioOrbPlayButton
            size="lg"
            playing={player.isPlaying}
            loading={player.isBuffering && player.isPlaying}
            showGlyph
            disabled={failed || !player.activeItem}
            seed={2100}
            onClick={() => {
              if (player.isPlaying) player.pause();
              else void player.play();
            }}
          />
        </div>
      ) : null}

      <div className="studio-chat-audio-row">
        {!isPane ? <PlayControl disabled={failed} /> : null}
        <WaveformScrubber key={src} data={waveform} height={isPane ? 80 : 48} />
        <span className="studio-chat-audio-time">
          <AudioPlayerTime className="text-inherit" />
          <span className="studio-chat-audio-time-sep">/</span>
          <AudioPlayerDuration className="text-inherit" />
        </span>
      </div>
    </div>
  );
}

export function StudioChatAudioPlayer({
  src,
  title,
  variant = "chat",
}: Props) {
  const isPane = variant === "pane";
  const player = (
    <AudioPlayerProvider>
      <AudioPlayerTrack src={src} title={title} />
      <AudioPlayerBody src={src} title={title} isPane={isPane} />
    </AudioPlayerProvider>
  );

  if (!isPane) return player;
  return <div className="studio-chat-audio-pane">{player}</div>;
}

/** Same chat-player footprint while generating or resolving a signed URL (no time). */
export function StudioChatAudioPlayerLoading({
  label = "Loading audio",
}: {
  label?: string;
}) {
  return (
    <div
      className="studio-chat-audio-player is-loading"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="studio-chat-audio-load-body">
        <MediaLoadWave size="sm" />
      </div>
    </div>
  );
}
