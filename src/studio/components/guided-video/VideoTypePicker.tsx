"use client";

import { useEffect } from "react";
import { Clapperboard, X } from "lucide-react";

export type VideoTypeOption = {
  slug: string;
  label: string;
  description: string;
  /** Optional override; defaults to /studio/video-types/{slug}.webp */
  thumbUrl?: string;
};

type PanelProps = {
  value: string;
  options: VideoTypeOption[];
  onChange: (slug: string) => void;
  onClose: () => void;
  disabled?: boolean;
};

const SHORT_LABELS: Record<string, string> = {
  hypermotion_ad: "Hypermotion",
  standard: "Standard",
};

function videoTypeShortLabel(option: VideoTypeOption): string {
  return SHORT_LABELS[option.slug] ?? (option.label.replace(/\s+video$/i, "").trim() || option.label);
}

function videoTypeThumbUrl(option: VideoTypeOption): string {
  if (option.thumbUrl) return option.thumbUrl;
  const file =
    option.slug === "hypermotion_ad"
      ? "hypermotion"
      : option.slug === "standard"
        ? "standard"
        : option.slug.replace(/[^a-z0-9_-]+/gi, "-");
  return `/studio/video-types/${file}.webp`;
}

/** Grid panel — same shell as style picker. */
export function VideoTypePickerPanel({
  value,
  options,
  onChange,
  onClose,
  disabled,
}: PanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!options.length) return null;

  return (
    <div className="studio-preset-grid-panel" role="dialog" aria-label="Choose video type">
      <div className="studio-preset-grid-head">
        <strong>Video type</strong>
        <button type="button" className="studio-preset-grid-close" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="studio-preset-grid" role="listbox" aria-label="Video type options">
        {options.map((option) => {
          const active = option.slug === value;
          const thumb = videoTypeThumbUrl(option);
          const short = videoTypeShortLabel(option);
          return (
            <button
              key={option.slug}
              type="button"
              role="option"
              aria-selected={active}
              disabled={disabled}
              className={`studio-preset-grid-card${active ? " is-active" : ""}`}
              title={option.description}
              onClick={() => {
                onChange(option.slug);
                onClose();
              }}
            >
              <div className="studio-preset-grid-thumb">
                <img src={thumb} alt="" loading="lazy" />
              </div>
              <div className="studio-preset-grid-copy">
                <strong>{short}</strong>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TriggerProps = {
  value: string;
  options: VideoTypeOption[];
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
};

/** Icon-only action button — selected thumb fill + clapper overlay. */
export function VideoTypeTriggerButton({
  value,
  options,
  open,
  onClick,
  disabled,
}: TriggerProps) {
  const selected = options.find((option) => option.slug === value);
  const label = selected ? videoTypeShortLabel(selected) : "Video type";
  const thumb = selected ? videoTypeThumbUrl(selected) : null;
  const icon = <Clapperboard size={14} strokeWidth={2.25} aria-hidden="true" />;

  return (
    <button
      type="button"
      className={`studio-pill-btn studio-preset-trigger studio-video-type-trigger${open ? " is-open" : ""}${thumb ? " has-thumb" : ""}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={selected ? `Video type: ${label}` : "Choose video type"}
      title={selected?.description ?? "Video type"}
      disabled={disabled}
      onClick={onClick}
    >
      {thumb ? (
        <span className="studio-preset-trigger-media">
          <img src={thumb} alt="" className="studio-preset-trigger-sheet-img" />
          <span className="studio-preset-trigger-icon-overlay">{icon}</span>
        </span>
      ) : (
        icon
      )}
    </button>
  );
}

/** @deprecated Prefer VideoTypeTriggerButton + VideoTypePickerPanel */
export function VideoTypePicker({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: VideoTypeOption[];
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  if (!options.length) return null;
  return (
    <div className="studio-video-type-picker" role="radiogroup" aria-label="Video type">
      {options.map((option) => {
        const active = option.slug === value;
        return (
          <button
            key={option.slug}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`studio-video-type-chip${active ? " is-active" : ""}`}
            title={option.description}
            onClick={() => onChange(option.slug)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
