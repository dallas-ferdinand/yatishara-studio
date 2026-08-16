"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Show `title` as a label inside the player chrome (top left). */
  showTitle?: boolean;
  /** Top-right control (e.g. store Buy icon) — same container as play/wave. */
  headerEnd?: ReactNode;
  /** Optional row under the play controls (e.g. download count). */
  footer?: ReactNode;
  /** Denser chrome for store listing cards (smaller pad / wave / orb). */
  compact?: boolean;
  /** Stable Orb palette seed (Create tiles pass jobId hash). */
  orbSeed?: number;
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

function AudioPlayerTrack({
  src,
  title,
  enabled,
  attempt,
}: {
  src: string;
  title?: string;
  enabled: boolean;
  attempt: number;
}) {
  const { setActiveItem } = useAudioPlayer<{ title?: string }>();

  useEffect(() => {
    if (!enabled || !src) {
      void setActiveItem(null);
      return;
    }
    // Attempt in id so failed loads can retry the same CDN URL.
    void setActiveItem({
      id: `${src}#r${attempt}`,
      src,
      data: title ? { title } : undefined,
    });
  }, [setActiveItem, src, title, enabled, attempt]);

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
  height: number | string;
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

function PlayControl({
  disabled,
  size = "md",
  onRequestLoad,
  src,
  title,
}: {
  disabled?: boolean;
  size?: "sm" | "md";
  onRequestLoad?: () => void;
  src?: string;
  title?: string;
}) {
  const player = useAudioPlayer();
  const playing = player.isPlaying;
  const loading = player.isBuffering && playing;

  return (
    <StudioOrbPlayButton
      size={size}
      playing={playing}
      loading={loading}
      showGlyph
      disabled={disabled || !src}
      seed={2100}
      onClick={() => {
        onRequestLoad?.();
        if (playing) {
          player.pause();
          return;
        }
        if (player.activeItem) {
          void player.play();
          return;
        }
        if (!src) return;
        void player.play({
          id: `${src}#force`,
          src,
          data: title ? { title } : undefined,
        });
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
  compact,
  durationHint,
  showTitle,
  headerEnd,
  footer,
  orbSeed = 2100,
  onRequestLoad,
}: {
  src: string;
  title?: string;
  isPane: boolean;
  compact?: boolean;
  durationHint?: number;
  showTitle?: boolean;
  headerEnd?: ReactNode;
  footer?: ReactNode;
  orbSeed?: number;
  onRequestLoad?: () => void;
}) {
  const player = useAudioPlayer();
  const failed = Boolean(player.error);
  // Pane + compact = masonry / card tile (big orb, wave fills leftover).
  const waveBars = isPane ? (compact ? 96 : 120) : compact ? 72 : 96;
  const waveHeight: number | string = isPane
    ? compact
      ? "100%"
      : 80
    : compact
      ? 28
      : 48;
  const waveform = useMemo(
    () => seedWaveform(src, waveBars),
    [src, waveBars],
  );
  const hasHead = Boolean(showTitle && title) || headerEnd != null;

  const timeBlock = (
    <span className="studio-chat-audio-time">
      <AudioPlayerTime className="text-inherit" />
      <span className="studio-chat-audio-time-sep">/</span>
      <DurationLabel durationHint={durationHint} />
    </span>
  );

  const play = () => {
    onRequestLoad?.();
    if (player.isPlaying) {
      player.pause();
      return;
    }
    if (player.activeItem) {
      void player.play();
      return;
    }
    // Lazy attach may not have run yet — play() can set the item directly.
    void player.play({
      id: `${src}#force`,
      src,
      data: title ? { title } : undefined,
    });
  };

  return (
    <div
      className={cn(
        "studio-chat-audio-player",
        isPane && "is-pane",
        compact && "is-compact",
        failed && "is-failed",
      )}
      title={showTitle ? undefined : title}
    >
      {hasHead ? (
        <div className="studio-chat-audio-head">
          {showTitle && title ? (
            <span className="studio-chat-audio-head-title" title={title}>
              {title}
            </span>
          ) : (
            <span className="studio-chat-audio-head-spacer" />
          )}
          {headerEnd ? (
            <div className="studio-chat-audio-head-end">{headerEnd}</div>
          ) : null}
        </div>
      ) : null}

      {isPane ? (
        <div className="studio-chat-audio-orb-hero">
          <StudioOrbPlayButton
            size="lg"
            live
            playing={player.isPlaying}
            loading={player.isBuffering && player.isPlaying}
            showGlyph
            disabled={failed || !src}
            seed={orbSeed}
            onClick={play}
          />
        </div>
      ) : null}

      {isPane ? (
        <>
          <div className="studio-chat-audio-meta">
            {failed ? (
              <span className="studio-chat-audio-error">Couldn&apos;t load</span>
            ) : (
              timeBlock
            )}
          </div>
          <div className="studio-chat-audio-row is-wave-fill">
            <WaveformScrubber
              key={src}
              data={waveform}
              height={waveHeight}
              durationHint={durationHint}
            />
          </div>
        </>
      ) : (
        <div className="studio-chat-audio-row">
          <PlayControl
            disabled={failed}
            size={compact ? "sm" : "md"}
            onRequestLoad={onRequestLoad}
            src={src}
            title={title}
          />
          <WaveformScrubber
            key={src}
            data={waveform}
            height={waveHeight}
            durationHint={durationHint}
          />
          {failed ? (
            <span className="studio-chat-audio-error">Couldn&apos;t load</span>
          ) : (
            timeBlock
          )}
        </div>
      )}

      {footer ? <div className="studio-chat-audio-foot">{footer}</div> : null}
    </div>
  );
}

export function StudioChatAudioPlayer({
  src,
  title,
  variant = "chat",
  durationHint,
  showTitle = false,
  headerEnd,
  footer,
  compact = false,
  orbSeed,
  lazy,
}: Props & { lazy?: boolean }) {
  const isPane = variant === "pane";
  // Create masonry mounts many <audio> at once — defer until near viewport.
  const lazyLoad = lazy ?? (isPane && Boolean(compact));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(!lazyLoad);
  const [attempt, setAttempt] = useState(0);
  const [forceLoad, setForceLoad] = useState(false);
  const enabled = Boolean(src) && (inView || forceLoad);

  useEffect(() => {
    setAttempt(0);
    setForceLoad(false);
    setInView(!lazyLoad);
  }, [src, lazyLoad]);

  useEffect(() => {
    if (!lazyLoad || inView) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazyLoad, inView, src]);

  const playerApiHost = (
    <AudioPlayerLoadWatch
      enabled={enabled}
      attempt={attempt}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );

  const player = (
    <AudioPlayerProvider>
      {playerApiHost}
      <AudioPlayerTrack
        src={src}
        title={title}
        enabled={enabled}
        attempt={attempt}
      />
      <AudioPlayerBody
        src={src}
        title={title}
        isPane={isPane}
        compact={compact}
        durationHint={durationHint}
        showTitle={showTitle}
        headerEnd={headerEnd}
        footer={footer}
        orbSeed={orbSeed}
        onRequestLoad={() => setForceLoad(true)}
      />
    </AudioPlayerProvider>
  );

  if (!isPane) {
    return (
      <div ref={rootRef} className="studio-chat-audio-host">
        {player}
      </div>
    );
  }
  return (
    <div ref={rootRef} className="studio-chat-audio-pane">
      {player}
    </div>
  );
}

/** Retry CDN attach a few times when metadata never lands (edge lag / browser media caps). */
function AudioPlayerLoadWatch({
  enabled,
  attempt,
  onRetry,
}: {
  enabled: boolean;
  attempt: number;
  onRetry: () => void;
}) {
  const player = useAudioPlayer();
  const duration = resolveDuration(player.duration, undefined);

  useEffect(() => {
    if (!enabled || !player.activeItem) return;
    if (duration !== undefined) return;
    if (attempt >= 3) return;

    const errorTimer = window.setTimeout(() => {
      if (player.error) onRetry();
    }, 1200);
    const stuckTimer = window.setTimeout(() => {
      if (resolveDuration(player.duration, undefined) === undefined) onRetry();
    }, 4500);

    return () => {
      window.clearTimeout(errorTimer);
      window.clearTimeout(stuckTimer);
    };
  }, [
    enabled,
    attempt,
    onRetry,
    player.activeItem,
    player.error,
    player.duration,
    duration,
  ]);

  return null;
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
