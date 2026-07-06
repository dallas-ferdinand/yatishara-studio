// @ts-nocheck
"use client";

import { Type, Wand2 } from "lucide-react";
import {
  applyFadePreset,
  FADE_PRESETS,
  TEXT_ANIMATION_TEMPLATES,
  TRANSITION_TEMPLATES,
} from "./editorEffects";
import { clipDuration } from "./editorState";

const ICON = 14;

export function EditorInspector({
  clip,
  onUpdateClip,
  onAddTextClip,
  playhead,
}) {
  if (!clip) {
    return (
      <aside className="studio-editor-inspector">
        <div className="studio-editor-inspector-head">
          <Wand2 size={ICON} aria-hidden="true" />
          <span>Inspector</span>
        </div>
        <div className="studio-editor-inspector-empty">
          <p>Select a clip to edit fades, transitions, and text.</p>
          <button type="button" className="studio-editor-inspector-btn" onClick={onAddTextClip}>
            <Type size={ICON} aria-hidden="true" />
            Add text at playhead
          </button>
        </div>
        <EditorShortcutsHelp />
      </aside>
    );
  }

  const duration = clipDuration(clip);
  const effects = clip.effects ?? {};
  const isText = clip.kind === "text";
  const isAudio = clip.kind === "audio";

  const patchEffects = (next) => {
    onUpdateClip(clip.id, { effects: { ...effects, ...next } });
  };

  const patchText = (next) => {
    onUpdateClip(clip.id, { text: { ...(clip.text ?? {}), ...next }, label: next.text?.slice(0, 24) || clip.label });
  };

  return (
    <aside className="studio-editor-inspector">
      <div className="studio-editor-inspector-head">
        <Wand2 size={ICON} aria-hidden="true" />
        <span>{clip.label}</span>
      </div>

      <div className="studio-editor-inspector-body">
        {!isText ? (
          <section className="studio-editor-inspector-section">
            <h4>Fade preset</h4>
            <div className="studio-editor-chip-row">
              {FADE_PRESETS.map((preset) => {
                const active =
                  (effects.fadeIn ?? 0) === preset.fadeIn && (effects.fadeOut ?? 0) === preset.fadeOut;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`studio-editor-chip${active ? " is-active" : ""}`}
                    onClick={() => patchEffects(applyFadePreset(effects, preset.id))}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="studio-editor-field-row">
              <label>
                Fade in (s)
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
                Fade out (s)
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
          </section>
        ) : null}

        {!isText && !isAudio ? (
          <section className="studio-editor-inspector-section">
            <h4>Transition out</h4>
            <div className="studio-editor-chip-row">
              {TRANSITION_TEMPLATES.map((template) => {
                const current = clip.transitionOut?.type ?? "none";
                const active = current === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`studio-editor-chip${active ? " is-active" : ""}`}
                    onClick={() =>
                      onUpdateClip(clip.id, {
                        transitionOut:
                          template.id === "none"
                            ? undefined
                            : { type: template.id, duration: template.duration },
                      })
                    }
                  >
                    {template.label}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {isAudio ? (
          <section className="studio-editor-inspector-section">
            <h4>Volume</h4>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={effects.volume ?? 1}
              onChange={(e) => patchEffects({ volume: Number(e.target.value) })}
              className="studio-editor-range"
            />
          </section>
        ) : null}

        {isText ? (
          <section className="studio-editor-inspector-section">
            <h4>Text</h4>
            <textarea
              className="studio-editor-textarea"
              rows={3}
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
            <h4>Animation</h4>
            <div className="studio-editor-chip-row">
              {TEXT_ANIMATION_TEMPLATES.map((template) => {
                const active = (clip.text?.animation ?? "none") === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`studio-editor-chip${active ? " is-active" : ""}`}
                    onClick={() =>
                      patchText({
                        animation: template.id,
                        animationDuration: template.duration || clip.text?.animationDuration,
                      })
                    }
                  >
                    {template.label}
                  </button>
                );
              })}
            </div>
            <label className="studio-editor-field-full">
              Duration (s)
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
        ) : null}

        <section className="studio-editor-inspector-section studio-editor-inspector-meta">
          <span>Starts {clip.startTime.toFixed(2)}s</span>
          <span>Length {duration.toFixed(2)}s</span>
          <span>Playhead {playhead.toFixed(2)}s</span>
        </section>
      </div>

      <EditorShortcutsHelp />
    </aside>
  );
}

function EditorShortcutsHelp() {
  return (
    <div className="studio-editor-shortcuts">
      <h4>Shortcuts</h4>
      <dl>
        <div><dt>Space</dt><dd>Play / pause</dd></div>
        <div><dt>Del</dt><dd>Delete clip</dd></div>
        <div><dt>S</dt><dd>Split</dd></div>
        <div><dt>⌘D</dt><dd>Duplicate</dd></div>
        <div><dt>⌘Z</dt><dd>Undo</dd></div>
        <div><dt>← →</dt><dd>Scrub</dd></div>
        <div><dt>Alt+drag</dt><dd>Free move</dd></div>
      </dl>
    </div>
  );
}
