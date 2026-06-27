"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  SCHEMES,
  getAppearanceMode,
  getSchemeId,
  setAppearanceMode,
  setColorScheme,
} from "@/mos-app/theme.js";

export function ThemeSettings() {
  const [scheme, setScheme] = useState("gold");
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    setScheme(getSchemeId() ?? "gold");
    setMode(getAppearanceMode());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ schemeId?: string; mode?: string }>).detail;
      if (detail?.schemeId) setScheme(detail.schemeId);
      if (detail?.mode) setMode(detail.mode);
    };
    window.addEventListener("mercuryos-theme-change", onChange);
    return () => window.removeEventListener("mercuryos-theme-change", onChange);
  }, []);

  const pickScheme = (id: string) => {
    setScheme(id);
    setColorScheme(id);
  };

  const pickMode = (next: "light" | "dark") => {
    setMode(next);
    setAppearanceMode(next);
  };

  return (
    <section className="cursor-settings-section">
      <h3>Appearance</h3>
      <p className="text-xs text-cursor-muted mb-3 leading-relaxed">
        Accent color and light/dark mode apply across the desk — sidebar, editor, chat, and settings.
      </p>

      <p className="text-xs text-cursor-muted mb-2">Mode</p>
      <div className="cursor-seg mb-4">
        <button type="button" className={mode === "dark" ? "active" : ""} onClick={() => pickMode("dark")}>
          <Icon name="moon" size={12} /> Dark
        </button>
        <button type="button" className={mode === "light" ? "active" : ""} onClick={() => pickMode("light")}>
          <Icon name="sun" size={12} /> Light
        </button>
      </div>

      <p className="text-xs text-cursor-muted mb-2">Color theme</p>
      <div className="cursor-theme-grid" role="listbox" aria-label="Color theme">
        {Object.entries(SCHEMES).map(([id, t]) => (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={scheme === id}
            className={`theme-chip${scheme === id ? " active" : ""}`}
            data-theme={id}
            onClick={() => pickScheme(id)}
          >
            <span className="theme-chip-swatch" style={{ background: t.accent }} aria-hidden="true" />
            <span className="theme-chip-label">{t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
