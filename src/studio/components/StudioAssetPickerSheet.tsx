"use client";

import { useQuery } from "convex/react";
import { Check, ChevronLeft, Folder, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";
import "./studio-asset-picker.css";

export type StudioAssetPick = {
  _id: Id<"assets">;
  name: string;
  kind: string;
  mimeType: string;
  signedThumbnailUrl?: string;
};

type FolderCrumb = { id: Id<"folders"> | null; name: string };

type StudioAssetPickerSheetProps = {
  title: string;
  /** Filter by asset kind. Default: images only. */
  kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
  /** Currently selected ids (highlight). */
  selectedIds?: ReadonlyArray<Id<"assets">>;
  /** Multi-select (toggle). Single-select closes after pick unless `stayOpen`. */
  multi?: boolean;
  /** Keep sheet open after a single pick (e.g. gallery). */
  stayOpen?: boolean;
  maxSelected?: number;
  /** Count chip next to the crumb (e.g. "2/6"). */
  countLabel?: string;
  doneLabel?: string;
  expiresUnix: number;
  onPick: (asset: StudioAssetPick) => void;
  onClose: () => void;
  /** Footer Confirm/Done — defaults to onClose when omitted. */
  onDone?: () => void;
};

/**
 * Folder-browsing sheet for picking Studio Files assets.
 * Same chrome as other `studio-mobile-app-menu-sheet` surfaces; on desktop
 * it centers as a dialog (see studio-asset-picker.css).
 */
export function StudioAssetPickerSheet({
  title,
  kinds = ["image"],
  selectedIds = [],
  multi = false,
  stayOpen = false,
  maxSelected,
  countLabel,
  doneLabel = "Done",
  expiresUnix,
  onPick,
  onClose,
  onDone,
}: StudioAssetPickerSheetProps) {
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [stack, setStack] = useState<FolderCrumb[]>([
    { id: null, name: "Files" },
  ]);
  const current = stack[stack.length - 1];
  const kindSet = useMemo(() => new Set(kinds), [kinds]);

  useMobileBackLayer("asset-picker-sheet", true, onClose);

  useEffect(() => {
    setPortalRoot(document.querySelector(".studio-polish") ?? document.body);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const folders = useQuery(api.folders.listWithPeeks, {
    parentId: current.id,
  });
  const folderAssets = useQuery(
    api.assets.listByFolder,
    current.id ? { folderId: current.id, expiresUnix } : "skip",
  );
  const assets = useMemo(
    () => (folderAssets ?? []).filter((asset) => kindSet.has(asset.kind)),
    [folderAssets, kindSet],
  );

  const loading =
    folders === undefined || (current.id !== null && folderAssets === undefined);
  const empty =
    !loading && (folders?.length ?? 0) === 0 && assets.length === 0;

  if (!portalRoot) return null;

  return createPortal(
    <div
      className="studio-mobile-app-menu-sheet studio-asset-picker-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="studio-mobile-app-menu-head">
        <h2 className="studio-mobile-app-menu-title">{title}</h2>
        <button
          type="button"
          className="studio-mobile-app-menu-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="studio-mobile-app-menu-body">
        <div className="studio-asset-picker-crumbs">
          {stack.length > 1 ? (
            <button
              type="button"
              className="studio-asset-picker-back"
              onClick={() => setStack((s) => s.slice(0, -1))}
            >
              <ChevronLeft aria-hidden="true" />
              {stack[stack.length - 2].name}
            </button>
          ) : null}
          <span className="studio-asset-picker-here">{current.name}</span>
          {countLabel ? (
            <span className="studio-asset-picker-count">{countLabel}</span>
          ) : null}
        </div>

        {loading ? (
          <p className="studio-settings-empty">Loading…</p>
        ) : empty ? (
          <p className="studio-settings-empty">
            {current.id === null
              ? "No folders yet — upload media in Files first."
              : "Nothing usable in this folder."}
          </p>
        ) : (
          <>
            {(folders?.length ?? 0) > 0 ? (
              <div className="studio-asset-picker-folders">
                {(folders ?? []).map((folder) => (
                  <button
                    key={folder._id}
                    type="button"
                    className="studio-asset-picker-folder"
                    onClick={() =>
                      setStack((s) => [
                        ...s,
                        { id: folder._id, name: folder.name },
                      ])
                    }
                  >
                    <Folder aria-hidden="true" />
                    <span>{folder.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {assets.length > 0 ? (
              <div
                className="studio-asset-picker-grid"
                role="group"
                aria-label="Media in this folder"
              >
                {assets.map((asset) => {
                  const selected = selectedIds.includes(asset._id);
                  const atCap =
                    multi &&
                    maxSelected != null &&
                    !selected &&
                    selectedIds.length >= maxSelected;
                  return (
                    <button
                      key={asset._id}
                      type="button"
                      className={selected ? "is-selected" : undefined}
                      aria-pressed={selected}
                      disabled={atCap}
                      onClick={() => {
                        onPick({
                          _id: asset._id,
                          name: asset.name,
                          kind: asset.kind,
                          mimeType: asset.mimeType,
                          signedThumbnailUrl: asset.signedThumbnailUrl,
                        });
                        if (!multi && !stayOpen) onClose();
                      }}
                      title={asset.name}
                    >
                      {asset.signedThumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.signedThumbnailUrl} alt="" />
                      ) : (
                        <span
                          className="studio-asset-picker-thumb"
                          aria-hidden="true"
                        />
                      )}
                      <span>{asset.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
      {multi || stayOpen ? (
        <div className="studio-asset-picker-foot">
          <button
            type="button"
            className="studio-asset-picker-done"
            onClick={() => (onDone ?? onClose)()}
          >
            <Check aria-hidden="true" />
            {doneLabel}
          </button>
        </div>
      ) : null}
    </div>,
    portalRoot,
  );
}
