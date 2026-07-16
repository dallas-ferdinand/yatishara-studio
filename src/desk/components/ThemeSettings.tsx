"use client";

import { useConvex, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Icon } from "./Icons";
import {
  SCHEMES,
  getAppearanceMode,
  getWallpaperState,
  removeSavedWallpaper,
  setAppearanceMode,
  setWallpaper,
} from "@/mos-app/theme.js";
import { listStudioWallpaperPresets } from "@/studio/lib/studio-background-registry";
import type { WallpaperRef } from "@/studio/lib/wallpaper-state";
import { wallpaperKey } from "@/studio/lib/wallpaper-state";

function wallpaperEquals(a: WallpaperRef | null | undefined, b: WallpaperRef): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "preset" && b.kind === "preset") {
    return a.family === b.family && a.themeId === b.themeId;
  }
  if (a.kind === "asset" && b.kind === "asset") {
    return a.assetId === b.assetId;
  }
  return false;
}

export function ThemeSettings() {
  const convex = useConvex();
  const currentUser = useQuery(api.users.current, {});
  const hasCurrentUser = currentUser !== undefined && currentUser !== null;
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [wallpaper, setWallpaperState] = useState<WallpaperRef | null>(null);
  const [savedAssetIds, setSavedAssetIds] = useState<string[]>([]);
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);

  const syncFromStorage = () => {
    const state = getWallpaperState();
    setWallpaperState(state.current);
    setSavedAssetIds(state.savedAssetIds);
    setMode(getAppearanceMode());
  };

  useEffect(() => {
    syncFromStorage();
    const onChange = () => syncFromStorage();
    window.addEventListener("mercuryos-theme-change", onChange);
    return () => window.removeEventListener("mercuryos-theme-change", onChange);
  }, []);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, scheme] of Object.entries(SCHEMES)) {
      map[id] = scheme.label;
    }
    return map;
  }, []);

  const presets = useMemo(() => listStudioWallpaperPresets(labels), [labels]);

  const savedIdsTyped = savedAssetIds as Id<"assets">[];
  const savedAssetsRaw = useQuery(
    api.assets.listByIds,
    hasCurrentUser && savedIdsTyped.length > 0
      ? { assetIds: savedIdsTyped, expiresUnix, quality: "preview" as const }
      : "skip",
  );
  type SavedWallpaperAsset = {
    _id: Id<"assets">;
    name: string;
    signedThumbnailUrl?: string;
    signedReadUrl?: string;
  };
  const savedAssets = savedAssetsRaw as SavedWallpaperAsset[] | undefined;

  useEffect(() => {
    if (!savedAssets || savedAssetIds.length === 0) return;
    const found = new Set(savedAssets.map((a) => a._id as string));
    const missing = savedAssetIds.filter((id) => !found.has(id));
    if (missing.length === 0) return;
    for (const id of missing) {
      removeSavedWallpaper(id);
    }
  }, [savedAssets, savedAssetIds]);

  useEffect(() => {
    if (!hasCurrentUser || !wallpaper || wallpaper.kind !== "asset") return;
    let cancelled = false;
    void (async () => {
      try {
        const url = await convex.query(api.assets.signedReadUrl, {
          assetId: wallpaper.assetId as Id<"assets">,
          expiresUnix,
        });
        if (cancelled || !url) return;
        const { refreshAssetWallpaperUrl } = await import("@/mos-app/theme.js");
        refreshAssetWallpaperUrl(wallpaper.assetId, url);
      } catch {
        const { fallbackWallpaper } = await import("@/mos-app/theme.js");
        fallbackWallpaper(wallpaper.assetId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convex, expiresUnix, hasCurrentUser, wallpaper]);

  const pickMode = (next: "light" | "dark") => {
    setMode(next);
    setAppearanceMode(next);
  };

  const pickPreset = (family: "animated" | "cinematic", themeId: string) => {
    void setWallpaper({ kind: "preset", family, themeId });
  };

  const pickSaved = async (assetId: string, url?: string | null) => {
    let resolved = url ?? undefined;
    if (!resolved) {
      try {
        resolved = await convex.query(api.assets.signedReadUrl, {
          assetId: assetId as Id<"assets">,
          expiresUnix,
        });
      } catch {
        resolved = undefined;
      }
    }
    void setWallpaper({ kind: "asset", assetId }, { url: resolved });
  };

  const thumbForPreset = (pathDark: string, pathLight: string) =>
    mode === "light" ? pathLight : pathDark;

  return (
    <section className="cursor-settings-section studio-settings-appearance">
      <div className="studio-settings-appearance-group studio-appearance-mode-group">
        <div className="studio-appearance-mode-switcher" role="group" aria-label="Mode">
          <button
            type="button"
            className={`studio-appearance-mode-pill${mode === "dark" ? " is-active" : ""}`}
            onClick={() => pickMode("dark")}
          >
            <Icon name="moon" size={12} />
            <span>Dark</span>
          </button>
          <button
            type="button"
            className={`studio-appearance-mode-pill${mode === "light" ? " is-active" : ""}`}
            onClick={() => pickMode("light")}
          >
            <Icon name="sun" size={12} />
            <span>Light</span>
          </button>
        </div>
      </div>

      <div className="studio-settings-appearance-group">
        <div className="wallpaper-theme-grid" role="listbox" aria-label="Wallpapers">
          {presets.map((preset) => {
            const ref: WallpaperRef = {
              kind: "preset",
              family: preset.family,
              themeId: preset.themeId,
            };
            const selected = wallpaperEquals(wallpaper, ref);
            const thumb = thumbForPreset(preset.pathDark, preset.pathLight);
            return (
              <button
                key={wallpaperKey(ref)}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`${preset.label} (${preset.family})`}
                title={`${preset.label} · ${preset.family}`}
                className={`wallpaper-theme-tile${selected ? " active" : ""}`}
                onClick={() => pickPreset(preset.family, preset.themeId)}
                style={{ backgroundImage: `url("${thumb}")` }}
              >
                <span className="wallpaper-theme-tile-label">{preset.label}</span>
              </button>
            );
          })}

          {savedAssetIds.map((assetId) => {
            const asset = savedAssets?.find((a) => a._id === assetId);
            const thumb =
              asset?.signedThumbnailUrl
              ?? asset?.signedReadUrl
              ?? getWallpaperState().urlHints[`asset:${assetId}`]
              ?? "";
            const ref: WallpaperRef = { kind: "asset", assetId };
            const selected = wallpaperEquals(wallpaper, ref);
            return (
              <div key={assetId} className={`wallpaper-theme-tile-wrap${selected ? " active" : ""}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={asset?.name ?? "Saved wallpaper"}
                  title={asset?.name ?? "Saved wallpaper"}
                  className={`wallpaper-theme-tile${selected ? " active" : ""}`}
                  onClick={() =>
                    void pickSaved(assetId, asset?.signedReadUrl ?? asset?.signedThumbnailUrl)
                  }
                  style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                >
                  <span className="wallpaper-theme-tile-label">
                    {asset?.name ?? "Wallpaper"}
                  </span>
                </button>
                <button
                  type="button"
                  className="wallpaper-theme-unpin"
                  aria-label="Remove saved wallpaper"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSavedWallpaper(assetId);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
