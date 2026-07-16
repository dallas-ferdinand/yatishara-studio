"use client";

import { useEffect } from "react";
import { Paintbrush, Palette, X } from "lucide-react";

type StyleSheetRow = {
  _id: string;
  name?: string;
  description?: string;
  deletedAt?: number;
  updatedAt?: number;
  _creationTime?: number;
  sheetAssetId?: string;
  sheetPreviewUrl?: string;
  styleRules?: string;
  renderMode?: string;
};

type AssetRow = {
  _id: string;
  studioId?: string;
  previewUrl?: string;
  mediaUrl?: string;
  signedReadUrl?: string;
  signedThumbnailUrl?: string;
};

function styleSheetThumbUrl(
  asset?: AssetRow | null,
  sheetPreviewUrl?: string,
): string | undefined {
  // Style cards should show full (or high-quality) sheet art — not grid thumbs.
  const candidates = [
    sheetPreviewUrl,
    asset?.signedReadUrl,
    asset?.mediaUrl,
    asset?.signedThumbnailUrl,
    asset?.previewUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !/^https?:\/\//i.test(candidate)) continue;
    try {
      const parsed = new URL(candidate);
      const isThumb =
        parsed.searchParams.has("width") ||
        parsed.searchParams.has("quality") ||
        parsed.searchParams.has("blur");
      if (!isThumb) return candidate;
    } catch {
      return candidate;
    }
  }
  return candidates.find(
    (candidate) => typeof candidate === "string" && /^https?:\/\//i.test(candidate),
  );
}

function styleSheetBlurb(sheet: StyleSheetRow): string {
  const description = sheet.description?.trim();
  if (description) return description;
  const firstRuleLine = sheet.styleRules
    ?.split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line && !line.startsWith("-") && !/^visual reference/i.test(line));
  if (firstRuleLine) return firstRuleLine;
  switch (sheet.renderMode) {
    case "photoreal":
      return "Live-action photographic realism";
    case "illustrated_2d":
      return "Illustrated 2D finish";
    case "illustrated_3d":
      return "Stylized 3D finish";
    case "mixed":
      return "Mixed photographic and illustrated finish";
    default:
      return "Custom look for your generation";
  }
}

/** UI label: prefer one word, never more than two. */
const STYLE_SHORT_NAMES: Record<string, string> = {
  primetime: "Primetime",
  cutaway: "Cutaway",
  "ink classic": "Ink Classic",
  "soft 3d": "Soft 3D",
  anime: "Anime",
  "cinematic anime": "Anime",
  realism: "Realism",
  "cinematic realism": "Realism",
  "no applied style": "None",
  direct: "None",
};

/** Allowed cartoon/world styles on the desk (everything else is retired). */
const STYLE_ALLOWED_KEYS = new Set([
  "primetime",
  "cutaway",
  "ink classic",
  "soft 3d",
  "anime",
  "realism",
  "cinematic realism",
  "cinematic anime",
]);

export function styleSheetShortName(name?: string | null): string {
  const raw = name?.trim();
  if (!raw) return "Style";
  const mapped = STYLE_SHORT_NAMES[raw.toLowerCase()];
  if (mapped) return mapped;
  const words = raw
    .replace(/[_./]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !/^(2d|3d|the|a|an)$/i.test(word));
  if (!words.length) return raw.slice(0, 12);
  if (words.length === 1) return words[0];
  const weak = /^(cinematic|premium|stylized|graphic|cartoon|storybook)$/i;
  if (weak.test(words[0]) && words[1]) return words[1];
  return `${words[0]} ${words[1]}`;
}

export function isHiddenStyleSheet(sheet: StyleSheetRow): boolean {
  const raw = sheet.name?.trim().toLowerCase() ?? "";
  if (!raw) return true;
  if (STYLE_ALLOWED_KEYS.has(raw)) return false;
  const short = styleSheetShortName(sheet.name).toLowerCase();
  return !STYLE_ALLOWED_KEYS.has(short);
}

type PickerPanelProps = {
  styleSheets?: StyleSheetRow[];
  assets?: AssetRow[];
  selectedMode: string;
  activeStyleSheetId?: string | null;
  onSelectDirect: () => void;
  onSelectStyleSheet: (id: string) => void;
  onClose: () => void;
};

