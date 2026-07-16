"use client";

type VideoTypeOption = {
  slug: string;
  label: string;
  description: string;
};

type Props = {
  value: string;
  options: VideoTypeOption[];
  onChange: (slug: string) => void;
  disabled?: boolean;
};

/** Video-type injector for Assistance (e.g. Hypermotion ad vs Standard). */
export function VideoTypePicker({ value, options, onChange, disabled }: Props) {
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
