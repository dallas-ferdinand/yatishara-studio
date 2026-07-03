"use client";

import { useEffect, useState } from "react";
import { mercuryLogoAssets, mercuryLogoSidebarSrc, type AppearanceMode } from "@/lib/brand-assets";

export function readAppearanceMode(): AppearanceMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.appearance === "light" ? "light" : "dark";
}

export function useAppearanceMode(): AppearanceMode {
  const [mode, setMode] = useState<AppearanceMode>(() => readAppearanceMode());

  useEffect(() => {
    const sync = () => setMode(readAppearanceMode());
    sync();
    window.addEventListener("mercuryos-theme-change", sync);
    return () => window.removeEventListener("mercuryos-theme-change", sync);
  }, []);

  return mode;
}

export function useMercurySidebarLogo() {
  const appearance = useAppearanceMode();
  return mercuryLogoSidebarSrc(appearance);
}

export function useMercuryLogoAssets(cssPx: number) {
  const appearance = useAppearanceMode();
  return mercuryLogoAssets(cssPx, appearance);
}
