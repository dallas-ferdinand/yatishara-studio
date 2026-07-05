"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  SCHEMES,
  STUDIO_BACKGROUND_PACKS,
  getAppearanceMode,
  getSchemeId,
  getStudioBackgroundPack,
  setAppearanceMode,
  setColorScheme,
  setStudioBackgroundPack,
} from "@/mos-app/theme.js";

export function ThemeSettings() {
  const [scheme, setScheme] = useState("gold");
  const [mode, setMode] = useState("dark");
  const [bgPack, setBgPack] = useState("worlds");

  useEffect(() => {
    setScheme(getSchemeId() ?? "gold");
    setMode(getAppearanceMode());
    setBgPack(getStudioBackgroundPack() ?? "worlds");
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ schemeId?: string; mode?: string; bgPack?: string }>).detail;
      if (detail?.schemeId) setScheme(detail.schemeId);
      if (detail?.mode) setMode(detail.mode);
      if (detail?.bgPack) setBgPack(detail.bgPack);
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

  const pickBgPack = (id: string) => {
    setBgPack(id);
    setStudioBackgroundPack(id);
  };

  return (
    <section className="cursor-settings-section">
      <h3>Appearance</h3>
      <p className="text-xs text-cursor-muted mb-3 leading-relaxed">
        Theme changes the app tone and the Studio background. Scenes shows an illustrated cartoon wallpaper; Clean uses theme colors only.
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
      <div className="cursor-seg mb-4">
        {Object.entries(STUDIO_BACKGROUND_PACKS).map(([id, pack]) => (
          <button key={id} type="button" className={bgPack === id ? "active" : ""} onClick={() => pickBgPack(id)}>
            {pack.label}
          </button>
        ))}
      </div>

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
