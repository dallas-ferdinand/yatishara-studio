import {
  normalizeStudioBackgroundFamily,
  studioBackgroundCssValue,
  studioBackgroundPath,
} from "@/studio/lib/studio-background-registry";
import {
  DEFAULT_WALLPAPER,
  getCurrentWallpaper,
  getUrlHint,
  readWallpaperState,
  type WallpaperRef,
} from "@/studio/lib/wallpaper-state";

function paintWallpaper(path: string | null) {
  const root = document.documentElement;
  const value = studioBackgroundCssValue(path);
  root.style.setProperty("--studio-active-bg", value);
  if (path) {
    root.style.setProperty("--studio-loaded-bg", `url("${path}")`);
  } else {
    root.style.removeProperty("--studio-loaded-bg");
  }
}

export function resolveWallpaperImageUrl(
  ref: WallpaperRef = getCurrentWallpaper(),
  appearance?: "light" | "dark",
): string | null {
  const mode =
    appearance
    ?? (typeof document !== "undefined" && document.documentElement.dataset.appearance === "light"
      ? "light"
      : "dark");

  if (ref.kind === "preset") {
    return studioBackgroundPath(ref.family, ref.themeId, mode);
  }
  return getUrlHint(ref);
}

function probeAndPaint(primary: string, fallback: string | null) {
  paintWallpaper(primary);
  if (!fallback || fallback === primary) return;

  const probe = new Image();
  probe.onload = () => {
    paintWallpaper(primary);
  };
  probe.onerror = () => {
    paintWallpaper(fallback);
  };
  probe.src = primary;
}

async function handleAssetMissing(assetId: string) {
  try {
    const theme = await import("@/mos-app/theme.js");
    theme.fallbackWallpaper?.(assetId);
  } catch {
    // Theme module unavailable — leave painted state as-is.
  }
}

/** Apply wallpaper CSS vars from wallpaper-first state (preset or asset URL hint). */
export function applyStudioBackgroundNow() {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const appearance = root.dataset.appearance === "light" ? "light" : "dark";
  const state = readWallpaperState();
  const current = state.current;

  if (current.kind === "asset") {
    const hint = getUrlHint(current);
    if (!hint) {
      // No URL yet — paint default preset until signed URL is refreshed.
      const fallback = studioBackgroundPath(
        DEFAULT_WALLPAPER.family,
        DEFAULT_WALLPAPER.themeId,
        appearance,
      );
      paintWallpaper(fallback);
      return;
    }

    paintWallpaper(hint);
    const probe = new Image();
    probe.onload = () => {
      paintWallpaper(hint);
    };
    probe.onerror = () => {
      void handleAssetMissing(current.assetId);
    };
    probe.src = hint;
    return;
  }

  const family = normalizeStudioBackgroundFamily(current.family);
  const themeId = current.themeId || "agent";
  const primary = studioBackgroundPath(family, themeId, appearance);
  const animated = studioBackgroundPath("animated", themeId, appearance);

  if (!primary || family === "animated" || primary === animated) {
    paintWallpaper(primary ?? animated);
    return;
  }

  probeAndPaint(primary, animated);
}
