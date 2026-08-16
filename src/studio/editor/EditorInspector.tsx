// @ts-nocheck
"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isIdentitySpeed } from "../../../convex/lib/naturalAudioSpeed";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blend,
  Bold,
  CaseSensitive,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  Italic,
  LayoutTemplate,
  Moon,
  MousePointer2,
  Move,
  Music2,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Sun,
  Type,
  Underline,
  Gauge,
  Volume2,
  ZoomIn,
} from "lucide-react";
import { StudioColorPicker } from "./StudioColorPicker";
import { GoogleFontSelect } from "./GoogleFontSelect";
import {
  EDITOR_MODES,
  DEFAULT_TEXT_STYLE,
  FADE_LENGTH_PRESETS,
  TEXT_ANIMATION_IN_TEMPLATES,
  TEXT_ANIMATION_OUT_TEMPLATES,
  resolveTextMotion,
  textMotionSummary,
  TRANSITION_LIBRARY,
  CLIP_VOLUME_DEFAULT,
  CLIP_VOLUME_MAX,
  clampAudioFadePair,
  clampAudioFadeSec,
  clampClipVolume,
  resolveAudioFadePair,
  transitionLabel,
} from "./editorEffects";
import {
  CLIP_TRANSFORM_LIMITS,
  clampClipOpacity,
  normalizeClipTransform,
} from "./clipTransform";
import { normalizeTextTransform } from "./textLayout";
import {
  CLIP_SPEED_MAX,
  CLIP_SPEED_MIN,
  FRAME_RATIO_PRESETS,
  clampClipSpeed,
  clipSpeed,
  normalizeFrameRatio,
  pendingSpeedDurationSec,
} from "./projectContract";
import {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_AUDIO_FORMAT_PRESETS,
  EXPORT_KIND_PRESETS,
  EXPORT_RESOLUTION_PRESETS,
  EXPORT_VIDEO_FORMAT_PRESETS,
  exportSizeForRatioAndResolution,
  normalizeExportResolution,
} from "../../../convex/lib/editorExport";
import { clipDuration, timelineViewDuration } from "./editorState";
import { jointByKey, leftClipForJoint } from "./editorTimelineUtils";
import { resolveClipPoster } from "./videoPoster";
import { StudioRatioGlyph } from "../components/StudioRatioGlyph";
import { MotionPresetGlyph } from "./MotionPresetGlyph";
import { loadGoogleFont } from "./loadGoogleFont";
import {
  BUILTIN_TEXT_PRESETS,
  TEXT_PRESET_CATEGORIES,
  applyTextStylePreset,
  loadCustomTextPresets,
  presetEffectLabels,
  presetPreviewStyle,
  saveCustomTextPresets,
  textStyleMatchesPreset,
  textStyleSnapshot,
} from "./textPresets";

const ICON = 16;
const MODE_ICONS = {
  "mouse-pointer": MousePointer2,
  blend: Blend,
  type: Type,
};

const TRANSITION_ICONS = {
  scissors: Scissors,
  blend: Sparkles,
  moon: Moon,
  sun: Sun,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  move: Move,
  "zoom-in": ZoomIn,
  sparkles: Sparkles,
};

