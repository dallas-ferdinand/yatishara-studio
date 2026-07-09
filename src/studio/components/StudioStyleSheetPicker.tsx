"use client";

import { useEffect } from "react";
import { Palette, Plus, X } from "lucide-react";

export function StudioStyleSheetPickerPanel({
  styleSheets,
  assets = [],
  selectedMode,
  activeStyleSheetId,
  onSelectDirect,
  onSelectStyleSheet,
  onClose,
  onCreateStyleSheet,
}) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const userSheets = [...(styleSheets ?? [])]
    .filter((sheet) => !sheet.deletedAt)
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
            <div className="studio-preset-grid-thumb is-direct-clean" aria-hidden="true" />
            <div className="studio-preset-grid-copy">
              <strong>Direct</strong>
              <span className="text-xs text-cursor-muted">Prompt goes straight to the model</span>
            </div>
          </button>
          {userSheets.map((sheet) => {
            const active = selectedMode === "styled" && activeStyleSheetId === sheet._id;
            const thumbAsset = assets.find(
              (asset) => asset._id === sheet.sheetAssetId || asset.studioId === sheet.sheetAssetId,
            );
            const isBuilt = Boolean(sheet.sheetAssetId || sheet.styleRules?.trim());
            return (
              <button
                key={sheet._id}
                type="button"
                role="option"
                aria-selected={active}
                className={`studio-preset-grid-card${active ? " is-active" : ""}`}
                onClick={() => onSelectStyleSheet(sheet._id)}
              >
                <div className="studio-preset-grid-thumb">
                  {thumbAsset?.previewUrl || thumbAsset?.mediaUrl ? (
                    <img src={thumbAsset.previewUrl ?? thumbAsset.mediaUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="studio-preset-grid-thumb-fallback">
                      <Palette className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="studio-preset-grid-copy">
                  <strong>{sheet.name}</strong>
                  <span className="text-xs text-cursor-muted">
                    {isBuilt
                      ? (sheet.renderMode?.replace(/_/g, " ") ?? "Style Sheet")
                      : "Draft — add rules or build sheet"}
                  </span>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="studio-preset-grid-card studio-preset-grid-card--create"
            onClick={onCreateStyleSheet}
          >
            <div className="studio-preset-grid-thumb is-create-sheet">
              <span className="studio-preset-grid-thumb-fallback">
                <Plus className="h-6 w-6" aria-hidden="true" />
              </span>
            </div>
            <div className="studio-preset-grid-copy">
              <strong>Create Style Sheet</strong>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export function StudioStyleSheetTriggerButton({
  selectedMode,
  activeSheet,
  activeSheetAsset,
  open,
  onClick,
  panel = false,
}) {
  const label =
    selectedMode === "direct"
      ? "Direct"
      : activeSheet?.name ?? "Style Sheet";
  const sheetThumb = activeSheetAsset?.previewUrl ?? activeSheetAsset?.mediaUrl;
  return (
    <button
      type="button"
      className={`studio-pill-btn studio-preset-trigger${open ? " is-open" : ""}${panel ? " is-panel" : ""}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={label ? `Style: ${label}` : "Choose style"}
      title={label ?? "Choose style"}
      onClick={onClick}
    >
      <span className="studio-preset-trigger-thumb">
        {selectedMode === "direct" ? (
          <span className="studio-preset-grid-thumb is-direct-clean studio-preset-trigger-direct" aria-hidden="true" />
        ) : sheetThumb ? (
          <img src={sheetThumb} alt="" className="studio-preset-trigger-sheet-img" />
        ) : (
          <span className="studio-preset-grid-thumb-fallback">
            <Palette className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="studio-preset-trigger-copy">{label ?? "Style"}</span>
    </button>
  );
}
