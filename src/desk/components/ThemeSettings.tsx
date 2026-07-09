"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  SCHEMES,
  STUDIO_BACKGROUND_FAMILIES,
  getAppearanceMode,
  getSchemeId,
  getStudioBackgroundFamily,
  setAppearanceMode,
  setColorScheme,
  setStudioBackgroundFamily,
} from "@/mos-app/theme.js";

export function ThemeSettings() {
  const [scheme, setScheme] = useState("gold");
  const [mode, setMode] = useState("dark");
  const [bgFamily, setBgFamily] = useState("animated");

  useEffect(() => {
    setScheme(getSchemeId() ?? "gold");
    setMode(getAppearanceMode());
    setBgFamily(getStudioBackgroundFamily() ?? "animated");
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ schemeId?: string; mode?: string; bgFamily?: string; bgPack?: string }>).detail;
      if (detail?.schemeId) setScheme(detail.schemeId);
      if (detail?.mode) setMode(detail.mode);
      if (detail?.bgFamily) setBgFamily(detail.bgFamily);
      else if (detail?.bgPack) setBgFamily(detail.bgPack === "worlds" ? "animated" : detail.bgPack);
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

  const pickBgFamily = (id: string) => {
    setBgFamily(id);
    setStudioBackgroundFamily(id);
  };

  const activeFamily = STUDIO_BACKGROUND_FAMILIES[bgFamily] ?? STUDIO_BACKGROUND_FAMILIES.animated;

  return (
    <section className="cursor-settings-section">
      <h3>Appearance</h3>
      <p className="text-xs text-cursor-muted mb-3 leading-relaxed">
        Theme changes the app tone and Studio background. Pick a background style, then an accent theme.
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

      <p className="text-xs text-cursor-muted mb-2">Background style</p>
      <div className="cursor-seg cursor-seg-wrap mb-1">
        {Object.entries(STUDIO_BACKGROUND_FAMILIES).map(([id, family]) => (
          <button key={id} type="button" className={bgFamily === id ? "active" : ""} onClick={() => pickBgFamily(id)}>
            {family.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-cursor-muted mb-4 leading-relaxed">{activeFamily.description}</p>

      <p className="text-xs text-cursor-muted mb-2">Theme</p>
      <div className="cursor-theme-grid" role="listbox" aria-label="Theme">
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
