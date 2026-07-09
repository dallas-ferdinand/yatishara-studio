import {
  normalizeStudioBackgroundFamily,
  studioBackgroundCssValue,
  studioBackgroundPath,
} from "@/studio/lib/studio-background-registry";

const SCHEME_KEY = "mercuryos-theme-v1";
const BG_PACK_KEY = "mercuryos-studio-bg-pack-v1";

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

/** Apply wallpaper CSS vars — probes family asset and falls back to animated on 404. */
export function applyStudioBackgroundNow() {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const family = normalizeStudioBackgroundFamily(
    root.dataset.studioBgFamily
      ?? root.dataset.studioBgPack
      ?? localStorage.getItem(BG_PACK_KEY),
  );
  const themeId = root.dataset.theme ?? localStorage.getItem(SCHEME_KEY) ?? "agent";
  const appearance = root.dataset.appearance === "light" ? "light" : "dark";

  const primary = studioBackgroundPath(family, themeId, appearance);
  const animated = studioBackgroundPath("animated", themeId, appearance);

  if (!primary || family === "animated" || primary === animated) {
    paintWallpaper(primary ?? animated);
    return;
  }

  paintWallpaper(primary);

  const probe = new Image();
  probe.onload = () => {
    paintWallpaper(primary);
  };
  probe.onerror = () => {
    paintWallpaper(animated);
  };
  probe.src = primary;
}