function TransitionRow({ template, active, disabled, onClick }) {
  const Icon = TRANSITION_ICONS[template.icon] ?? Sparkles;
  return (
    <button
      type="button"
      className={`studio-editor-transition-row${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={template.label}
    >
      <span className="studio-editor-transition-row-icon">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="studio-editor-transition-row-label">{template.label}</span>
      {template.duration > 0 ? (
        <span className="studio-editor-transition-row-meta">{template.duration}s</span>
      ) : null}
    </button>
  );
}

function InspectorSection({
  title,
  hint,
  onReset,
  children,
  collapsible = false,
  open = true,
  onToggle,
  meta,
}) {
  const showBody = !collapsible || open;
  return (
    <section
      className={`studio-editor-inspector-section${collapsible ? " is-collapsible" : ""}${collapsible && open ? " is-open" : ""}`}
    >
      <div className="studio-editor-inspector-section-head">
        {collapsible ? (
          <button
            type="button"
            className="studio-editor-inspector-section-toggle"
            aria-expanded={open}
            onClick={onToggle}
          >
            <h4>{title}</h4>
            {meta && !open ? (
              <span className="studio-editor-inspector-section-meta">{meta}</span>
            ) : null}
            <ArrowDown size={14} aria-hidden="true" className="studio-editor-inspector-section-caret" />
          </button>
        ) : (
          <>
            <h4>{title}</h4>
            {meta ? (
              <span className="studio-editor-inspector-section-meta">{meta}</span>
            ) : null}
          </>
        )}
        {onReset ? (
          <button
            type="button"
            className="studio-editor-inspector-reset"
            onClick={onReset}
            title={`Reset ${title.toLowerCase()}`}
            aria-label={`Reset ${title.toLowerCase()}`}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {showBody ? (
        <>
          {hint ? <p className="studio-editor-inspector-hint">{hint}</p> : null}
          <div className="studio-editor-inspector-section-body">{children}</div>
        </>
      ) : null}
    </section>
  );
}

/** Contained Style rows only — Fill/Stroke/… (not top-level sections). */
function StyleAccordion({
  label,
  open,
  onToggle,
  expandable = true,
  summary,
  onReset,
  children,
}) {
  const onSummaryClick = (event) => {
    if (!expandable) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Keep color swatches / inputs / nested buttons working; title rows toggle.
    if (
      target.closest(
        "input, select, textarea, a, .studio-editor-color-row-actions, .studio-editor-color-swatch, .studio-editor-toggle",
      )
    ) {
      return;
    }
    onToggle();
  };

  return (
    <div className={`studio-editor-style-card${open ? " is-open" : ""}`}>
      <div className="studio-editor-style-card-head">
        <div
          className="studio-editor-style-card-summary"
          onClick={onSummaryClick}
          onKeyDown={
            expandable
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSummaryClick(event);
                  }
                }
              : undefined
          }
          role={expandable ? "button" : undefined}
          tabIndex={expandable ? 0 : undefined}
          aria-expanded={expandable ? open : undefined}
        >
          {summary}
        </div>
        {onReset ? (
          <button
            type="button"
            className="studio-editor-inspector-reset"
            onClick={onReset}
            title={`Reset ${label.toLowerCase()}`}
            aria-label={`Reset ${label.toLowerCase()}`}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        ) : null}
        {expandable ? (
          <button
            type="button"
            className="studio-editor-style-card-caret"
            aria-expanded={open}
            aria-label={open ? `Hide ${label} options` : `Show ${label} options`}
            onClick={onToggle}
          >
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expandable && open ? (
        <div className="studio-editor-style-card-body">{children}</div>
      ) : null}
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  defaultValue,
  onValueChange,
  formatValue,
  parseInput,
}) {
  const [draft, setDraft] = useState(null);
  const span = Math.max(0.0001, Number(max) - Number(min));
  const progress = Math.min(
    100,
    Math.max(0, ((Number(value) - Number(min)) / span) * 100),
  );
  const display =
    draft != null ? draft : formatValue(Number(value));
  const isDefault =
    defaultValue != null &&
    Math.abs(Number(value) - Number(defaultValue)) <
      Math.max(Number(step) || 0.0001, 0.0001) * 0.51;

  const commitInput = (raw) => {
    const parsed = parseInput(String(raw ?? ""));
    setDraft(null);
    if (parsed == null || !Number.isFinite(parsed)) return;
    const next = Math.min(Number(max), Math.max(Number(min), parsed));
    onValueChange(next);
  };

  return (
    <div className="studio-editor-slider-row">
      <span className="studio-editor-slider-label">{label}</span>
      <div className="studio-editor-slider-row-controls">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onValueChange(Number(e.target.value))}
          className="studio-editor-range"
          style={{ "--slider-progress": `${progress}%` }}
          aria-label={typeof label === "string" ? label : undefined}
        />
        <input
          type="text"
          inputMode="decimal"
          className="studio-editor-slider-input"
          value={display}
          aria-label={typeof label === "string" ? `${label} value` : "Value"}
          onFocus={(e) => {
            setDraft(formatValue(Number(value)));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commitInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
        {defaultValue != null ? (
          <button
            type="button"
            className="studio-editor-slider-reset"
            disabled={isDefault}
            onClick={() => {
              setDraft(null);
              onValueChange(Number(defaultValue));
            }}
            title="Reset to default"
            aria-label={
              typeof label === "string" ? `Reset ${label}` : "Reset to default"
            }
          >
            <RotateCcw size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function parseNumberInput(raw, { scale = 1, suffix = "" } = {}) {
  let text = String(raw).trim().replace(",", ".");
  if (suffix) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`${escaped}\\s*$`, "i"), "");
  }
  text = text.replace(/[^\d.+-]/g, "");
  if (!text || text === "+" || text === "-" || text === ".") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return n / scale;
}

function modeAvailability({ modeId, joint, canTransition }) {
  if (modeId === "transition") {
    if (!joint && !canTransition) {
      return {
        enabled: false,
        reason: "Select adjacent clips (or a cut) to apply a transition",
      };
    }
    return { enabled: true, reason: null };
  }
  return { enabled: true, reason: null };
}

/** True when the inspector content pane should be open (not just the mode rail). */
export function inspectorPanelOpen({ editorMode, clip, joint, sidePanel }) {
  void editorMode;
  void clip;
  void joint;
  void sidePanel;
  return true;
}

function InspectorExportButton({
  busy = false,
  disabled = false,
  title,
  onClick,
}) {
  return (
    <button
      type="button"
      className="studio-editor-inspector-export"
      disabled={disabled || busy}
      title={title || (busy ? "Exporting…" : "Export")}
      onClick={onClick}
    >
      {busy ? "Exporting…" : "Export"}
    </button>
  );
}

export function EditorModeRail({
  editorMode,
  sidePanel = "inspect",
  onModeChange,
  onOpenExport,
  joint,
  canTransition = false,
}) {
  const exportActive = sidePanel === "export";
  return (
    <nav className="studio-editor-mode-stack" role="tablist" aria-label="Edit tools">
      {EDITOR_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.icon] ?? MousePointer2;
        const active = !exportActive && editorMode === mode.id;
        const { enabled, reason } = modeAvailability({
          modeId: mode.id,
          joint,
          canTransition,
        });
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={mode.label}
            aria-disabled={!enabled}
            disabled={!enabled}
            className={`studio-editor-mode-icon${active ? " is-active" : ""}${!enabled ? " is-disabled" : ""}`}
            title={enabled ? mode.label : reason}
            onClick={() => {
              if (!enabled) return;
              onModeChange(mode.id);
            }}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        );
      })}
      <button
        type="button"
        role="tab"
        aria-selected={exportActive}
        className={`studio-editor-mode-export${exportActive ? " is-active" : ""}`}
        aria-label="Export settings"
        title="Export"
        onClick={onOpenExport}
      >
        <Download size={14} aria-hidden="true" />
      </button>
    </nav>
  );
}

function ExportProgressPill({
  status,
  label,
  progress,
  onDismiss,
}) {
  const pct =
    status === "done" || status === "error"
      ? 100
      : Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div
      className={`desk-upload-pill desk-upload-pill--${status}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      title={label}
    >
      <div className="desk-upload-pill-track">
        <div
          className={`desk-upload-pill-fill${status === "uploading" && pct < 2 ? " is-indeterminate" : ""}`}
          style={status === "uploading" && pct < 2 ? undefined : { width: `${pct}%` }}
        />
        <div className="desk-upload-pill-content">
          <span className="desk-upload-pill-text">{label}</span>
          {onDismiss ? (
            <div className="desk-upload-pill-actions">
              <button
                type="button"
                className="desk-upload-pill-btn desk-upload-pill-dismiss"
                aria-label="Dismiss"
                title="Dismiss"
                onClick={onDismiss}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function exportExtension({
  exportKind,
  videoFormat,
  audioFormat,
}) {
  if (exportKind === "studio") return ".studio";
  if (exportKind === "audio") {
    return `.${String(audioFormat || "mp3").toLowerCase()}`;
  }
  return `.${String(videoFormat || "mp4").toLowerCase()}`;
}

function ExportPanel({
  project,
  exportKind,
  resolution,
  videoFormat,
  audioFormat,
  filename,
  exporting,
  exportProgress,
  exportPhase,
  exportError,
  exportResultName,
  canExportVideo,
  canExportAudio,
  canExportStudio,
  onExportKindChange,
  onResolutionChange,
  onVideoFormatChange,
  onAudioFormatChange,
  onFilenameChange,
  onExport,
  onDismissExport,
  onCloseExport,
  onUpdateProject,
}) {
  const frameRatio = normalizeFrameRatio(project.frameRatio);
  const size = exportSizeForRatioAndResolution(frameRatio, resolution);
  const projectName = project.name?.trim() || "export";
  const nameValue = exportKind === "studio" ? project.name || "" : filename;
  const namePlaceholder = projectName;
  const extension = exportExtension({ exportKind, videoFormat, audioFormat });
  const canExport =
    exportKind === "studio"
      ? canExportStudio
      : exportKind === "audio"
        ? canExportAudio
        : canExportVideo;
  const disabledReason =
    exportKind === "studio"
      ? "Save the project before exporting a .studio package"
      : exportKind === "audio"
        ? "Add a video or audio clip before exporting"
        : "Add a video or audio clip before exporting";

  return (
    <>
      <header className="studio-editor-inspector-panel-head">
        <div className="studio-editor-inspector-identity">
          {onCloseExport ? (
            <button
              type="button"
              className="studio-editor-inspector-back"
              aria-label="Back to inspector"
              title="Back"
              onClick={onCloseExport}
            >
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
          ) : (
            <InspectorThumb kind="canvas" />
          )}
          <span className="studio-editor-inspector-name">Export</span>
        </div>
        <InspectorExportButton
          busy={exporting}
          disabled={!canExport}
          title={
            exporting
              ? "Exporting…"
              : !canExport
                ? disabledReason
                : "Export"
          }
          onClick={onExport}
        />
      </header>

      <div className="studio-editor-inspector-body">
        <InspectorSection title="Filename">
          <label className="studio-editor-field-full studio-editor-export-filename">
            <span className="sr-only">Export filename</span>
            <span className="studio-editor-export-filename-row">
              <input
                type="text"
                value={nameValue}
                placeholder={namePlaceholder}
                onChange={(event) => {
                  const next = event.target.value;
                  if (exportKind === "studio") {
                    onUpdateProject?.({ name: next });
                  } else {
                    onFilenameChange(next);
                  }
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="studio-editor-export-filename-ext" aria-hidden="true">
                {extension}
              </span>
            </span>
          </label>
        </InspectorSection>

        {exporting || exportError || exportResultName ? (
          <div className="studio-editor-export-progress" aria-live="polite">
            <ExportProgressPill
              status={
                exportError ? "error" : exporting ? "uploading" : "done"
              }
              progress={exportProgress}
              label={
                exportError
                  ? exportError
                  : exporting
                    ? `${exportPhase || "Exporting…"}${
                        typeof exportProgress === "number" && exportProgress > 0
                          ? ` · ${Math.round(exportProgress)}%`
                          : ""
                      }`
                    : `Done · ${exportResultName || namePlaceholder}`
              }
              onDismiss={exporting ? undefined : onDismissExport}
            />
          </div>
        ) : null}

        <InspectorSection title="Type">
          <div className="studio-editor-chip-row studio-editor-export-chips" role="group" aria-label="Export type">
            {EXPORT_KIND_PRESETS.map((preset) => {
              const active = exportKind === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`studio-editor-chip${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  title={preset.hint}
                  onClick={() => onExportKindChange(preset.id)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </InspectorSection>

        {exportKind === "video" ? (
          <>
            <InspectorSection title="Format">
              <div className="studio-editor-chip-row studio-editor-export-chips" role="group" aria-label="Video format">
                {EXPORT_VIDEO_FORMAT_PRESETS.map((preset) => {
                  const active = videoFormat === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`studio-editor-chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => onVideoFormatChange?.(preset.id)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </InspectorSection>

            <InspectorSection
              title="Resolution"
              meta={`${size.width} × ${size.height}`}
            >
              <div className="studio-editor-chip-row studio-editor-export-chips" role="group" aria-label="Export resolution">
                {EXPORT_RESOLUTION_PRESETS.map((preset) => {
                  const active = resolution === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`studio-editor-chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      title={preset.label}
                      onClick={() => onResolutionChange(preset.id)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </InspectorSection>

            <InspectorSection title="Frame">
              <div className="studio-editor-frame-presets" role="group" aria-label="Frame ratio">
                {FRAME_RATIO_PRESETS.map((preset) => {
                  const active = frameRatio === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`studio-editor-frame-preset${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      title={`${preset.label} ${preset.shortLabel}`}
                      onClick={() => onUpdateProject?.({ frameRatio: preset.id })}
                    >
                      <span className="studio-editor-frame-preset-glyph">
                        <StudioRatioGlyph ratio={preset.id} />
                      </span>
                      <span className="studio-editor-frame-preset-label">{preset.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </InspectorSection>
          </>
        ) : null}

        {exportKind === "audio" ? (
          <InspectorSection title="Format">
            <div className="studio-editor-chip-row studio-editor-export-chips" role="group" aria-label="Audio format">
              {EXPORT_AUDIO_FORMAT_PRESETS.map((preset) => {
                const active = audioFormat === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`studio-editor-chip${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onAudioFormatChange?.(preset.id)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </InspectorSection>
        ) : null}

        {exportKind === "studio" ? (
          <InspectorSection
            title="Package"
            hint="Zip with timeline + original clip media. Anyone can unzip it."
          >
            <p className="studio-editor-export-size">
              Saves as {(nameValue.trim() || namePlaceholder)}.studio
            </p>
          </InspectorSection>
        ) : null}
      </div>
    </>
  );
}

function HeaderTypeIcon({ kind }) {
  if (kind === "video") {
    return <Play size={12} strokeWidth={2.85} aria-hidden="true" />;
  }
  if (kind === "image") return <ImageIcon size={14} aria-hidden="true" />;
  if (kind === "audio") return <Music2 size={14} aria-hidden="true" />;
  if (kind === "text") return <Type size={14} aria-hidden="true" />;
  if (kind === "transition") return <Blend size={14} aria-hidden="true" />;
  return <LayoutTemplate size={14} aria-hidden="true" />;
}

function InspectorThumb({ kind, thumbUrl }) {
  return (
    <span
      className={`studio-editor-inspector-thumb${thumbUrl ? " has-thumb" : ""}`}
      aria-hidden="true"
    >
      {thumbUrl ? (
        // Signed CDN thumbs cannot use Next's image loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" />
      ) : null}
      <span className="studio-editor-inspector-thumb-icon">
        <HeaderTypeIcon kind={kind} />
      </span>
    </span>
  );
}

function InspectorHeader({ clip, media, joint }) {
  const [resolvedThumb, setResolvedThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedThumb(null);
    if (!clip || joint) return undefined;

    const instant =
      media?.thumbnailUrl ||
      (media?.kind === "image" ? media.url : null) ||
      null;
    if (instant) {
      setResolvedThumb(instant);
      return undefined;
    }

    if (!media || media.kind === "audio" || clip.kind === "text") {
      return undefined;
    }

    void resolveClipPoster(media).then((src) => {
      if (!cancelled && src) setResolvedThumb(src);
    });

    return () => {
      cancelled = true;
    };
  }, [
    clip?.id,
    clip?.kind,
    joint,
    media?.assetId,
    media?.kind,
    media?.thumbnailUrl,
    media?.url,
    media?.proxyUrl,
  ]);

  if (joint) {
    return (
      <header className="studio-editor-inspector-panel-head">
        <div className="studio-editor-inspector-identity">
          <InspectorThumb kind="transition" />
          <span className="studio-editor-inspector-name">Transition</span>
        </div>
      </header>
    );
  }

  if (!clip) {
    return (
      <header className="studio-editor-inspector-panel-head">
        <div className="studio-editor-inspector-identity">
          <InspectorThumb kind="canvas" />
          <span className="studio-editor-inspector-name">Canvas</span>
        </div>
      </header>
    );
  }

  const kind =
    clip.kind === "text"
      ? "text"
      : media?.kind === "image"
        ? "image"
        : clip.kind === "audio"
          ? "audio"
          : "video";
  const name =
    media?.name?.trim() ||
    clip.label?.trim() ||
    (clip.kind === "text" ? "Text" : "Untitled");

  return (
    <header className="studio-editor-inspector-panel-head">
      <div className="studio-editor-inspector-identity">
        <InspectorThumb kind={kind} thumbUrl={resolvedThumb} />
        <span className="studio-editor-inspector-name" title={name}>
          {name}
        </span>
      </div>
    </header>
  );
}

export function EditorInspector({
  editorMode,
  sidePanel = "inspect",
  clip,
  media,
  jointKey,
  jointKeys = null,
  project,
  playhead,
  onUpdateClip,
  onUpdateProject,
  onSetJointTransition,
  onAddTextClip,
  exportKind = "video",
  exportResolution = DEFAULT_EXPORT_RESOLUTION,
  exportVideoFormat = "mp4",
  exportAudioFormat = "mp3",
  exportFilename = "",
  exporting = false,
  exportProgress = 0,
  exportPhase = "",
  exportError = "",
  exportResultName = "",
  canExportVideo = false,
  canExportAudio = false,
  canExportStudio = false,
  onExportKindChange,
  onExportResolutionChange,
  onExportVideoFormatChange,
  onExportAudioFormatChange,
  onExportFilenameChange,
  onExport,
  onDismissExport,
  onCloseExport,
}) {
  const joint = jointByKey(project, jointKey);
  const jointLeft = joint ? leftClipForJoint(project, joint) : null;
  const applyJointKeys =
    Array.isArray(jointKeys) && jointKeys.length > 0
      ? jointKeys
      : jointKey
        ? [jointKey]
        : [];
  const showTransition =
    applyJointKeys.length > 0 && (editorMode === "transition" || editorMode === "select");
  const multiTransitionCount = applyJointKeys.length;
  const showAudio = Boolean(clip) && (clip.kind === "audio" || clip.kind === "video");
  const showVideo = Boolean(clip) && (clip.kind === "video" || clip.kind === "image");
  /** Picture edge fades — video/image only (audio fades live in Audio panel). */
  const showFade =
    Boolean(clip) && (clip.kind === "video" || clip.kind === "image");
  const showText = editorMode === "text" || clip?.kind === "text";
  const resolution = normalizeExportResolution(exportResolution);

  if (sidePanel === "export") {
    return (
      <aside className="studio-editor-inspector">
        <div className="studio-editor-inspector-main">
          <ExportPanel
            project={project}
            exportKind={exportKind}
            resolution={resolution}
            videoFormat={exportVideoFormat}
            audioFormat={exportAudioFormat}
            filename={exportFilename}
            exporting={exporting}
            exportProgress={exportProgress}
            exportPhase={exportPhase}
            exportError={exportError}
            exportResultName={exportResultName}
            canExportVideo={canExportVideo}
            canExportAudio={canExportAudio}
            canExportStudio={canExportStudio}
            onExportKindChange={onExportKindChange}
            onResolutionChange={onExportResolutionChange}
            onVideoFormatChange={onExportVideoFormatChange}
            onAudioFormatChange={onExportAudioFormatChange}
            onFilenameChange={onExportFilenameChange}
            onExport={onExport}
            onDismissExport={onDismissExport}
            onCloseExport={onCloseExport}
            onUpdateProject={onUpdateProject}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="studio-editor-inspector">
      <div className="studio-editor-inspector-main">
        <InspectorHeader
          clip={clip}
          media={media}
          joint={joint}
        />

        <div className="studio-editor-inspector-body">
          {showTransition ? (
            <InspectorSection
              title="Transitions"
              hint={
                multiTransitionCount > 1
                  ? `Applies to ${multiTransitionCount} cuts between selected clips.`
                  : "Applied between adjacent clips in preview and export."
              }
            >
              <div className="studio-editor-transition-list">
                {TRANSITION_LIBRARY.map((template) => {
                  const current = jointLeft?.transitionOut?.type ?? "none";
                  const active = current === template.id;
                  return (
                    <TransitionRow
                      key={template.id}
                      template={template}
                      active={active}
                      disabled={!applyJointKeys.length}
                      onClick={() => {
                        if (!applyJointKeys.length) return;
                        onSetJointTransition(
                          applyJointKeys[0],
                          template.id === "none"
                            ? undefined
                            : { type: template.id, duration: template.duration },
                        );
                      }}
                    />
                  );
                })}
              </div>
              {jointLeft?.transitionOut?.type && jointLeft.transitionOut.type !== "none" ? (
                <SliderRow
                  label="Duration"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={jointLeft.transitionOut.duration}
                  defaultValue={
                    TRANSITION_LIBRARY.find(
                      (t) => t.id === jointLeft.transitionOut?.type,
                    )?.duration || 0.5
                  }
                  formatValue={(v) => `${Number(v).toFixed(2)}s`}
                  parseInput={(raw) => parseNumberInput(raw, { suffix: "s" })}
                  onValueChange={(next) => {
                    const duration = next || 0.5;
                    const type = jointLeft.transitionOut!.type;
                    for (const key of applyJointKeys) {
                      const leftId = key.split("::")[0];
                      if (!leftId) continue;
                      onUpdateClip(leftId, {
                        transitionOut: { type, duration },
                      });
                    }
                  }}
                />
              ) : null}
            </InspectorSection>
          ) : null}

          {showFade && clip ? (
            <FadePanel clip={clip} onUpdateClip={onUpdateClip} />
          ) : null}

          {showAudio && clip ? (
            <AudioPanel
              clip={clip}
              folderId={project.folderId}
              onUpdateClip={onUpdateClip}
            />
          ) : null}

          {showVideo && clip ? <TransformPanel clip={clip} onUpdateClip={onUpdateClip} /> : null}

          {showText ? (
            <TextPanel
              clip={clip?.kind === "text" ? clip : null}
              playhead={playhead}
              onUpdateClip={onUpdateClip}
              onAddTextClip={onAddTextClip}
            />
          ) : null}

          {clip ? (
            <ClipTimingCard clip={clip} project={project} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function formatSec(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

function ClipTimingCard({ clip, project }) {
  const start = Math.max(0, clip.startTime ?? 0);
  const length = clipDuration(clip);
  const end = start + length;
  const span = Math.max(timelineViewDuration(project), end, 0.01);
  const leftPct = Math.min(100, (start / span) * 100);
  const widthPct = Math.min(100 - leftPct, Math.max(1.5, (length / span) * 100));
  const hasOut =
    Boolean(clip.transitionOut?.type) && clip.transitionOut.type !== "none";
  const outLabel = hasOut ? transitionLabel(clip.transitionOut.type) : null;
  const pictureFade = clampAudioFadePair(
    clip.effects?.fadeIn ?? 0,
    clip.effects?.fadeOut ?? 0,
    length,
  );
  const audioFade = resolveAudioFadePair(clip.effects, length, clip.kind);
  const hasPictureFade = pictureFade.fadeIn > 0.01 || pictureFade.fadeOut > 0.01;
  const hasAudioFade = audioFade.fadeIn > 0.01 || audioFade.fadeOut > 0.01;

  return (
    <InspectorSection title="Timing">
      <div className="studio-editor-timing">
        <div
          className="studio-editor-timing-ruler"
          role="img"
          aria-label={`Clip from ${formatSec(start)} to ${formatSec(end)} seconds on a ${formatSec(span)} second timeline`}
        >
          <div className="studio-editor-timing-ruler-track">
            <div
              className="studio-editor-timing-ruler-range"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          </div>
          <div className="studio-editor-timing-ruler-ends">
            <span>0s</span>
            <span>{formatSec(span)}s</span>
          </div>
        </div>

        <div className="studio-editor-timing-metrics" role="list">
          <div className="studio-editor-timing-metric" role="listitem">
            <span className="studio-editor-timing-metric-label">In</span>
            <span className="studio-editor-timing-metric-value">{formatSec(start)}s</span>
          </div>
          <div className="studio-editor-timing-metric" role="listitem">
            <span className="studio-editor-timing-metric-label">Length</span>
            <span className="studio-editor-timing-metric-value">{formatSec(length)}s</span>
          </div>
          <div className="studio-editor-timing-metric" role="listitem">
            <span className="studio-editor-timing-metric-label">Out</span>
            <span className="studio-editor-timing-metric-value">{formatSec(end)}s</span>
          </div>
        </div>

        {hasPictureFade || hasAudioFade || hasOut ? (
          <div className="studio-editor-timing-chip-row">
            {hasPictureFade ? (
              <span className="studio-editor-timing-chip">
                Picture fade
                {pictureFade.fadeIn > 0.01
                  ? ` in ${Number(pictureFade.fadeIn).toFixed(2)}s`
                  : ""}
                {pictureFade.fadeOut > 0.01
                  ? ` out ${Number(pictureFade.fadeOut).toFixed(2)}s`
                  : ""}
              </span>
            ) : null}
            {hasAudioFade ? (
              <span className="studio-editor-timing-chip">
                Audio fade
                {audioFade.fadeIn > 0.01
                  ? ` in ${Number(audioFade.fadeIn).toFixed(2)}s`
                  : ""}
                {audioFade.fadeOut > 0.01
                  ? ` out ${Number(audioFade.fadeOut).toFixed(2)}s`
                  : ""}
              </span>
            ) : null}
            {hasOut ? (
              <span className="studio-editor-timing-chip">
                Transition · {outLabel}
                {clip.transitionOut?.duration
                  ? ` · ${Number(clip.transitionOut.duration).toFixed(2)}s`
                  : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </InspectorSection>
  );
}

function TransformPanel({ clip, onUpdateClip }) {
  const [transformOpen, setTransformOpen] = useState(true);
  const [opacityOpen, setOpacityOpen] = useState(true);
  const effects = clip.effects ?? {};
  const transform = normalizeClipTransform(effects);
  const opacity = clampClipOpacity(effects.opacity);
  const patchTransform = (next) => {
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        scale: Number(next.scale.toFixed(3)),
        x: Number(next.x.toFixed(3)),
        y: Number(next.y.toFixed(3)),
        rotation: Number(next.rotation.toFixed(1)),
      },
    });
  };
  const patchOpacity = (next) => {
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        opacity: Number(clampClipOpacity(next).toFixed(3)),
      },
    });
  };

  return (
    <InspectorSection title="Appearance">
      <div className="studio-editor-style-stack">
        <StyleAccordion
          label="Transform"
          open={transformOpen}
          onToggle={() => setTransformOpen((v) => !v)}
          onReset={() => patchTransform({ scale: 1, x: 0, y: 0, rotation: 0 })}
          summary={
            <div className="studio-editor-style-card-toggle-row">
              <span>Transform</span>
              <span className="studio-editor-style-card-meta">
                {Math.round(transform.scale * 100)}% · {Math.round(transform.rotation)}°
              </span>
            </div>
          }
        >
          <SliderRow
            label="Size"
            min={CLIP_TRANSFORM_LIMITS.scaleMin}
            max={CLIP_TRANSFORM_LIMITS.scaleMax}
            step={0.01}
            value={transform.scale}
            defaultValue={1}
            formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
            parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
            onValueChange={(next) => patchTransform({ ...transform, scale: next })}
          />
          <SliderRow
            label="Position X"
            min={CLIP_TRANSFORM_LIMITS.panMin}
            max={CLIP_TRANSFORM_LIMITS.panMax}
            step={0.01}
            value={transform.x}
            defaultValue={0}
            formatValue={(v) => Number(v).toFixed(2)}
            parseInput={(raw) => parseNumberInput(raw)}
            onValueChange={(next) => patchTransform({ ...transform, x: next })}
          />
          <SliderRow
            label="Position Y"
            min={CLIP_TRANSFORM_LIMITS.panMin}
            max={CLIP_TRANSFORM_LIMITS.panMax}
            step={0.01}
            value={transform.y}
            defaultValue={0}
            formatValue={(v) => Number(v).toFixed(2)}
            parseInput={(raw) => parseNumberInput(raw)}
            onValueChange={(next) => patchTransform({ ...transform, y: next })}
          />
          <SliderRow
            label="Rotation"
            min={0}
            max={359}
            step={1}
            value={transform.rotation}
            defaultValue={0}
            formatValue={(v) => `${Math.round(Number(v))}°`}
            parseInput={(raw) => parseNumberInput(raw, { suffix: "°" })}
            onValueChange={(next) => patchTransform({ ...transform, rotation: next })}
          />
        </StyleAccordion>
        <StyleAccordion
          label="Opacity"
          open={opacityOpen}
          onToggle={() => setOpacityOpen((v) => !v)}
          onReset={() => patchOpacity(1)}
          summary={
            <div className="studio-editor-style-card-toggle-row">
              <span>Opacity</span>
              <span className="studio-editor-style-card-meta">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          }
        >
          <SliderRow
            label="Opacity"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            defaultValue={1}
            formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
            parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
            onValueChange={patchOpacity}
          />
        </StyleAccordion>
      </div>
    </InspectorSection>
  );
}

const SPEED_PRESETS = [0.75, 1, 1.1, 1.25, 1.5, 2];

function FadeLengthControls({
  fadeIn,
  fadeOut,
  fadeInMax,
  fadeOutMax,
  fadeStep,
  inLabel,
  outLabel,
  onFadeIn,
  onFadeOut,
}) {
  const presetActive = (side, seconds) => {
    const current = side === "in" ? fadeIn : fadeOut;
    return Math.abs(current - seconds) < 0.02;
  };

  return (
    <>
      <SliderRow
        label={inLabel}
        min={0}
        max={Math.max(0.05, fadeInMax)}
        step={fadeStep}
        value={fadeIn}
        defaultValue={0}
        formatValue={(v) => `${Number(v).toFixed(2)}s`}
        parseInput={(raw) => parseNumberInput(raw, { suffix: "s" })}
        onValueChange={onFadeIn}
      />
      <div className="studio-editor-chip-row" role="group" aria-label={`${inLabel} length`}>
        {FADE_LENGTH_PRESETS.filter((sec) => sec <= fadeInMax + 0.001).map((sec) => (
          <button
            key={`in-${sec}`}
            type="button"
            className={`studio-editor-chip${presetActive("in", sec) ? " is-active" : ""}`}
            onClick={() => onFadeIn(sec)}
          >
            {sec === 0 ? "Off" : `${sec}s`}
          </button>
        ))}
      </div>
      <SliderRow
        label={outLabel}
        min={0}
        max={Math.max(0.05, fadeOutMax)}
        step={fadeStep}
        value={fadeOut}
        defaultValue={0}
        formatValue={(v) => `${Number(v).toFixed(2)}s`}
        parseInput={(raw) => parseNumberInput(raw, { suffix: "s" })}
        onValueChange={onFadeOut}
      />
      <div className="studio-editor-chip-row" role="group" aria-label={`${outLabel} length`}>
        {FADE_LENGTH_PRESETS.filter((sec) => sec <= fadeOutMax + 0.001).map((sec) => (
          <button
            key={`out-${sec}`}
            type="button"
            className={`studio-editor-chip${presetActive("out", sec) ? " is-active" : ""}`}
            onClick={() => onFadeOut(sec)}
          >
            {sec === 0 ? "Off" : `${sec}s`}
          </button>
        ))}
      </div>
    </>
  );
}

function FadePanel({ clip, onUpdateClip }) {
  const [open, setOpen] = useState(true);
  const effects = clip.effects ?? {};
  const duration = clipDuration(clip);
  const { fadeIn, fadeOut } = clampAudioFadePair(
    effects.fadeIn ?? 0,
    effects.fadeOut ?? 0,
    duration,
  );
  const fadeInMax = Math.max(0, duration - fadeOut);
  const fadeOutMax = Math.max(0, duration - fadeIn);
  const fadeStep = Math.min(0.05, Math.max(0.05, duration));
  const fadeMeta =
    fadeIn <= 0.001 && fadeOut <= 0.001
      ? "Off"
      : `${fadeIn.toFixed(2)}s · ${fadeOut.toFixed(2)}s`;

  const patchEffects = (next) => {
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        ...next,
      },
    });
  };

  return (
    <InspectorSection title="Fade">
      <div className="studio-editor-style-stack">
        <StyleAccordion
          label="Picture fade"
          open={open}
          onToggle={() => setOpen((v) => !v)}
          onReset={() => patchEffects({ fadeIn: 0, fadeOut: 0 })}
          summary={
            <div className="studio-editor-style-card-toggle-row">
              <span>Picture fade</span>
              <span className="studio-editor-style-card-meta">{fadeMeta}</span>
            </div>
          }
        >
          <FadeLengthControls
            fadeIn={fadeIn}
            fadeOut={fadeOut}
            fadeInMax={fadeInMax}
            fadeOutMax={fadeOutMax}
            fadeStep={fadeStep}
            inLabel="Fade in"
            outLabel="Fade out"
            onFadeIn={(next) =>
              patchEffects({ fadeIn: clampAudioFadeSec(next, duration, fadeOut) })
            }
            onFadeOut={(next) =>
              patchEffects({ fadeOut: clampAudioFadeSec(next, duration, fadeIn) })
            }
          />
        </StyleAccordion>
      </div>
    </InspectorSection>
  );
}

function AudioPanel({ clip, folderId, onUpdateClip }) {
  const processClipSpeed = useAction(api.videoEditActions.processClipSpeed);
  const [playbackOpen, setPlaybackOpen] = useState(true);
  const [fadeOpen, setFadeOpen] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState(null);
  const effects = clip.effects ?? {};
  const volume = clampClipVolume(effects.volume ?? CLIP_VOLUME_DEFAULT);
  const speed = clipSpeed(effects);
  const duration = clipDuration(clip);
  const pendingDuration = pendingSpeedDurationSec(clip, speed);
  const needsProcess = !isIdentitySpeed(speed) && Boolean(clip.assetId);
  const { fadeIn: audioFadeIn, fadeOut: audioFadeOut } = resolveAudioFadePair(
    effects,
    duration,
    clip.kind,
  );
  const audioFadeInMax = Math.max(0, duration - audioFadeOut);
  const audioFadeOutMax = Math.max(0, duration - audioFadeIn);
  const fadeStep = Math.min(0.05, Math.max(0.05, duration));
  const audioFadeMeta =
    audioFadeIn <= 0.001 && audioFadeOut <= 0.001
      ? "Off"
      : `${audioFadeIn.toFixed(2)}s · ${audioFadeOut.toFixed(2)}s`;

  const patchEffects = (next) => {
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        ...next,
      },
    });
  };

  const setSpeed = (raw) => {
    // Draft only — preview stays 1× until Process bakes a new asset.
    setProcessError(null);
    patchEffects({ speed: clampClipSpeed(raw) });
  };

  const onProcessSpeed = async () => {
    if (!clip.assetId || !folderId || !needsProcess || processing) return;
    setProcessing(true);
    setProcessError(null);
    try {
      const result = await processClipSpeed({
        assetId: clip.assetId as Id<"assets">,
        folderId: folderId as Id<"folders">,
        trimIn: clip.trimIn,
        trimOut: clip.trimOut,
        speed,
        mode: clip.kind === "audio" ? "audio" : "video",
      });
      const pictureFades = clampAudioFadePair(
        effects.fadeIn ?? 0,
        effects.fadeOut ?? 0,
        result.durationSec,
      );
      const audioFades = resolveAudioFadePair(effects, result.durationSec, clip.kind);
      onUpdateClip(clip.id, {
        assetId: result.assetId,
        trimIn: 0,
        trimOut: result.durationSec,
        sourceDuration: result.durationSec,
        effects: {
          ...effects,
          speed: 1,
          fadeIn: pictureFades.fadeIn,
          fadeOut: pictureFades.fadeOut,
          audioFadeIn: audioFades.fadeIn,
          audioFadeOut: audioFades.fadeOut,
        },
      });
    } catch (reason) {
      setProcessError(
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setProcessing(false);
    }
  };

  const resetAudio = () =>
    patchEffects({
      volume: CLIP_VOLUME_DEFAULT,
      speed: 1,
      audioFadeIn: 0,
      audioFadeOut: 0,
    });

  return (
    <InspectorSection title="Audio" onReset={resetAudio}>
      <div className="studio-editor-style-stack">
        <StyleAccordion
          label="Playback"
          open={playbackOpen}
          onToggle={() => setPlaybackOpen((v) => !v)}
          summary={
            <div className="studio-editor-style-card-toggle-row">
              <span>Playback</span>
              <span className="studio-editor-style-card-meta">
                {speed.toFixed(2)}× · {Math.round(volume * 100)}%
              </span>
            </div>
          }
        >
          <SliderRow
            label={
              <>
                <Gauge size={14} aria-hidden="true" /> Speed
              </>
            }
            min={CLIP_SPEED_MIN}
            max={CLIP_SPEED_MAX}
            step={0.05}
            value={speed}
            defaultValue={1}
            formatValue={(v) => `${Number(v).toFixed(2)}×`}
            parseInput={(raw) => {
              const n = parseNumberInput(String(raw).replace(/×/g, ""), {});
              return n == null ? null : clampClipSpeed(n);
            }}
            onValueChange={(next) => setSpeed(next)}
          />
          <div className="studio-editor-chip-row" role="group" aria-label="Speed presets">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`studio-editor-chip${Math.abs(speed - preset) < 0.001 ? " is-active" : ""}`}
                onClick={() => setSpeed(preset)}
                disabled={processing}
              >
                {preset === 1 ? "1×" : `${preset}×`}
              </button>
            ))}
          </div>
          {needsProcess ? (
            <div className="studio-editor-speed-process">
              <p className="studio-editor-speed-process-hint">
                Draft {speed.toFixed(2)}× → about {pendingDuration.toFixed(1)}s after Process.
                Preview stays normal until then.
              </p>
              <button
                type="button"
                className="studio-editor-primary-btn"
                disabled={processing || !clip.assetId}
                onClick={() => void onProcessSpeed()}
              >
                {processing ? "Processing…" : "Process speed"}
              </button>
              {processError ? (
                <p className="studio-editor-speed-process-error" role="alert">
                  {processError}
                </p>
              ) : null}
            </div>
          ) : null}
          <SliderRow
            label={
              <>
                <Volume2 size={14} aria-hidden="true" /> Volume
              </>
            }
            min={0}
            max={CLIP_VOLUME_MAX}
            step={0.05}
            value={volume}
            defaultValue={CLIP_VOLUME_DEFAULT}
            formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
            parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
            onValueChange={(next) => patchEffects({ volume: clampClipVolume(next) })}
          />
        </StyleAccordion>
        <StyleAccordion
          label="Audio fade"
          open={fadeOpen}
          onToggle={() => setFadeOpen((v) => !v)}
          onReset={() => patchEffects({ audioFadeIn: 0, audioFadeOut: 0 })}
          summary={
            <div className="studio-editor-style-card-toggle-row">
              <span>Audio fade</span>
              <span className="studio-editor-style-card-meta">{audioFadeMeta}</span>
            </div>
          }
        >
          <FadeLengthControls
            fadeIn={audioFadeIn}
            fadeOut={audioFadeOut}
            fadeInMax={audioFadeInMax}
            fadeOutMax={audioFadeOutMax}
            fadeStep={fadeStep}
            inLabel="Fade in"
            outLabel="Fade out"
            onFadeIn={(next) =>
              patchEffects({
                audioFadeIn: clampAudioFadeSec(next, duration, audioFadeOut),
              })
            }
            onFadeOut={(next) =>
              patchEffects({
                audioFadeOut: clampAudioFadeSec(next, duration, audioFadeIn),
              })
            }
          />
        </StyleAccordion>
      </div>
    </InspectorSection>
  );
}

function TextPresetCard({ preset, active, onApply, onDelete }) {
  useEffect(() => {
    const family = preset.style.fontFamily;
    if (family && family !== "system") void loadGoogleFont(family);
  }, [preset.style.fontFamily]);

  return (
    <button
      type="button"
      className={`studio-editor-text-preset-card${active ? " is-active" : ""}`}
      title={`Apply ${preset.name}`}
      aria-pressed={active}
      onClick={() => onApply(preset)}
      onMouseEnter={() => {
        const family = preset.style.fontFamily;
        if (family && family !== "system") void loadGoogleFont(family);
      }}
    >
      <span className="studio-editor-text-preset-card-stage" aria-hidden="true">
        <span
          className="studio-editor-text-preset-card-sample"
          style={presetPreviewStyle(preset.style)}
        >
          {preset.sample}
        </span>
      </span>
      <span className="studio-editor-text-preset-card-foot">
        <span className="studio-editor-text-preset-card-meta">
          <span className="studio-editor-text-preset-card-name">{preset.name}</span>
          {presetEffectLabels(preset.style).length ? (
            <span className="studio-editor-text-preset-card-fx">
              {presetEffectLabels(preset.style).join(" · ")}
            </span>
          ) : null}
        </span>
        {onDelete ? (
          <span
            role="button"
            tabIndex={0}
            className="studio-editor-text-preset-card-delete"
            title="Delete preset"
            aria-label={`Delete ${preset.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(preset.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onDelete(preset.id);
              }
            }}
          >
            <Trash2 size={12} aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TextPanel({ clip, playhead, onUpdateClip, onAddTextClip }) {
  const [textTab, setTextTab] = useState(() => (clip ? "edit" : "presets"));
  const [presetCategory, setPresetCategory] = useState("all");
  const [customPresets, setCustomPresets] = useState(() => loadCustomTextPresets());
  const [alignOpen, setAlignOpen] = useState(false);
  const [spacingOpen, setSpacingOpen] = useState(false);
  const [strokeOpen, setStrokeOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [glowOpen, setGlowOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState({
    opacity: false,
    transform: false,
    motion: false,
  });
  const [motionSide, setMotionSide] = useState("in");
  const toggleSection = (key) =>
    setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const tabs = (
    <div className="studio-editor-text-tabs" role="tablist" aria-label="Text tools">
      <button
        type="button"
        role="tab"
        aria-selected={textTab === "edit"}
        className={`studio-editor-text-tab${textTab === "edit" ? " is-active" : ""}`}
        onClick={() => setTextTab("edit")}
      >
        <Type size={13} aria-hidden="true" />
        Edit
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={textTab === "presets"}
        className={`studio-editor-text-tab${textTab === "presets" ? " is-active" : ""}`}
        onClick={() => setTextTab("presets")}
      >
        <LayoutTemplate size={13} aria-hidden="true" />
        Preset library
      </button>
    </div>
  );

  const text = clip?.text ?? { text: "" };
  const effects = clip?.effects ?? {};
  const pose = normalizeTextTransform(effects);

  const patchText = (next) => {
    if (!clip) return;
    const merged = { ...text, ...next };
    if (merged.fontSize != null) {
      const n = Number(merged.fontSize);
      merged.fontSize = Number.isFinite(n)
        ? Math.max(12, Math.min(200, Math.round(n)))
        : 42;
    }
    onUpdateClip(clip.id, {
      text: merged,
      label: (next.text ?? text.text)?.slice(0, 28) || clip.label,
    });
  };

  const patchPose = (next) => {
    if (!clip) return;
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        scale: Number(next.scale.toFixed(3)),
        x: Number(next.x.toFixed(3)),
        y: Number(next.y.toFixed(3)),
        rotation: Number(next.rotation.toFixed(1)),
      },
    });
  };

  const applyPreset = (preset) => {
    const family = preset.style.fontFamily;
    if (family && family !== "system") void loadGoogleFont(family);
    const base = clip?.text ?? { ...DEFAULT_TEXT_STYLE, text: preset.sample };
    const merged = applyTextStylePreset(
      { ...base, text: clip?.text?.text?.trim() ? base.text : preset.sample },
      preset.style,
    );
    if (!clip) {
      onAddTextClip({ text: merged });
      return;
    }
    onUpdateClip(clip.id, {
      text: merged,
      label: (merged.text ?? text.text)?.slice(0, 28) || clip.label,
    });
    if ((preset.style.strokeWidth ?? 0) > 0) setStrokeOpen(true);
    if (preset.style.backgroundColor) setBgOpen(true);
    if (preset.style.shadowColor) setShadowOpen(true);
    if (preset.style.glow) setGlowOpen(true);
  };

  const saveCurrentPreset = () => {
    if (!clip) return;
    const sample = (text.text || "Aa").trim().slice(0, 12) || "Aa";
    const preset = {
      id: `custom-${Date.now().toString(36)}`,
      name: sample.length > 18 ? `${sample.slice(0, 16)}…` : sample,
      category: "pop",
      sample,
      style: textStyleSnapshot(text),
    };
    const next = [preset, ...customPresets].slice(0, 40);
    setCustomPresets(next);
    saveCustomTextPresets(next);
    setPresetCategory("mine");
  };

  const deleteCustomPreset = (id) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    saveCustomTextPresets(next);
  };

  const caseCycle = ["none", "upper", "lower", "title"];
  const caseLabel = {
    none: "As typed",
    upper: "UPPERCASE",
    lower: "lowercase",
    title: "Title Case",
  };
  const currentCase = text.textCase ?? "none";

  const AlignHIcon =
    text.align === "right" ? AlignRight : text.align === "left" ? AlignLeft : AlignCenter;
  const VAlignIcon =
    text.verticalAlign === "top"
      ? AlignVerticalJustifyStart
      : text.verticalAlign === "bottom"
        ? AlignVerticalJustifyEnd
        : AlignVerticalJustifyCenter;

  const library =
    presetCategory === "mine"
      ? customPresets
      : presetCategory === "all"
        ? BUILTIN_TEXT_PRESETS
        : BUILTIN_TEXT_PRESETS.filter((p) => p.category === presetCategory);

  if (textTab === "presets") {
    return (
      <div className="studio-editor-text-section">
        {tabs}
        <InspectorSection
          title="Preset library"
          hint={
            clip
              ? "Tap a look to apply. Your wording stays; style updates."
              : "Browse freely — tap a look to add text with that style."
          }
        >
          <div className="studio-editor-text-preset-toolbar">
            <button
              type="button"
              className="studio-editor-text-chip"
              onClick={saveCurrentPreset}
              disabled={!clip}
              title={
                clip
                  ? "Save the current text style as a preset"
                  : "Select text to save a custom preset"
              }
            >
              <Sparkles size={14} aria-hidden="true" />
              Save current
            </button>
          </div>
          <div className="studio-editor-text-preset-cats" role="tablist" aria-label="Preset categories">
            {TEXT_PRESET_CATEGORIES.map((cat) => {
              const active = presetCategory === cat.id;
              const count =
                cat.id === "mine"
                  ? customPresets.length
                  : cat.id === "all"
                    ? BUILTIN_TEXT_PRESETS.length
                    : BUILTIN_TEXT_PRESETS.filter((p) => p.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`studio-editor-text-preset-cat${active ? " is-active" : ""}`}
                  onClick={() => setPresetCategory(cat.id)}
                >
                  {cat.label}
                  <span className="studio-editor-text-preset-cat-count">{count}</span>
                </button>
              );
            })}
          </div>
          {library.length === 0 ? (
            <p className="studio-editor-inspector-hint">
              {presetCategory === "mine"
                ? "No saved presets yet. Style text on Edit, then Save current."
                : "No presets in this category."}
            </p>
          ) : (
            <div className="studio-editor-text-preset-grid">
              {library.map((preset) => (
                <TextPresetCard
                  key={preset.id}
                  preset={preset}
                  active={textStyleMatchesPreset(text, preset.style)}
                  onApply={applyPreset}
                  onDelete={
                    String(preset.id).startsWith("custom-")
                      ? deleteCustomPreset
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </InspectorSection>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="studio-editor-text-section">
        {tabs}
        <InspectorSection title="Text">
          <button type="button" className="studio-editor-primary-btn" onClick={() => onAddTextClip()}>
            <Type size={ICON} aria-hidden="true" />
            Add text at {playhead.toFixed(1)}s
          </button>
          <p className="studio-editor-inspector-hint">
            Or open Presets to pick a look — it adds text for you.
          </p>
        </InspectorSection>
      </div>
    );
  }

  return (
    <div className="studio-editor-text-section">
      {tabs}
      <InspectorSection title="Content">
        <label className="studio-editor-field-full">
          Text
          <textarea
            className="studio-editor-textarea"
            rows={3}
            placeholder="Add heading"
            value={text.text ?? ""}
            onChange={(e) => patchText({ text: e.target.value })}
          />
        </label>
      </InspectorSection>

      <InspectorSection title="Type">
        <div className="studio-editor-font-size-row">
          <GoogleFontSelect
            value={text.fontFamily ?? "system"}
            onChange={(fontFamily) => patchText({ fontFamily })}
          />
          <label className="studio-editor-font-size">
            <span className="sr-only">Size</span>
            <input
              type="number"
              min={12}
              max={200}
              step={1}
              value={text.fontSize ?? 42}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return;
                patchText({ fontSize: Number(raw) || 42 });
              }}
              onBlur={(e) => {
                const n = Number(e.target.value);
                patchText({ fontSize: Number.isFinite(n) ? n : 42 });
              }}
            />
          </label>
        </div>
        <SliderRow
          label="Size"
          min={12}
          max={200}
          step={1}
          value={text.fontSize ?? 42}
          defaultValue={42}
          formatValue={(v) => `${Math.round(Number(v))}px`}
          parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
          onValueChange={(next) => patchText({ fontSize: next })}
        />

        <div className="studio-editor-text-toolbar">
          <button
            type="button"
            className={`studio-editor-text-tool${text.bold ? " is-active" : ""}`}
            onClick={() => patchText({ bold: !text.bold })}
            aria-pressed={Boolean(text.bold)}
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={`studio-editor-text-tool${text.italic ? " is-active" : ""}`}
            onClick={() => patchText({ italic: !text.italic })}
            aria-pressed={Boolean(text.italic)}
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            className={`studio-editor-text-tool${text.underline ? " is-active" : ""}`}
            onClick={() => patchText({ underline: !text.underline })}
            aria-pressed={Boolean(text.underline)}
            title="Underline"
          >
            <Underline size={14} />
          </button>
          <span className="studio-editor-text-tool-sep" aria-hidden="true" />
          <div className="studio-editor-text-tool-wrap">
            <button
              type="button"
              className={`studio-editor-text-tool${alignOpen ? " is-active" : ""}`}
              onClick={() => {
                setAlignOpen((v) => !v);
                setSpacingOpen(false);
              }}
              aria-expanded={alignOpen}
              title="Alignment"
            >
              <AlignHIcon size={14} />
            </button>
            {alignOpen ? (
              <div className="studio-editor-align-popover" role="menu">
                <button type="button" className={(text.align ?? "center") === "left" ? "is-active" : ""} onClick={() => patchText({ align: "left" })} title="Left"><AlignLeft size={14} /></button>
                <button type="button" className={(text.align ?? "center") === "center" ? "is-active" : ""} onClick={() => patchText({ align: "center" })} title="Center"><AlignCenter size={14} /></button>
                <button type="button" className={(text.align ?? "center") === "right" ? "is-active" : ""} onClick={() => patchText({ align: "right" })} title="Right"><AlignRight size={14} /></button>
                <button type="button" disabled title="Justify"><AlignJustify size={14} /></button>
                <button type="button" className={(text.verticalAlign ?? "middle") === "top" ? "is-active" : ""} onClick={() => patchText({ verticalAlign: "top" })} title="Top"><AlignVerticalJustifyStart size={14} /></button>
                <button type="button" className={(text.verticalAlign ?? "middle") === "middle" ? "is-active" : ""} onClick={() => patchText({ verticalAlign: "middle" })} title="Middle"><VAlignIcon size={14} /></button>
                <button type="button" className={(text.verticalAlign ?? "middle") === "bottom" ? "is-active" : ""} onClick={() => patchText({ verticalAlign: "bottom" })} title="Bottom"><AlignVerticalJustifyEnd size={14} /></button>
                <button type="button" disabled title="Distribute"><AlignVerticalDistributeCenter size={14} /></button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`studio-editor-text-tool${currentCase !== "none" ? " is-active" : ""}`}
            onClick={() => {
              const idx = caseCycle.indexOf(currentCase);
              patchText({ textCase: caseCycle[(idx + 1) % caseCycle.length] });
            }}
            title={`Case · ${caseLabel[currentCase]}`}
          >
            <CaseSensitive size={14} />
          </button>
          <div className="studio-editor-text-tool-wrap">
            <button
              type="button"
              className={`studio-editor-text-tool${spacingOpen ? " is-active" : ""}`}
              onClick={() => {
                setSpacingOpen((v) => !v);
                setAlignOpen(false);
              }}
              aria-expanded={spacingOpen}
              title="Spacing"
            >
              <AlignVerticalDistributeCenter size={14} />
            </button>
            {spacingOpen ? (
              <div className="studio-editor-spacing-popover">
                <SliderRow
                  label="Letter"
                  min={-0.1}
                  max={0.5}
                  step={0.01}
                  value={text.letterSpacing ?? 0}
                  defaultValue={0}
                  formatValue={(v) => Number(v).toFixed(2)}
                  parseInput={(raw) => parseNumberInput(raw)}
                  onValueChange={(next) => patchText({ letterSpacing: next })}
                />
                <SliderRow
                  label="Line"
                  min={0.8}
                  max={2.4}
                  step={0.05}
                  value={text.lineHeight ?? 1.2}
                  defaultValue={1.2}
                  formatValue={(v) => Number(v).toFixed(2)}
                  parseInput={(raw) => parseNumberInput(raw)}
                  onValueChange={(next) => patchText({ lineHeight: next })}
                />
              </div>
            ) : null}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        title="Style"
        onReset={() =>
          patchText({
            color: "#ffffff",
            strokeColor: "#000000",
            strokeWidth: 0,
            backgroundColor: null,
            backgroundPadding: 8,
            backgroundRadius: 0,
            shadowColor: null,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
          })
        }
      >
        <div className="studio-editor-style-stack">
          <StyleAccordion
            label="Fill"
            expandable={false}
            open={false}
            onToggle={() => {}}
            summary={
              <StudioColorPicker
                label="Fill"
                value={text.color ?? "#ffffff"}
                allowNone={false}
                onChange={(color) => patchText({ color: color ?? "#ffffff" })}
              />
            }
          />

          <StyleAccordion
            label="Stroke"
            open={strokeOpen}
            onToggle={() => setStrokeOpen((v) => !v)}
            summary={
              <StudioColorPicker
                label="Stroke"
                value={(text.strokeWidth ?? 0) > 0 ? text.strokeColor : null}
                allowNone
                onChange={(strokeColor) => {
                  if (strokeColor == null) {
                    patchText({ strokeWidth: 0 });
                    setStrokeOpen(false);
                  } else {
                    patchText({
                      strokeColor,
                      strokeWidth: Math.max(1, text.strokeWidth ?? 2),
                    });
                    setStrokeOpen(true);
                  }
                }}
              />
            }
          >
            <SliderRow
              label="Width"
              min={0}
              max={24}
              step={1}
              value={text.strokeWidth ?? 0}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => {
                patchText({ strokeWidth: next });
                if (next > 0) setStrokeOpen(true);
              }}
            />
          </StyleAccordion>

          <StyleAccordion
            label="Background"
            open={bgOpen}
            onToggle={() => setBgOpen((v) => !v)}
            summary={
              <StudioColorPicker
                label="Background"
                value={text.backgroundColor}
                allowNone
                onChange={(backgroundColor) => {
                  patchText({ backgroundColor });
                  setBgOpen(Boolean(backgroundColor));
                }}
              />
            }
          >
            <SliderRow
              label="Padding"
              min={0}
              max={48}
              step={1}
              value={text.backgroundPadding ?? 8}
              defaultValue={8}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ backgroundPadding: next })}
            />
            <SliderRow
              label="Rounding"
              min={0}
              max={80}
              step={1}
              value={text.backgroundRadius ?? 0}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ backgroundRadius: next })}
            />
          </StyleAccordion>

          <StyleAccordion
            label="Shadow"
            open={shadowOpen}
            onToggle={() => setShadowOpen((v) => !v)}
            summary={
              <StudioColorPicker
                label="Shadow"
                value={text.shadowColor}
                allowNone
                onChange={(shadowColor) => {
                  if (shadowColor == null) {
                    patchText({
                      shadowColor: null,
                      shadowBlur: 0,
                      shadowOffsetX: 0,
                      shadowOffsetY: 0,
                    });
                    setShadowOpen(false);
                  } else {
                    patchText({
                      shadowColor,
                      shadowBlur: Math.max(2, text.shadowBlur ?? 6),
                      shadowOffsetY: text.shadowOffsetY ?? 2,
                    });
                    setShadowOpen(true);
                  }
                }}
              />
            }
          >
            <SliderRow
              label="Blur"
              min={0}
              max={40}
              step={1}
              value={text.shadowBlur ?? 0}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ shadowBlur: next })}
            />
            <SliderRow
              label="Offset X"
              min={-40}
              max={40}
              step={1}
              value={text.shadowOffsetX ?? 0}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ shadowOffsetX: next })}
            />
            <SliderRow
              label="Offset Y"
              min={-40}
              max={40}
              step={1}
              value={text.shadowOffsetY ?? 0}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ shadowOffsetY: next })}
            />
          </StyleAccordion>

          <StyleAccordion
            label="Glow"
            open={glowOpen}
            onToggle={() => setGlowOpen((v) => !v)}
            summary={
              <label className="studio-editor-style-card-toggle-row">
                <span>Glow</span>
                <input
                  type="checkbox"
                  className="studio-editor-toggle"
                  checked={Boolean(text.glow)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    patchText({ glow: on });
                    setGlowOpen(on);
                  }}
                />
              </label>
            }
          >
            <StudioColorPicker
              label="Glow color"
              value={text.glowColor ?? "#ffffff"}
              allowNone={false}
              onChange={(glowColor) =>
                patchText({ glowColor: glowColor ?? "#ffffff" })
              }
            />
            <SliderRow
              label="Blur"
              min={0}
              max={48}
              step={1}
              value={text.glowBlur ?? 12}
              defaultValue={12}
              formatValue={(v) => `${Math.round(Number(v))}px`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "px" })}
              onValueChange={(next) => patchText({ glowBlur: next })}
            />
          </StyleAccordion>
        </div>
      </InspectorSection>

      <section className="studio-editor-inspector-section">
        <div className="studio-editor-style-stack">
          <StyleAccordion
            label="Opacity"
            open={sectionOpen.opacity}
            onToggle={() => toggleSection("opacity")}
            onReset={() => patchText({ opacity: 1 })}
            summary={
              <div className="studio-editor-style-card-toggle-row">
                <span>Opacity</span>
                <span className="studio-editor-style-card-meta">
                  {Math.round((text.opacity ?? 1) * 100)}%
                </span>
              </div>
            }
          >
            <SliderRow
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={text.opacity ?? 1}
              defaultValue={1}
              formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
              parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
              onValueChange={(next) => patchText({ opacity: next })}
            />
          </StyleAccordion>

          <StyleAccordion
            label="Transform"
            open={sectionOpen.transform}
            onToggle={() => toggleSection("transform")}
            onReset={() => patchPose({ scale: 1, x: 0, y: 0.32, rotation: 0 })}
            summary={
              <div className="studio-editor-style-card-toggle-row">
                <span>Transform</span>
                <span className="studio-editor-style-card-meta">
                  {Math.round(pose.scale * 100)}% · {Math.round(pose.rotation)}°
                </span>
              </div>
            }
          >
            <p className="studio-editor-inspector-hint">
              Drag text on the canvas to move, scale, and rotate.
            </p>
            <div className="studio-editor-text-chip-row">
              <button
                type="button"
                className={`studio-editor-text-chip${text.flipX ? " is-active" : ""}`}
                onClick={() => patchText({ flipX: !text.flipX })}
                aria-pressed={Boolean(text.flipX)}
              >
                <FlipHorizontal2 size={14} aria-hidden="true" />
                Flip H
              </button>
              <button
                type="button"
                className={`studio-editor-text-chip${text.flipY ? " is-active" : ""}`}
                onClick={() => patchText({ flipY: !text.flipY })}
                aria-pressed={Boolean(text.flipY)}
              >
                <FlipVertical2 size={14} aria-hidden="true" />
                Flip V
              </button>
            </div>
            <SliderRow
              label="Scale"
              min={0}
              max={6}
              step={0.01}
              value={pose.scale}
              defaultValue={1}
              formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
              parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
              onValueChange={(next) => patchPose({ ...pose, scale: next })}
            />
            <SliderRow
              label="Position X"
              min={CLIP_TRANSFORM_LIMITS.panMin}
              max={CLIP_TRANSFORM_LIMITS.panMax}
              step={0.01}
              value={pose.x}
              defaultValue={0}
              formatValue={(v) => Number(v).toFixed(2)}
              parseInput={(raw) => parseNumberInput(raw)}
              onValueChange={(next) => patchPose({ ...pose, x: next })}
            />
            <SliderRow
              label="Position Y"
              min={CLIP_TRANSFORM_LIMITS.panMin}
              max={CLIP_TRANSFORM_LIMITS.panMax}
              step={0.01}
              value={pose.y}
              defaultValue={0.32}
              formatValue={(v) => Number(v).toFixed(2)}
              parseInput={(raw) => parseNumberInput(raw)}
              onValueChange={(next) => patchPose({ ...pose, y: next })}
            />
            <SliderRow
              label="Rotate"
              min={0}
              max={359}
              step={1}
              value={pose.rotation}
              defaultValue={0}
              formatValue={(v) => `${Math.round(Number(v))}°`}
              parseInput={(raw) => parseNumberInput(raw, { suffix: "°" })}
              onValueChange={(next) => patchPose({ ...pose, rotation: next })}
            />
          </StyleAccordion>

          <StyleAccordion
            label="Motion"
            open={sectionOpen.motion}
            onToggle={() => toggleSection("motion")}
            summary={
              <div className="studio-editor-style-card-toggle-row">
                <span>Motion</span>
                <span className="studio-editor-style-card-meta">
                  {textMotionSummary(resolveTextMotion(text))}
                </span>
              </div>
            }
          >
            <p className="studio-editor-inspector-hint">
              Set how the text enters and how it leaves — each side is its own animation.
            </p>
            {(() => {
              const motion = resolveTextMotion(text);
              const templates =
                motionSide === "out"
                  ? TEXT_ANIMATION_OUT_TEMPLATES
                  : TEXT_ANIMATION_IN_TEMPLATES;
              const activeId =
                motionSide === "out" ? motion.animationOut : motion.animationIn;
              const activeDuration =
                motionSide === "out"
                  ? motion.animationOutDuration
                  : motion.animationInDuration;
              const patchMotion = (next) => {
                const merged = { ...motion, ...next };
                patchText({
                  animation: merged.animationIn,
                  animationDuration: merged.animationInDuration,
                  animationOut: merged.animationOut,
                  animationOutDuration: merged.animationOutDuration,
                });
              };
              return (
                <>
                  <div
                    className="studio-editor-motion-tabs"
                    role="tablist"
                    aria-label="Text motion side"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={motionSide === "in"}
                      className={`studio-editor-motion-tab${motionSide === "in" ? " is-active" : ""}`}
                      onClick={() => setMotionSide("in")}
                    >
                      In
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={motionSide === "out"}
                      className={`studio-editor-motion-tab${motionSide === "out" ? " is-active" : ""}`}
                      onClick={() => setMotionSide("out")}
                    >
                      Out
                    </button>
                  </div>
                  <div
                    className="studio-editor-motion-grid"
                    role="group"
                    aria-label={motionSide === "out" ? "Exit motion" : "Enter motion"}
                  >
                    {templates.map((template) => {
                      const active = activeId === template.id;
                      return (
                        <button
                          key={`${motionSide}-${template.id}`}
                          type="button"
                          className={`studio-editor-motion-card${active ? " is-active" : ""}`}
                          aria-pressed={active}
                          title={template.label}
                          onClick={() => {
                            const duration =
                              template.id === "none"
                                ? 0
                                : activeDuration || template.duration || 0.5;
                            if (motionSide === "out") {
                              patchMotion({
                                animationOut: template.id,
                                animationOutDuration: duration,
                              });
                              return;
                            }
                            patchMotion({
                              animationIn: template.id,
                              animationInDuration: duration,
                            });
                          }}
                        >
                          <span className="studio-editor-motion-card-glyph">
                            <MotionPresetGlyph id={template.id} />
                          </span>
                          <span className="studio-editor-motion-card-label">
                            {template.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {activeId !== "none" ? (
                    <div className="studio-editor-control-block">
                      <span className="studio-editor-slider-label">
                        {motionSide === "out" ? "Out" : "In"} duration ·{" "}
                        {(activeDuration || 0.5).toFixed(1)}s
                      </span>
                      <input
                        type="range"
                        min={0.1}
                        max={2}
                        step={0.1}
                        value={activeDuration || 0.5}
                        onChange={(e) => {
                          const duration = Number(e.target.value) || 0.5;
                          if (motionSide === "out") {
                            patchMotion({ animationOutDuration: duration });
                            return;
                          }
                          patchMotion({ animationInDuration: duration });
                        }}
                      />
                    </div>
                  ) : null}
                </>
              );
            })()}
          </StyleAccordion>
        </div>
      </section>
    </div>
  );
}
