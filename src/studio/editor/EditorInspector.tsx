// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blend,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Moon,
  MousePointer2,
  Move,
  Music2,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Sun,
  Type,
  Volume2,
  ZoomIn,
} from "lucide-react";
import {
  EDITOR_MODES,
  TRANSITION_LIBRARY,
  clampAudioFadePair,
  clampAudioFadeSec,
  transitionLabel,
} from "./editorEffects";
import {
  CLIP_TRANSFORM_LIMITS,
  normalizeClipTransform,
} from "./clipTransform";
import { FRAME_RATIO_PRESETS, normalizeFrameRatio } from "./projectContract";
import { clipDuration } from "./editorState";
import { jointByKey, leftClipForJoint } from "./editorTimelineUtils";
import { resolveClipPoster } from "./videoPoster";

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

function InspectorSection({ title, hint, onReset, children }) {
  return (
    <section className="studio-editor-inspector-section">
      <div className="studio-editor-inspector-section-head">
        <h4>{title}</h4>
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
      {hint ? <p className="studio-editor-inspector-hint">{hint}</p> : null}
      <div className="studio-editor-inspector-section-body">{children}</div>
    </section>
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

function modeAvailability({ modeId, joint }) {
  if (modeId === "transition") {
    if (!joint) {
      return { enabled: false, reason: "Select a cut between two clips to apply a transition" };
    }
    return { enabled: true, reason: null };
  }
  return { enabled: true, reason: null };
}

/** True when the inspector content pane should be open (not just the mode rail). */
export function inspectorPanelOpen({ editorMode, clip, joint }) {
  void editorMode;
  void clip;
  void joint;
  return true;
}

export function EditorModeRail({
  editorMode,
  onModeChange,
  exporting,
  onExport,
  canExport,
  joint,
}) {
  return (
    <nav className="studio-editor-mode-stack" role="tablist" aria-label="Edit tools">
      {EDITOR_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.icon] ?? MousePointer2;
        const active = editorMode === mode.id;
        const { enabled, reason } = modeAvailability({ modeId: mode.id, joint });
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
            <Icon size={17} aria-hidden="true" />
          </button>
        );
      })}
      <div className="studio-editor-mode-stack-spacer" />
      <button
        type="button"
        className="studio-editor-mode-export"
        disabled={exporting || !canExport}
        aria-label={exporting ? "Exporting" : "Export video"}
        title={
          exporting
            ? "Exporting…"
            : !canExport
              ? "Add a video clip before exporting"
              : "Export"
        }
        onClick={onExport}
      >
        <Download size={17} aria-hidden="true" />
      </button>
    </nav>
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
  clip,
  media,
  jointKey,
  project,
  playhead,
  onUpdateClip,
  onUpdateProject,
  onSetJointTransition,
  onAddTextClip,
}) {
  const joint = jointByKey(project, jointKey);
  const jointLeft = joint ? leftClipForJoint(project, joint) : null;
  const showTransition = Boolean(joint) && (editorMode === "transition" || editorMode === "select");
  const showAudio = Boolean(clip) && (clip.kind === "audio" || clip.kind === "video");
  const showVideo = Boolean(clip) && clip.kind === "video";
  const showText = editorMode === "text" || clip?.kind === "text";
  const frameRatio = normalizeFrameRatio(project.frameRatio);

  return (
    <aside className="studio-editor-inspector">
      <div className="studio-editor-inspector-main">
        <InspectorHeader
          clip={clip}
          media={media}
          joint={joint}
        />

        <div className="studio-editor-inspector-body">
          <InspectorSection
            title="Frame"
            hint="Output canvas ratio. Zoom the preview view separately with the canvas controls."
          >
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
                    <span
                      className="studio-editor-frame-preset-icon"
                      style={{ aspectRatio: preset.cssRatio }}
                      aria-hidden="true"
                    />
                    <span className="studio-editor-frame-preset-label">{preset.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </InspectorSection>

          {showTransition ? (
            <InspectorSection
              title="Transitions"
              hint="Applied between adjacent clips in preview and export."
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
                      disabled={!joint}
                      onClick={() => {
                        if (!joint) return;
                        onSetJointTransition(
                          joint.key,
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
                  onValueChange={(next) =>
                    onUpdateClip(jointLeft.id, {
                      transitionOut: {
                        type: jointLeft.transitionOut!.type,
                        duration: next || 0.5,
                      },
                    })
                  }
                />
              ) : null}
            </InspectorSection>
          ) : null}

          {showAudio && clip ? <AudioPanel clip={clip} onUpdateClip={onUpdateClip} /> : null}

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
            <InspectorSection title="Details">
              <div className="studio-editor-detail-grid">
                <div className="studio-editor-detail-row">
                  <span>Start</span>
                  <strong>{clip.startTime.toFixed(2)}s</strong>
                </div>
                <div className="studio-editor-detail-row">
                  <span>Length</span>
                  <strong>{clipDuration(clip).toFixed(2)}s</strong>
                </div>
                {clip.transitionOut?.type && clip.transitionOut.type !== "none" ? (
                  <div className="studio-editor-detail-row">
                    <span>Out</span>
                    <strong>{transitionLabel(clip.transitionOut.type)}</strong>
                  </div>
                ) : null}
              </div>
            </InspectorSection>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function TransformPanel({ clip, onUpdateClip }) {
  const effects = clip.effects ?? {};
  const transform = normalizeClipTransform(effects);
  const patch = (next) => {
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

  return (
    <InspectorSection
      title="Transform"
      hint="Keeps the media’s native aspect ratio. Drag on the canvas to move, resize, or rotate."
      onReset={() => patch({ scale: 1, x: 0, y: 0, rotation: 0 })}
    >
      <SliderRow
        label="Size"
        min={CLIP_TRANSFORM_LIMITS.scaleMin}
        max={CLIP_TRANSFORM_LIMITS.scaleMax}
        step={0.05}
        value={transform.scale}
        defaultValue={1}
        formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
        parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
        onValueChange={(next) => patch({ ...transform, scale: next })}
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
        onValueChange={(next) => patch({ ...transform, x: next })}
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
        onValueChange={(next) => patch({ ...transform, y: next })}
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
        onValueChange={(next) => patch({ ...transform, rotation: next })}
      />
    </InspectorSection>
  );
}

function AudioPanel({ clip, onUpdateClip }) {
  const effects = clip.effects ?? {};
  const volume = effects.volume ?? 1;
  const duration = clipDuration(clip);
  const { fadeIn, fadeOut } = clampAudioFadePair(
    effects.fadeIn ?? 0,
    effects.fadeOut ?? 0,
    duration,
  );
  const fadeInMax = Math.max(0, duration - fadeOut);
  const fadeOutMax = Math.max(0, duration - fadeIn);
  const fadeStep = Math.min(0.05, Math.max(0.05, duration));

  const patchEffects = (next) => {
    onUpdateClip(clip.id, {
      effects: {
        ...effects,
        ...next,
      },
    });
  };

  return (
    <InspectorSection
      title="Audio"
      onReset={() =>
        patchEffects({
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
        })
      }
    >
      <SliderRow
        label={
          <>
            <Volume2 size={14} aria-hidden="true" /> Volume
          </>
        }
        min={0}
        max={1}
        step={0.05}
        value={volume}
        defaultValue={1}
        formatValue={(v) => `${Math.round(Number(v) * 100)}%`}
        parseInput={(raw) => parseNumberInput(raw, { scale: 100, suffix: "%" })}
        onValueChange={(next) => patchEffects({ volume: next })}
      />
      <SliderRow
        label="Fade in"
        min={0}
        max={Math.max(0.05, fadeInMax)}
        step={fadeStep}
        value={fadeIn}
        defaultValue={0}
        formatValue={(v) => `${Number(v).toFixed(2)}s`}
        parseInput={(raw) => parseNumberInput(raw, { suffix: "s" })}
        onValueChange={(next) =>
          patchEffects({ fadeIn: clampAudioFadeSec(next, duration, fadeOut) })
        }
      />
      <SliderRow
        label="Fade out"
        min={0}
        max={Math.max(0.05, fadeOutMax)}
        step={fadeStep}
        value={fadeOut}
        defaultValue={0}
        formatValue={(v) => `${Number(v).toFixed(2)}s`}
        parseInput={(raw) => parseNumberInput(raw, { suffix: "s" })}
        onValueChange={(next) =>
          patchEffects({ fadeOut: clampAudioFadeSec(next, duration, fadeIn) })
        }
      />
    </InspectorSection>
  );
}

function TextPanel({ clip, playhead, onUpdateClip, onAddTextClip }) {
  if (!clip) {
    return (
      <InspectorSection title="Text">
        <button type="button" className="studio-editor-primary-btn" onClick={() => onAddTextClip()}>
          <Type size={ICON} aria-hidden="true" />
          Add text at {playhead.toFixed(1)}s
        </button>
      </InspectorSection>
    );
  }

  const patchText = (next) => {
    onUpdateClip(clip.id, {
      text: { ...(clip.text ?? {}), ...next },
      label: next.text?.slice(0, 28) || clip.label,
    });
  };

  return (
    <InspectorSection title="Text">
      <label className="studio-editor-field-full">
        Content
        <textarea
          className="studio-editor-textarea"
          rows={4}
          placeholder="Headline"
          value={clip.text?.text ?? ""}
          onChange={(e) => patchText({ text: e.target.value })}
        />
      </label>
      <div className="studio-editor-field-row">
        <label>
          Size
          <input
            type="number"
            min={12}
            max={120}
            value={clip.text?.fontSize ?? 42}
            onChange={(e) => patchText({ fontSize: Number(e.target.value) || 42 })}
          />
        </label>
        <label>
          Color
          <input
            type="color"
            value={clip.text?.color ?? "#ffffff"}
            onChange={(e) => patchText({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="studio-editor-control-block">
        <span className="studio-editor-slider-label">Align</span>
        <div className="studio-editor-align-row">
          {(["left", "center", "right"]).map((align) => (
            <button
              key={align}
              type="button"
              className={`studio-editor-preset-btn${clip.text?.align === align ? " is-active" : ""}`}
              onClick={() => patchText({ align })}
            >
              {align}
            </button>
          ))}
        </div>
      </div>
    </InspectorSection>
  );
}
