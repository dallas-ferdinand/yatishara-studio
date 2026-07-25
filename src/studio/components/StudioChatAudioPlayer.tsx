"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
  /**
   * Known length in seconds (e.g. MediaRecorder wall-clock). Used when the
   * browser reports Infinity/NaN for WebM duration metadata.
   */
  durationHint?: number;
  onDownload?: () => void;
};

function formatAudioClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function resolveDuration(
  playerDuration: number | undefined,
  hint: number | undefined,
): number | undefined {
  if (
    playerDuration !== undefined &&
    Number.isFinite(playerDuration) &&
    playerDuration > 0
  ) {
    return playerDuration;
  }
  if (hint !== undefined && Number.isFinite(hint) && hint > 0) return hint;
  return undefined;
}

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
  durationHint,
}: {
  data: number[];
  height: number;
  durationHint?: number;
}) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const duration = resolveDuration(player.duration, durationHint) ?? 0;
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

function DurationLabel({ durationHint }: { durationHint?: number }) {
  const player = useAudioPlayer();
  const duration = resolveDuration(player.duration, durationHint);
  if (duration !== undefined) {
    return (
      <span className="studio-chat-audio-duration text-inherit">
        {formatAudioClock(duration)}
      </span>
    );
  }
  return <AudioPlayerDuration className="text-inherit" />;
}

function AudioPlayerBody({
  src,
  title,
  isPane,
  durationHint,
}: {
  src: string;
  title?: string;
  isPane: boolean;
  durationHint?: number;
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
        <WaveformScrubber
          key={src}
          data={waveform}
          height={isPane ? 80 : 48}
          durationHint={durationHint}
        />
        <span className="studio-chat-audio-time">
          <AudioPlayerTime className="text-inherit" />
          <span className="studio-chat-audio-time-sep">/</span>
          <DurationLabel durationHint={durationHint} />
        </span>
      </div>
    </div>
  );
}

export function StudioChatAudioPlayer({
  src,
  title,
  variant = "chat",
  durationHint,
}: Props) {
  const isPane = variant === "pane";
  const player = (
    <AudioPlayerProvider>
      <AudioPlayerTrack src={src} title={title} />
      <AudioPlayerBody
        src={src}
        title={title}
        isPane={isPane}
        durationHint={durationHint}
      />
    </AudioPlayerProvider>
  );

  if (!isPane) return player;
  return <div className="studio-chat-audio-pane">{player}</div>;
}

/** Same chat-player footprint while generating or resolving a signed URL (no time). */
export function StudioChatAudioPlayerLoading({
  label = "Loading audio",
  ariaLabel,
}: {
  label?: ReactNode;
  ariaLabel?: string;
}) {
  const a11y =
    ariaLabel ?? (typeof label === "string" ? label : "Generating audio");
  return (
    <div
      className="studio-chat-audio-player is-loading"
      role="status"
      aria-busy="true"
      aria-label={a11y}
    >
      <div className="studio-chat-audio-load-body">
        <MediaLoadWave size="sm" />
        {label ? <p className="studio-chat-audio-load-label">{label}</p> : null}
      </div>
    </div>
  );
}
