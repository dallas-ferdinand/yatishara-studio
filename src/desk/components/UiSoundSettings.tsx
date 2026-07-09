"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  DEFAULT_UI_SOUND_PREFS,
  readUiSoundPrefs,
  uiSoundsReducedBySystem,
} from "@/mos-app/sound-prefs.js";
import {
  getUiSoundPrefs,
  playUiSound,
  setUiSoundPrefs,
  subscribeUiSoundPrefs,
} from "@/mos-app/sounds.js";

const PREVIEW_SOUNDS = [
  { id: "tap", label: "Tap" },
  { id: "shuffle", label: "Shuffle" },
  { id: "button", label: "Button" },
  { id: "select", label: "Select" },
  { id: "send", label: "Send" },
  { id: "success", label: "Success" },
] as const;

type UiSoundPrefs = { enabled: boolean; volume: number };

export function UiSoundSettings() {
  const [prefs, setPrefs] = useState<UiSoundPrefs>(DEFAULT_UI_SOUND_PREFS);
  const [mounted, setMounted] = useState(false);
  const systemReduced = mounted && uiSoundsReducedBySystem();

  useEffect(() => {
    const initial = readUiSoundPrefs();
    setPrefs(initial);
    setUiSoundPrefs(initial);
    setMounted(true);
    const unsubscribe = subscribeUiSoundPrefs(() => {
      setPrefs(getUiSoundPrefs());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const persist = (next: UiSoundPrefs) => {
    setPrefs(next);
    setUiSoundPrefs(next);
  };

  return (
    <section className="cursor-settings-section">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3>UI sounds</h3>
          <p className="text-xs text-cursor-muted leading-relaxed">
            Subtle taps and chimes on buttons, tabs, and the logo shuffle.
          </p>
        </div>
        <button
          type="button"
          className={`cursor-icon-btn shrink-0 ${prefs.enabled ? "text-cursor-text" : "text-cursor-muted"}`}
          aria-pressed={prefs.enabled}
          aria-label={prefs.enabled ? "Mute UI sounds" : "Enable UI sounds"}
          disabled={!mounted}
          onClick={() => persist({ ...prefs, enabled: !prefs.enabled })}
        >
          <Icon name={prefs.enabled ? "volume" : "volumeOff"} size={16} />
        </button>
      </div>

      {systemReduced ? (
        <p className="rounded-md bg-cursor-hover/40 px-2.5 py-2 text-xs text-cursor-muted mb-3">
          System <strong>Reduce motion</strong> is on — UI sounds stay muted until you turn that off.
        </p>
      ) : null}

      <div className={!prefs.enabled ? "opacity-60" : ""}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs text-cursor-muted">Volume</span>
          <span className="text-xs tabular-nums text-cursor-muted">{Math.round(prefs.volume * 100)}%</span>
        </div>
        <input
          id="ui-sound-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(prefs.volume * 100)}
          disabled={!mounted || !prefs.enabled || systemReduced}
          className="w-full h-2 cursor-pointer accent-[var(--accent)] mb-3"
          onChange={(event) => {
            const volume = Number(event.target.value) / 100;
            persist({ ...prefs, volume });
          }}
        />

        <div className="flex flex-wrap gap-1.5">
          {PREVIEW_SOUNDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cursor-settings-action !py-1 !px-2 text-xs"
              disabled={!mounted || !prefs.enabled || systemReduced}
              onClick={() => playUiSound(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
