"use client";

import { useState } from "react";
import { FileText, ImageIcon, Sparkles, Video } from "lucide-react";
import { ChatAssistAvatar, ChatMessageRow } from "./ChatMessageAvatars";

type BriefPayload = {
  subject?: string;
  objective?: string;
  audience?: string;
  keyMessage?: string;
  offer?: string;
  platform?: string;
  hook?: string;
  setting?: string;
  visualDirection?: string;
  notes?: string;
  brand?: {
    productFidelity?: string;
    logo?: string;
    ctaMode?: string;
    ctaText?: string;
    contactValue?: string;
    offerText?: string;
  };
  audio?: {
    voiceover?: string;
    sfx?: string;
    music?: string;
    voiceoverCopy?: string;
    musicMood?: string;
    sfxNotes?: string;
  };
  production?: {
    durationSeconds?: number;
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    styleSheetElementId?: string;
    referenceIntent?: string;
    scriptType?: string;
    elementType?: string;
    skipPromptEnhancement?: boolean;
  };
  timedBeats?: Array<{ startSec: number; endSec: number; action: string; camera?: string }>;
};

export type ReviewReference = {
  role: string;
  label: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  kind?: string;
};

export type ProductionPatch = {
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  durationSeconds?: number;
};

type Props = {
  mode?: "image" | "video" | "script" | "element";
  videoType?: string;
  status?: string;
  expired?: boolean;
  message?: string;
  payload: BriefPayload;
  warnings?: string[];
  estimatedCredits?: number;
  creditPriceLabel?: string;
  styleSheetLabel?: string;
  referenceSummary?: string[];
  references?: ReviewReference[];
  generationError?: string;
  readOnly?: boolean;
  busy?: boolean;
  onApprove?: () => Promise<void> | void;
  onPatchProduction?: (patch: ProductionPatch) => Promise<void> | void;
};

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null || value === "") return "—";
  return String(value);
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    product: "Product",
    logo: "Logo",
    style: "Style",
    reference: "Reference",
    supporting: "Reference",
    start_frame: "Start frame",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

const ASPECT_OPTIONS = ["16:9", "9:16", "1:1", "4:5", "4:3", "3:4", "21:9"];
const IMAGE_RESOLUTION_OPTIONS = ["1K", "2K", "4K"];
const IMAGE_QUALITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const VIDEO_RESOLUTION_OPTIONS = [
  { value: "854x480", label: "480p" },
  { value: "1280x720", label: "720p" },
  { value: "1920x1080", label: "1080p" },
];

function SettingSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label className={`studio-assist-setting-chip is-select${disabled ? " is-disabled" : ""}`}>
      <em>{label}</em>
      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AssistanceReviewCard({
  mode = "video",
  videoType,
  status,
  expired = false,
  payload,
  warnings = [],
  estimatedCredits,
  creditPriceLabel,
  styleSheetLabel,
  referenceSummary = [],
  references = [],
  generationError,
  readOnly,
  busy,
  onApprove,
  onPatchProduction,
}: Props) {
  const [error, setError] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);

  async function approve() {
    if (!onApprove) return;
    setError("");
    try {
      await onApprove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    }
  }

  async function patchProduction(next: ProductionPatch) {
    if (!onPatchProduction || readOnly || patchBusy) return;
    setError("");
    setPatchBusy(true);
    try {
      await onPatchProduction(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update settings.");
    } finally {
      setPatchBusy(false);
    }
  }

  const canEditSettings = Boolean(onPatchProduction) && !readOnly && !expired;
  const aspectRatio = payload.production?.aspectRatio || "1:1";
  const resolution = payload.production?.resolution || (mode === "image" ? "2K" : "1280x720");
  const quality = payload.production?.quality || "medium";
  const durationSeconds = payload.production?.durationSeconds ?? 8;

  const summaryRows = [
    ["Offer", payload.offer || payload.brand?.offerText],
    ["Message", payload.keyMessage],
    ["Look", payload.visualDirection],
    [
      payload.brand?.ctaMode === "contact" ? "Contact" : "Action",
      payload.brand?.contactValue || payload.brand?.ctaText,
    ],
  ].filter(
    ([, value], index, rows) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      rows.findIndex(([, candidate]) => candidate === value) === index,
  );
  const hasStyleSheet = Boolean(styleSheetLabel && styleSheetLabel !== "None");
  const visualRefs = references.filter(
    (ref) => ref.thumbnailUrl || ref.mediaUrl,
  );
  const ModeIcon =
    mode === "image" ? ImageIcon : mode === "video" ? Video : mode === "script" ? FileText : Sparkles;
  const modeTitle =
    mode === "image"
      ? "Image"
      : mode === "video"
        ? videoType === "hypermotion_ad"
          ? "Hypermotion video"
          : "Video"
        : mode === "script"
          ? "Script"
          : "Element";
  const headline =
    payload.subject?.trim() ||
    payload.offer?.trim() ||
    payload.keyMessage?.trim() ||
    modeTitle;

  return (
    <ChatMessageRow role="assistant" avatar={<ChatAssistAvatar />}>
    <article className="studio-assist-card studio-assist-review-card" aria-live="polite">
      <header className="studio-assist-review-hero">
        <h3 className="studio-assist-review-title">
          <span className="studio-assist-review-mode-icon" aria-hidden="true">
            <ModeIcon size={20} strokeWidth={2.25} />
          </span>
          <span>{headline}</span>
        </h3>
      </header>

      {visualRefs.length || hasStyleSheet || referenceSummary.length ? (
        <section className="studio-assist-review-section studio-assist-review-visuals">
          {visualRefs.length ? (
            <ul className="studio-assist-ref-circles" aria-label="References">
              {visualRefs.map((ref, index) => {
                const thumb = ref.thumbnailUrl || ref.mediaUrl;
                const key = `${ref.role}-${ref.label}-${index}`;
                return (
                  <li key={key} className="studio-assist-ref-circle" title={`${roleLabel(ref.role)}${ref.label ? `: ${ref.label}` : ""}`}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{roleLabel(ref.role).slice(0, 1)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {hasStyleSheet ? (
            <p className="studio-assist-style-pill">Style · {styleSheetLabel}</p>
          ) : null}
        </section>
      ) : null}

      {summaryRows.length ? (
        <section className="studio-assist-review-section">
          <dl className="studio-assist-review-summary">
            {summaryRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {mode === "image" || mode === "video" || mode === "script" || mode === "element" ? (
        <section className="studio-assist-review-section">
          <div className="studio-assist-settings-chips">
            {mode === "image" || mode === "video" ? (
              <SettingSelect
                label="Format"
                value={ASPECT_OPTIONS.includes(aspectRatio) ? aspectRatio : ASPECT_OPTIONS[0]}
                options={ASPECT_OPTIONS.map((value) => ({ value, label: value }))}
                disabled={!canEditSettings || patchBusy}
                onChange={(next) => void patchProduction({ aspectRatio: next })}
              />
            ) : null}
            {mode === "image" ? (
              <>
                <SettingSelect
                  label="Resolution"
                  value={
                    IMAGE_RESOLUTION_OPTIONS.includes(resolution)
                      ? resolution
                      : IMAGE_RESOLUTION_OPTIONS[1]
                  }
                  options={IMAGE_RESOLUTION_OPTIONS.map((value) => ({ value, label: value }))}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) => void patchProduction({ resolution: next })}
                />
                <SettingSelect
                  label="Quality"
                  value={
                    IMAGE_QUALITY_OPTIONS.some((item) => item.value === quality)
                      ? quality
                      : "medium"
                  }
                  options={IMAGE_QUALITY_OPTIONS}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) => void patchProduction({ quality: next })}
                />
              </>
            ) : null}
            {mode === "video" ? (
              <>
                <SettingSelect
                  label="Resolution"
                  value={
                    VIDEO_RESOLUTION_OPTIONS.some((item) => item.value === resolution)
                      ? resolution
                      : "1280x720"
                  }
                  options={VIDEO_RESOLUTION_OPTIONS}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) => void patchProduction({ resolution: next })}
                />
                <SettingSelect
                  label="Duration"
                  value={String(Math.max(4, Math.min(15, Number(durationSeconds) || 8)))}
                  options={Array.from({ length: 12 }, (_, index) => {
                    const seconds = index + 4;
                    return { value: String(seconds), label: `${seconds}s` };
                  })}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) =>
                    void patchProduction({ durationSeconds: Number(next) })
                  }
                />
              </>
            ) : null}
            {mode === "script" && payload.production?.scriptType ? (
              <span className="studio-assist-setting-chip">
                <em>Script</em>
                {displayValue(payload.production.scriptType)}
              </span>
            ) : null}
            {mode === "element" && payload.production?.elementType ? (
              <span className="studio-assist-setting-chip">
                <em>Element</em>
                {displayValue(payload.production.elementType)}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {warnings.length ? (
        <div className="studio-assist-notes is-warn">
          <p className="studio-assist-section-label">Warnings</p>
          <ul>
            {warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="studio-assist-review-footer">
        {generationError || error ? (
          <p className="studio-assist-card-error" role="alert">
            {generationError || error}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="studio-assist-card-actions">
            <button
              type="button"
              className="studio-generate-btn studio-assist-primary-btn studio-assist-generate-btn"
              disabled={busy || patchBusy || !onApprove}
              onClick={() => void approve()}
            >
              <span className="studio-assist-generate-label">
                {busy ? "Starting…" : "Generate"}
              </span>
              <span className="studio-assist-generate-cost">
                {creditPriceLabel ??
                  (estimatedCredits != null ? `${estimatedCredits} credits` : "Review approved")}
              </span>
            </button>
          </div>
        ) : (
          <p className="studio-assist-locked-note">
            {expired
              ? "Expired"
              : status === "done"
                ? mode === "script"
                  ? "Script ready — opened in Studio."
                  : mode === "element"
                    ? "Element ready — opened in Studio."
                    : "Generation complete."
                : status === "failed"
                  ? "Generation failed. Review the error above."
                  : status === "generating"
                    ? `${modeTitle} generation is in progress.`
                    : status === "approved"
                      ? `${modeTitle} generation is approved and starting.`
                      : "Earlier review — the latest confirmation appears below."}
          </p>
        )}
      </footer>
    </article>
    </ChatMessageRow>
  );
}
