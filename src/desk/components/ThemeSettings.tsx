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

  return (
    <section className="cursor-settings-section studio-settings-appearance">
      <div className="studio-settings-appearance-group">
        <div className="cursor-seg" role="group" aria-label="Mode">
          <button type="button" className={mode === "dark" ? "active" : ""} onClick={() => pickMode("dark")}>
            <Icon name="moon" size={12} /> Dark
          </button>
          <button type="button" className={mode === "light" ? "active" : ""} onClick={() => pickMode("light")}>
            <Icon name="sun" size={12} /> Light
          </button>
        </div>
      </div>

      <div className="studio-settings-appearance-group">
        <div className="cursor-seg cursor-seg-wrap" role="group" aria-label="Background">
          {Object.entries(STUDIO_BACKGROUND_FAMILIES).map(([id, family]) => (
            <button key={id} type="button" className={bgFamily === id ? "active" : ""} onClick={() => pickBgFamily(id)}>
              {family.label}
            </button>
          ))}
        </div>
      </div>

      <div className="studio-settings-appearance-group">
        <div className="cursor-theme-grid is-compact" role="listbox" aria-label="Accent">
          {Object.entries(SCHEMES).map(([id, t]) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={scheme === id}
              aria-label={t.label}
              title={t.label}
              className={`theme-chip theme-chip-swatch-only${scheme === id ? " active" : ""}`}
              data-theme={id}
              onClick={() => pickScheme(id)}
            >
              <span className="theme-chip-swatch" style={{ background: t.accent }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
