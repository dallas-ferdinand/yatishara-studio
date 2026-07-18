"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FileText, ImageIcon, Sparkles, Video } from "lucide-react";
import { friendlyGenerationError } from "@/studio/lib/generationUserErrors";
import { ChatMessageRow } from "./ChatMessageAvatars";

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
  studioId?: string;
  studioKind?: "asset" | "element";
  elementType?: string;
};

export type ProductionPatch = {
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  durationSeconds?: number;
  videoType?: "standard" | "hypermotion_ad";
  audioEnabled?: boolean;
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
  onOpenEntry?: (entry: {
    type: string;
    path: string;
    name: string;
    studioKind: string;
    studioId: string;
    elementType?: string;
    mediaKind?: string | null;
    thumbnailUrl?: string;
    mediaUrl?: string;
  }) => void;
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
/** Seedance 2.0 (Vercel Gateway catalog): 720p / 1080p only. */
const VIDEO_RESOLUTION_OPTIONS = [
  { value: "1280x720", label: "720p" },
  { value: "1920x1080", label: "1080p" },
];
const VIDEO_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "hypermotion_ad", label: "Hypermotion" },
];
const AUDIO_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function useAssistMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  minWidth = 160,
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(minWidth, rect.width);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      setStyle({
        position: "fixed",
        left,
        top: openUp ? undefined : rect.bottom + 8,
        bottom: openUp ? window.innerHeight - rect.top + 8 : undefined,
        maxHeight: Math.max(160, openUp ? spaceAbove : spaceBelow),
        minWidth: width,
        zIndex: 10000,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, minWidth, open]);

  return style;
}

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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.value === value) ?? options[0];
  const hasRatioOptions = options.some((option) => option.value.includes(":"));
  const menuStyle = useAssistMenuPosition(open, wrapRef, hasRatioOptions ? 220 : 160);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`studio-inline-setting studio-assist-setting-select${disabled ? " is-disabled" : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className="studio-inline-setting-trigger"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((state) => !state);
        }}
      >
        <span>{label}</span>
        <strong>{active?.label ?? value}</strong>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="studio-settings-menu studio-inline-settings-menu is-fixed"
              style={menuStyle}
              role="listbox"
              aria-label={label}
            >
              <div
                className={`studio-settings-chip-grid${options.length === 3 ? " is-three" : ""}`}
                role="group"
                aria-label={label}
              >
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={`studio-settings-chip${option.value.includes(":") ? " has-ratio-icon" : ""}${option.value === value ? " is-active" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.value.includes(":") ? (
                      <span
                        className={`studio-ratio-glyph studio-ratio-glyph-${option.value.replace(":", "x")}`}
                        aria-hidden="true"
                      >
                        <span />
                      </span>
                    ) : null}
                    <span className="studio-settings-chip-copy">
                      <span>{option.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function AssistanceReviewCard({
  mode = "video",
  videoType,
  status,
  expired = false,
  message,
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
  onOpenEntry,
}: Props) {
  const [error, setError] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

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
  const activeVideoType =
    videoType === "hypermotion_ad" ? "hypermotion_ad" : "standard";
  const audioEnabled =
    payload.audio?.voiceover === "include" ||
    payload.audio?.sfx === "include" ||
    payload.audio?.music === "include";

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
  const summaryMessage = message?.trim() || headline;
  const isFailed = status === "failed";
  const generateStatusLabel = expired
    ? "Expired"
    : status === "done"
      ? "Done"
      : status === "generating" || status === "approved"
        ? "Generating…"
        : readOnly && !isFailed
          ? "Done"
          : null;
  const canRetry = isFailed && Boolean(onApprove) && !expired;
  const canGenerate =
    (!readOnly && !expired && !generateStatusLabel && Boolean(onApprove)) || canRetry;
  const rawError = generationError || error;
  const friendlyError = rawError
    ? friendlyGenerationError(
        rawError,
        mode === "image" || mode === "video" || mode === "script" ? mode : "video",
      )
    : null;
  const friendlyErrorDetail = friendlyError
    ? friendlyError.hint
      ? `${friendlyError.message} ${friendlyError.hint}`
      : friendlyError.message
    : null;

  return (
    <ChatMessageRow role="assistant">
    <article
      className={`studio-assist-card studio-assist-review-card${expired ? " is-expired" : ""}${generateStatusLabel && !canRetry ? " is-settled" : ""}${isFailed ? " is-failed" : ""}`}
      aria-live="polite"
    >
      <div className="studio-assist-review-title">
        <span className="studio-assist-review-mode-icon" aria-hidden="true">
          <ModeIcon size={20} strokeWidth={2.25} />
        </span>
        <span>{summaryMessage}</span>
      </div>

      <div
        id={detailsId}
        className="studio-assist-review-details"
        hidden={!expanded}
      >
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
                  label="Type"
                  value={activeVideoType}
                  options={VIDEO_TYPE_OPTIONS}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) =>
                    void patchProduction({
                      videoType: next as "standard" | "hypermotion_ad",
                    })
                  }
                />
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
                <SettingSelect
                  label="Audio"
                  value={audioEnabled ? "on" : "off"}
                  options={AUDIO_OPTIONS}
                  disabled={!canEditSettings || patchBusy}
                  onChange={(next) =>
                    void patchProduction({ audioEnabled: next === "on" })
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

      {headline !== summaryMessage ? (
        <p className="studio-assist-review-detail-title">{headline}</p>
      ) : null}

      {visualRefs.length || hasStyleSheet || referenceSummary.length ? (
        <section className="studio-assist-review-section studio-assist-review-visuals">
          {visualRefs.length ? (
            <ul className="studio-assist-ref-circles" aria-label="References">
              {visualRefs.map((ref, index) => {
                const thumb = ref.thumbnailUrl || ref.mediaUrl;
                const key = `${ref.role}-${ref.label}-${index}`;
                const canOpen = Boolean(onOpenEntry && ref.studioId && ref.studioKind);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`studio-assist-ref-circle${canOpen ? " is-openable" : ""}`}
                      title={
                        canOpen
                          ? `Open ${ref.label || roleLabel(ref.role)}`
                          : `${roleLabel(ref.role)}${ref.label ? `: ${ref.label}` : ""}`
                      }
                      disabled={!canOpen}
                      onClick={() => {
                        if (!canOpen || !ref.studioId || !ref.studioKind) return;
                        onOpenEntry?.({
                          type: "file",
                          path:
                            ref.studioKind === "element"
                              ? `/Studio/elements/${ref.studioId}`
                              : `/Studio/assets/${ref.studioId}`,
                          name: ref.label || roleLabel(ref.role),
                          studioKind: ref.studioKind,
                          studioId: ref.studioId,
                          elementType: ref.elementType,
                          mediaKind:
                            ref.kind === "image" ||
                            ref.kind === "video" ||
                            ref.kind === "audio"
                              ? ref.kind
                              : null,
                          thumbnailUrl: ref.thumbnailUrl,
                          mediaUrl: ref.mediaUrl,
                        });
                      }}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" loading="lazy" />
                      ) : (
                        <span aria-hidden="true">{roleLabel(ref.role).slice(0, 1)}</span>
                      )}
                    </button>
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

      {warnings.length ? (
        <div className="studio-assist-notes">
          <p className="studio-assist-section-label">Notes</p>
          <ul>
            {warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      <footer className="studio-assist-review-footer">
        {friendlyError ? (
          <div className="studio-assist-card-error" role="alert">
            <strong>{friendlyError.title}</strong>
            {friendlyErrorDetail ? <p>{friendlyErrorDetail}</p> : null}
          </div>
        ) : null}

        <div className="studio-assist-review-actions">
          <button
            type="button"
            className="studio-assist-review-half-btn is-review"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((open) => !open)}
          >
            <span className="studio-assist-review-half-label">
              {expanded ? "Close" : "Review"}
              <ChevronDown
                className={`studio-assist-review-half-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              />
            </span>
          </button>
          {canGenerate ? (
            <button
              type="button"
              className="studio-generate-btn studio-assist-primary-btn studio-assist-generate-btn studio-assist-review-half-btn is-generate"
              disabled={busy || patchBusy || !onApprove}
              onClick={() => void approve()}
            >
              <span className="studio-assist-review-half-label">
                {busy ? "Starting…" : canRetry ? "Retry" : "Generate"}
              </span>
              {(creditPriceLabel || estimatedCredits != null) && !busy ? (
                <span className="studio-assist-review-half-cost">
                  {creditPriceLabel ?? `${estimatedCredits} credits`}
                </span>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              className="studio-assist-review-half-btn is-generate is-status"
              disabled
            >
              <span className="studio-assist-review-half-label">
                {generateStatusLabel ?? (isFailed ? "Failed" : "Done")}
              </span>
            </button>
          )}
        </div>
      </footer>
    </article>
    </ChatMessageRow>
  );
}
