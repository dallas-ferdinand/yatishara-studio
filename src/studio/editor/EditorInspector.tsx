// @ts-nocheck
"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Film,
  Moon,
  Move,
  Scissors,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Type,
  Volume2,
  Zap,
  ZoomIn,
} from "lucide-react";
import {
  applyFadePreset,
  FADE_PRESETS,
  TEXT_ANIMATION_TEMPLATES,
  TRANSITION_LIBRARY,
  toggleFadeEdge,
  transitionLabel,
} from "./editorEffects";
import { clipDuration } from "./editorState";
import { jointByKey, leftClipForJoint } from "./editorTimelineUtils";

const ICON = 16;

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

function TransitionCard({ template, active, onClick }) {
  const Icon = TRANSITION_ICONS[template.icon] ?? Sparkles;
  return (
    <button
      type="button"
      className={`studio-editor-lib-card${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      <span className="studio-editor-lib-card-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="studio-editor-lib-card-label">{template.label}</span>
      {template.duration > 0 ? (
        <span className="studio-editor-lib-card-meta">{template.duration}s</span>
      ) : null}
    </button>
  );
}

export function EditorInspector({
  open,
  editorMode,
  clip,
  jointKey,
  project,
  playhead,
  onUpdateClip,
  onSetJointTransition,
  onAddTextClip,
  onAddTrackLayer,
}) {
  if (!open) return null;

  const joint = jointByKey(project, jointKey);
  const jointLeft = joint ? leftClipForJoint(project, joint) : null;
  const showTransition = editorMode === "transition" || Boolean(joint);
  const showFade = clip && clip.kind !== "text" && (editorMode === "fade" || editorMode === "select");
  const showText = editorMode === "text" || clip?.kind === "text";
  const showLayers = editorMode === "layers";

  return (
    <aside className="studio-editor-inspector">
      <div className="studio-editor-inspector-head">
        <span className="studio-editor-inspector-title">
          {joint ? "Clip transition" : clip ? clip.label : "Edit panel"}
        </span>
      </div>

      <div className="studio-editor-inspector-body">
        {showTransition ? (
          <section className="studio-editor-inspector-section">
            <h4>Transition library</h4>
            <p className="studio-editor-inspector-hint">
              {joint
                ? "Choose how these clips blend together."
                : "Click the marker between two clips on the timeline."}
            </p>
            <div className="studio-editor-lib-grid">
              {TRANSITION_LIBRARY.map((template) => {
                const current = jointLeft?.transitionOut?.type ?? "none";
                const active = current === template.id;
                return (
                  <TransitionCard
                    key={template.id}
                    template={template}
                    active={active}
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
              <label className="studio-editor-field-full">
                Duration (s)
                <input
                  type="number"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={jointLeft.transitionOut.duration}
                  onChange={(e) =>
                    onUpdateClip(jointLeft.id, {
                      transitionOut: {
                        type: jointLeft.transitionOut!.type,
                        duration: Number(e.target.value) || 0.5,
                      },
                    })
                  }
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {showFade && clip ? (
          <FadePanel clip={clip} onUpdateClip={onUpdateClip} />
        ) : null}

        {showText ? (
          <TextPanel
            clip={clip}
            playhead={playhead}
            onUpdateClip={onUpdateClip}
            onAddTextClip={onAddTextClip}
          />
        ) : null}

        {showLayers ? (
          <LayersPanel project={project} onAddTrackLayer={onAddTrackLayer} />
        ) : null}

        {!clip && !joint && editorMode === "select" ? (
          <div className="studio-editor-inspector-empty">
            <Film size={28} strokeWidth={1.25} aria-hidden="true" />
            <p>Select a clip on the timeline, or switch mode above.</p>
          </div>
        ) : null}

        {clip ? (
          <section className="studio-editor-inspector-section studio-editor-inspector-meta">
            <div><strong>Start</strong> {clip.startTime.toFixed(2)}s</div>
            <div><strong>Length</strong> {clipDuration(clip).toFixed(2)}s</div>
            {clip.transitionOut?.type && clip.transitionOut.type !== "none" ? (
              <div><strong>Out</strong> {transitionLabel(clip.transitionOut.type)}</div>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function FadePanel({ clip, onUpdateClip }) {
  const duration = clipDuration(clip);
  const effects = clip.effects ?? {};
  const isAudio = clip.kind === "audio";

  const patchEffects = (next) => {
    onUpdateClip(clip.id, { effects: { ...effects, ...next } });
  };

  return (
    <section className="studio-editor-inspector-section">
      <h4>{isAudio ? "Audio fades" : "Clip fades"}</h4>
      <div className="studio-editor-edge-row">
        <button
          type="button"
          className={`studio-editor-edge-btn${(effects.fadeIn ?? 0) > 0 ? " is-on" : ""}`}
          onClick={() => patchEffects(toggleFadeEdge(effects, "in"))}
        >
          <Sunrise size={ICON} aria-hidden="true" />
          <span>Fade in</span>
          <em>{(effects.fadeIn ?? 0) > 0 ? `${effects.fadeIn}s` : "Off"}</em>
        </button>
        <button
          type="button"
          className={`studio-editor-edge-btn${(effects.fadeOut ?? 0) > 0 ? " is-on" : ""}`}
          onClick={() => patchEffects(toggleFadeEdge(effects, "out", isAudio ? 1 : 0.5))}
        >
          <Sunset size={ICON} aria-hidden="true" />
          <span>Fade out</span>
          <em>{(effects.fadeOut ?? 0) > 0 ? `${effects.fadeOut}s` : "Off"}</em>
        </button>
      </div>
      <div className="studio-editor-preset-grid">
        {FADE_PRESETS.map((preset) => {
          const active =
            (effects.fadeIn ?? 0) === preset.fadeIn && (effects.fadeOut ?? 0) === preset.fadeOut;
          return (
            <button
              key={preset.id}
              type="button"
              className={`studio-editor-preset-btn${active ? " is-active" : ""}`}
              onClick={() => patchEffects(applyFadePreset(effects, preset.id))}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="studio-editor-field-row">
        <label>
          In (s)
          <input
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={effects.fadeIn ?? 0}
            onChange={(e) => patchEffects({ fadeIn: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label>
          Out (s)
          <input
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={effects.fadeOut ?? 0}
            onChange={(e) => patchEffects({ fadeOut: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      </div>
      {isAudio ? (
        <label className="studio-editor-field-full">
          <span className="studio-editor-range-label">
            <Volume2 size={14} aria-hidden="true" /> Volume
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={effects.volume ?? 1}
            onChange={(e) => patchEffects({ volume: Number(e.target.value) })}
            className="studio-editor-range"
          />
        </label>
      ) : null}
    </section>
  );
}

function TextPanel({ clip, playhead, onUpdateClip, onAddTextClip }) {
  if (!clip) {
    return (
      <section className="studio-editor-inspector-section">
        <h4>Text overlays</h4>
        <p className="studio-editor-inspector-hint">Add titles on overlay tracks at the playhead.</p>
        <button type="button" className="studio-editor-primary-btn" onClick={() => onAddTextClip()}>
          <Type size={ICON} aria-hidden="true" />
          Add text at {playhead.toFixed(1)}s
        </button>
      </section>
    );
  }

  const duration = clipDuration(clip);
  const patchText = (next) => {
    onUpdateClip(clip.id, {
      text: { ...(clip.text ?? {}), ...next },
      label: next.text?.slice(0, 28) || clip.label,
    });
  };

  return (
    <section className="studio-editor-inspector-section">
      <h4>Text overlay</h4>
      <textarea
        className="studio-editor-textarea"
        rows={3}
        placeholder="Headline or caption"
        value={clip.text?.text ?? ""}
        onChange={(e) => patchText({ text: e.target.value })}
      />
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
      <h4>Animation</h4>
      <div className="studio-editor-lib-grid is-compact">
        {TEXT_ANIMATION_TEMPLATES.map((template) => {
          const active = (clip.text?.animation ?? "none") === template.id;
          return (
            <button
              key={template.id}
              type="button"
              className={`studio-editor-lib-card is-compact${active ? " is-active" : ""}`}
              onClick={() =>
                patchText({
                  animation: template.id,
                  animationDuration: template.duration || clip.text?.animationDuration,
                })
              }
            >
              <span className="studio-editor-lib-card-label">{template.label}</span>
            </button>
          );
        })}
      </div>
      <label className="studio-editor-field-full">
        Anim duration (s)
        <input
          type="number"
          min={0}
          max={duration}
          step={0.05}
          value={clip.text?.animationDuration ?? 0.5}
          onChange={(e) => patchText({ animationDuration: Number(e.target.value) || 0.5 })}
        />
      </label>
    </section>
  );
}

function LayersPanel({ project, onAddTrackLayer }) {
  const videoTracks = project.tracks.filter((t) => t.kind === "video");
  const textTracks = project.tracks.filter((t) => t.kind === "text");

  return (
    <section className="studio-editor-inspector-section">
      <h4>Timeline layers</h4>
      <p className="studio-editor-inspector-hint">
        Stack b-roll, titles, and overlays on separate rows.
      </p>
      <div className="studio-editor-layer-list">
        <div>
          <strong>Video</strong>
          <ul>
            {videoTracks.map((track) => (
              <li key={track.id}>{track.label}</li>
            ))}
          </ul>
          <button type="button" className="studio-editor-secondary-btn" onClick={() => onAddTrackLayer("video")}>
            + Video layer
          </button>
        </div>
        <div>
          <strong>Text</strong>
          <ul>
            {textTracks.map((track) => (
              <li key={track.id}>{track.label}</li>
            ))}
          </ul>
          <button type="button" className="studio-editor-secondary-btn" onClick={() => onAddTrackLayer("text")}>
            + Text layer
          </button>
        </div>
      </div>
    </section>
  );
}
