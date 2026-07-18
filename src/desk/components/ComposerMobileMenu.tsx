// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Icon, modeIcon } from "./Icons";
import { isAutoModel, AUTO_MODEL } from "@mos-app/model-choice.js";
import { speakRepliesEnabled, updateUserPrefs } from "@mos-app/user-prefs.js";
import {
  getSpeakTransportState,
  pauseSpeaking,
  resumeSpeaking,
  stopSpeaking,
  subscribeSpeakState,
  unlockSpeakAudio,
} from "@mos-app/speak.js";

const MODE_LABELS = { agent: "Agent", plan: "Plan", ask: "Ask" };

export function ComposerMobileMenu({
  open,
  onClose,
  summary,
  models,
  filteredModels,
  modelSearch,
  onModelSearch,
  onSetMode,
  onSetModel,
  onResetDefaults,
  multitaskAvailable,
  onToggleMultitask,
  onFileRef,
  onAttach,
  onPaste,
  onHeal,
  healBusy,
  showHeal,
  isInline,
  onCancelEdit,
}) {
  const [speakOn, setSpeakOn] = useState(() => speakRepliesEnabled());
  const [transport, setTransport] = useState(() => getSpeakTransportState());

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => subscribeSpeakState(setTransport), []);

  useEffect(() => {
    const onPrefs = (e) => setSpeakOn(e.detail?.speakReplies === true);
    window.addEventListener("mercuryos-user-prefs", onPrefs);
    return () => window.removeEventListener("mercuryos-user-prefs", onPrefs);
  }, []);

  if (!open) return null;

  const run = (fn) => {
    fn?.();
    onClose();
  };

  const toggleSpeak = () => {
    unlockSpeakAudio();
    const next = updateUserPrefs({ speakReplies: !speakRepliesEnabled() });
    setSpeakOn(next.speakReplies === true);
    onClose();
  };

  const toolActions = [
    !isInline
      ? {
          id: "file-ref",
          label: "File context",
          icon: "search",
          onPress: () => run(onFileRef),
        }
      : null,
    {
      id: "attach",
      label: "Attach file",
      icon: "paperclip",
      onPress: () => run(onAttach),
    },
    {
      id: "paste",
      label: "Paste context",
      icon: "copy",
      onPress: () => run(onPaste),
    },
    transport.busy
      ? {
          id: "speak-pause",
          label: transport.paused ? "Resume speech" : "Pause speech",
          icon: transport.paused ? "playFilled" : "pause",
          onPress: () => {
            if (transport.paused) resumeSpeaking();
            else pauseSpeaking();
            onClose();
          },
        }
      : {
          id: "speak",
          label: speakOn ? "Auto speak on" : "Auto speak off",
          icon: speakOn ? "volume" : "volumeMute",
          onPress: toggleSpeak,
        },
    transport.busy
      ? {
          id: "speak-stop",
          label: "Stop speech",
          icon: "stop",
          onPress: () => {
            stopSpeaking();
            onClose();
          },
        }
      : null,
    showHeal
      ? {
          id: "heal",
          label: healBusy ? "Sending heal alert…" : "Stuck? Send heal alert",
          icon: "bell",
          onPress: () => run(onHeal),
        }
      : null,
    isInline && onCancelEdit
      ? {
          id: "cancel-edit",
          label: "Cancel edit",
          icon: "x",
          onPress: () => run(onCancelEdit),
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="desk-mobile-sheet" role="dialog" aria-modal="true" aria-label="Composer menu">
      <button type="button" className="desk-mobile-sheet-backdrop" onClick={onClose} aria-label="Dismiss" />
      <div className="desk-mobile-sheet-panel composer-mobile-menu-panel">
        <header className="desk-mobile-sheet-head">
          <span className="desk-mobile-sheet-title">Composer</span>
          <span className="desk-mobile-sheet-sub truncate">
            {summary.modeLabel} · {summary.modelLabel}
          </span>
        </header>

        <div className="composer-mobile-menu-scroll">
          <section className="composer-mobile-menu-section" aria-label="Mode">
            <p className="composer-mobile-menu-label">Mode</p>
            <div className="composer-mobile-menu-pills">
              {["agent", "plan", "ask"].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`composer-mobile-menu-pill${summary.mode === m ? " is-active" : ""}`}
                  onClick={() => run(() => onSetMode(m))}
                >
                  <Icon name={modeIcon(m)} size={14} />
                  <span>{MODE_LABELS[m]}</span>
                  {summary.mode === m ? <span className="composer-mobile-menu-check">✓</span> : null}
                </button>
              ))}
            </div>
          </section>

          {multitaskAvailable ? (
            <button
              type="button"
              className={`composer-mobile-menu-row${summary.multitask ? " is-active" : ""}`}
              onClick={() => {
                onToggleMultitask?.();
                onClose();
              }}
            >
              <Icon name="agentMode" size={18} className="composer-mobile-menu-row-icon" />
              <span>Multitask {summary.multitask ? "on" : "off"}</span>
              {summary.multitask ? <span className="composer-mobile-menu-check">✓</span> : null}
            </button>
          ) : null}

          <section className="composer-mobile-menu-section" aria-label="Model">
            <p className="composer-mobile-menu-label">Model</p>
            <input
              type="search"
              placeholder="Search models"
              className="composer-mobile-menu-search"
              value={modelSearch}
              onInput={(e) => onModelSearch(e.target.value)}
            />
            <button
              type="button"
              className={`composer-mobile-menu-row${isAutoModel(summary.model) ? " is-active" : ""}`}
              onClick={() => run(() => onSetModel(AUTO_MODEL))}
            >
              <span className="composer-mobile-menu-row-main">
                <span className="composer-mobile-menu-row-title">Auto</span>
                <span className="composer-mobile-menu-row-sub">Best model for each task</span>
              </span>
              {isAutoModel(summary.model) ? <span className="composer-mobile-menu-check">✓</span> : null}
            </button>
            {(filteredModels.length ? filteredModels : models).slice(0, 24).map((m) => {
              const id = m.id ?? m.label;
              const active = !isAutoModel(summary.model) && summary.model === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`composer-mobile-menu-row${active ? " is-active" : ""}`}
                  onClick={() => run(() => onSetModel(id))}
                >
                  <span className="truncate">{m.label ?? id}</span>
                  {active ? <span className="composer-mobile-menu-check">✓</span> : null}
                </button>
              );
            })}
          </section>

          {summary.isCustom && onResetDefaults ? (
            <button
              type="button"
              className="composer-mobile-menu-row is-muted"
              onClick={() => run(onResetDefaults)}
            >
              Reset to global defaults
            </button>
          ) : null}

          {toolActions.length ? (
            <section className="composer-mobile-menu-section" aria-label="Tools">
              <p className="composer-mobile-menu-label">Tools</p>
              {toolActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="desk-mobile-sheet-action composer-mobile-menu-tool"
                  onClick={action.onPress}
                  disabled={action.id === "heal" && healBusy}
                >
                  {action.icon ? (
                    <Icon name={action.icon} size={18} className="desk-mobile-sheet-action-icon" />
                  ) : null}
                  <span>{action.label}</span>
                </button>
              ))}
            </section>
          ) : null}
        </div>

        <button type="button" className="desk-mobile-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