export function StudioStyleSheetPickerPanel({
  styleSheets,
  assets = [],
  selectedMode,
  activeStyleSheetId,
  onSelectDirect,
  onSelectStyleSheet,
  onClose,
}: PickerPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const premadeSheets = [...(styleSheets ?? [])]
    .filter((sheet) => !sheet.deletedAt)
    .filter((sheet) => Boolean(sheet.sheetAssetId || sheet.styleRules?.trim()))
    .filter((sheet) => !isHiddenStyleSheet(sheet))
    .sort((a, b) => (b.updatedAt ?? b._creationTime ?? 0) - (a.updatedAt ?? a._creationTime ?? 0));

  return (
    <div className="studio-preset-grid-panel" role="dialog" aria-label="Choose style">
      <div className="studio-preset-grid-head">
        <strong>Style</strong>
        <button type="button" className="studio-preset-grid-close" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {styleSheets === undefined ? (
        <p className="px-2 text-xs text-cursor-muted">Loading…</p>
      ) : (
        <div className="studio-preset-grid" role="listbox" aria-label="Style options">
          <button
            type="button"
            role="option"
            aria-selected={selectedMode === "direct"}
            className={`studio-preset-grid-card${selectedMode === "direct" ? " is-active" : ""}`}
            onClick={onSelectDirect}
          >
            <div className="studio-preset-grid-thumb is-direct-clean" aria-hidden="true">
              <span className="studio-preset-grid-thumb-fallback studio-preset-direct-mark">
                <Paintbrush className="h-10 w-10" strokeWidth={1.75} aria-hidden="true" />
              </span>
            </div>
            <div className="studio-preset-grid-copy">
              <strong>None</strong>
            </div>
          </button>
          {premadeSheets.map((sheet) => {
            const active = selectedMode === "styled" && activeStyleSheetId === sheet._id;
            const thumbAsset = assets.find(
              (asset) => asset._id === sheet.sheetAssetId || asset.studioId === sheet.sheetAssetId,
            );
            const thumbUrl = styleSheetThumbUrl(thumbAsset, sheet.sheetPreviewUrl);
            const shortName = styleSheetShortName(sheet.name);
            return (
              <button
                key={sheet._id}
                type="button"
                role="option"
                aria-selected={active}
                className={`studio-preset-grid-card${active ? " is-active" : ""}`}
                onClick={() => onSelectStyleSheet(sheet._id)}
                title={sheet.name ? `${sheet.name} — ${styleSheetBlurb(sheet)}` : styleSheetBlurb(sheet)}
              >
                <div className="studio-preset-grid-thumb">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="studio-preset-grid-thumb-fallback">
                      <Palette className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="studio-preset-grid-copy">
                  <strong>{shortName}</strong>
                </div>
              </button>
            );
          })}
          {!premadeSheets.length ? (
            <p className="px-2 text-xs text-cursor-muted">Premade styles coming soon. None is available now.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

type TriggerButtonProps = {
  selectedMode: string;
  activeSheet?: StyleSheetRow | null;
  activeSheetAsset?: AssetRow | null;
  open: boolean;
  onClick: () => void;
  panel?: boolean;
};

export function StudioStyleSheetTriggerButton({
  selectedMode,
  activeSheet,
  activeSheetAsset,
  open,
  onClick,
  panel = false,
}: TriggerButtonProps) {
  const hasStyle = selectedMode !== "direct" && Boolean(activeSheet?.name);
  const label = hasStyle ? styleSheetShortName(activeSheet?.name) : "Style";
  const detailLabel = hasStyle ? (activeSheet?.name ?? label) : "None";
  const sheetThumb = styleSheetThumbUrl(activeSheetAsset, activeSheet?.sheetPreviewUrl);
  const iconSize = panel ? 16 : 14;
  const lead =
    hasStyle && sheetThumb ? (
      <span className="studio-preset-trigger-thumb">
        <img src={sheetThumb} alt="" className="studio-preset-trigger-sheet-img" />
      </span>
    ) : (
      <Paintbrush size={iconSize} strokeWidth={2.25} aria-hidden="true" />
    );
  if (panel) {
    return (
      <button
        type="button"
        className={`studio-composer-setting-card studio-preset-trigger is-panel${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={hasStyle ? `Style: ${label}` : "Choose style"}
        title={detailLabel}
        onClick={onClick}
      >
        <span className="studio-composer-setting-card-icon" aria-hidden="true">
          {lead}
        </span>
        <span className="studio-composer-setting-card-label">Style</span>
        <strong className="studio-composer-setting-card-value">{label}</strong>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`studio-pill-btn studio-preset-trigger${open ? " is-open" : ""}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={hasStyle ? `Style: ${label}` : "Choose style"}
      title={detailLabel}
      onClick={onClick}
    >
      {lead}
      <span className="studio-preset-trigger-copy">{label}</span>
    </button>
  );
}
