"use client";

import { useSyncExternalStore } from "react";
import { mercuryLogoAssets, mercuryLogoSidebarSrc, type AppearanceMode } from "@/lib/brand-assets";

export function readAppearanceMode(): AppearanceMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.appearance === "light" ? "light" : "dark";
}

function subscribeAppearance(onStoreChange: () => void) {
  window.addEventListener("mercuryos-theme-change", onStoreChange);
  return () => window.removeEventListener("mercuryos-theme-change", onStoreChange);
}

function getAppearanceServerSnapshot(): AppearanceMode {
  return "dark";
}

export function useAppearanceMode(): AppearanceMode {
  return useSyncExternalStore(
    subscribeAppearance,
    readAppearanceMode,
    getAppearanceServerSnapshot,
  );
}

export function useMercurySidebarLogo() {
  const appearance = useAppearanceMode();
  return mercuryLogoSidebarSrc(appearance);
}

export function useMercuryLogoAssets(cssPx: number) {
  const appearance = useAppearanceMode();
  return mercuryLogoAssets(cssPx, appearance);
}
