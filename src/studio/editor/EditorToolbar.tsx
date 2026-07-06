// @ts-nocheck
"use client";

import {
  Download,
  Layers,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Sun,
  Type,
  Blend,
} from "lucide-react";
import { EDITOR_MODES } from "./editorEffects";

const ICONS = {
  "mouse-pointer": MousePointer2,
  sun: Sun,
  blend: Blend,
  type: Type,
  layers: Layers,
};

const ICON = 15;

export function EditorToolbar({
  editorMode,
  inspectorOpen,
  exporting,
  onModeChange,
  onToggleInspector,
  onExport,
}) {
  return (
    <header className="studio-editor-toolbar">
      <div className="studio-editor-toolbar-modes">
        {EDITOR_MODES.map((mode) => {
          const Icon = ICONS[mode.icon] ?? MousePointer2;
          const active = editorMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              className={`studio-editor-mode-btn${active ? " is-active" : ""}`}
              title={mode.label}
              onClick={() => onModeChange(mode.id)}
            >
              <Icon size={ICON} aria-hidden="true" />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
      <div className="studio-editor-toolbar-actions">
        <button
          type="button"
          className="studio-editor-toolbar-icon-btn"
          title={inspectorOpen ? "Hide panel" : "Show panel"}
          aria-label={inspectorOpen ? "Hide panel" : "Show panel"}
          onClick={onToggleInspector}
        >
          {inspectorOpen ? (
            <PanelRightClose size={ICON} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={ICON} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="studio-editor-export-primary"
          disabled={exporting}
          onClick={onExport}
        >
          <Download size={ICON} aria-hidden="true" />
          {exporting ? "Exporting…" : "Export video"}
        </button>
      </div>
    </header>
  );
}

export function EditorModeHint({ mode }) {
  const hints = {
    select: "Select and move clips. Alt+drag to skip snap.",
    fade: "Pick a clip, then set fade in/out on edges or use presets.",
    transition: "Click the diamond between two clips to add a transition.",
    text: "Add titles on overlay tracks. Select a text clip to style it.",
    layers: "Stack video and text layers. Drag clips between rows.",
  };
  return (
    <div className="studio-editor-mode-hint">
      <Sparkles size={12} aria-hidden="true" />
      <span>{hints[mode] ?? hints.select}</span>
    </div>
  );
}
