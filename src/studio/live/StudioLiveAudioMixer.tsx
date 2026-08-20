"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { LiveSource } from "./liveMixerModel";
import { sourceHasAudioMix } from "./liveMixerModel";

function formatDb(volume: number, muted: boolean) {
  if (muted || volume <= 0.0001) return "-∞ dB";
  const db = 20 * Math.log10(volume);
  const abs = Math.abs(db);
  const shown = abs >= 10 ? db.toFixed(0) : db.toFixed(1);
  return `${db > 0 ? "+" : ""}${shown} dB`;
}

function LiveFader({
  value,
  muted,
  label,
  onChange,
}: {
  value: number;
  muted: boolean;
  label: string;
  onChange: (volume: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setFromClientY = useCallback(
    (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const top = box.top + 10;
    const height = Math.max(1, box.height - 20);
    const t = 1 - (clientY - top) / height;
    onChange(Math.min(1, Math.max(0, t)));
    },
    [onChange],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientY(event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setFromClientY(event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      onChange(Math.min(1, value + step));
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(Math.max(0, value - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(1);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(0);
    }
  };

  const pct = Math.round(value * 100);

  return (
    <div
      ref={trackRef}
      className={`studio-live-fader${muted ? " is-muted" : ""}`}
      style={{ "--fader": String(value) } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
    >
      <span className="studio-live-fader-track" aria-hidden="true">
        <span className="studio-live-fader-fill" style={{ height: `${pct}%` }} />
      </span>
      <span
        className="studio-live-fader-cap"
        aria-hidden="true"
      />
    </div>
  );
}

export function StudioLiveAudioMixer({
  sources,
  levels,
  selectedSourceId,
  onSelect,
  onVolume,
  onMute,
}: {
  sources: LiveSource[];
  levels: Record<string, number>;
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
  onVolume: (sourceId: string, volume: number) => void;
  onMute: (sourceId: string, muted: boolean) => void;
}) {
  const rows = sources.filter((row) => sourceHasAudioMix(row.kind));
  return (
    <div className="studio-live-mixer">
      <div className="studio-live-mixer-head">Mixer</div>
      <div className="studio-live-mixer-strips">
        {rows.length === 0 ? (
          <p className="studio-live-status" style={{ padding: "8px 10px" }}>
            Audio shows up here when you add a camera, screen, phone, or mic.
          </p>
        ) : (
          rows.map((source) => {
            const volume = source.volume ?? 1;
            const muted = Boolean(source.muted);
            const level = muted ? 0 : Math.min(1, Math.max(0, levels[source.id] ?? 0));
            return (
              <div
                key={source.id}
                className={`studio-live-strip${source.id === selectedSourceId ? " is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="studio-live-strip-name"
                  onClick={() => onSelect(source.id)}
                >
                  {source.name}
                </button>
                <span className="studio-live-strip-db">
                  {formatDb(volume, muted)}
                </span>
                <div className="studio-live-strip-body">
                  <LiveFader
                    value={volume}
                    muted={muted}
                    label={`${source.name} volume`}
                    onChange={(next) => onVolume(source.id, next)}
                  />
                  <div className="studio-live-meter" aria-hidden="true">
                    <span
                      className="studio-live-meter-grad"
                      style={{ transform: `scaleY(${level})` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className={`studio-live-strip-mute${muted || volume <= 0 ? " is-off" : ""}`}
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={() => onMute(source.id, !muted)}
                >
                  {muted || volume <= 0 ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
