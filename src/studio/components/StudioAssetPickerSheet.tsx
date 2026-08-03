"use client";

import { useQuery } from "convex/react";
import { Check, ChevronLeft, ChevronRight, FileText, Folder, Clapperboard, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";
import "./studio-asset-picker.css";

export type StudioShareItemKind =
  | "asset"
  | "document"
  | "element"
  | "videoEdit"
  | "folder";

export type StudioAssetPick = {
  _id: string;
  name: string;
  kind: string;
  mimeType: string;
  signedThumbnailUrl?: string;
  itemKind?: StudioShareItemKind;
  itemId?: string;
  studioKind?: string;
};

type FolderCrumb = { id: Id<"folders"> | null; name: string };

type StudioAssetPickerSheetProps = {
  title: string;
  /** Filter by asset kind. Default: images only. Ignored when pickAnyStudio. */
  kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
  /** Pick any Studio entry (assets, docs, elements, edits, folders). */
  pickAnyStudio?: boolean;
  /** Currently selected ids (highlight). */
  selectedIds?: ReadonlyArray<string>;
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
  pickAnyStudio = false,
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
  const shareableFolders = useMemo(
    () => (folders ?? []).filter((folder) => !folder.systemKind),
    [folders],
  );
  const folderAssets = useQuery(
    api.assets.listByFolder,
    current.id ? { folderId: current.id, expiresUnix } : "skip",
  );
  const documents = useQuery(
    api.documents.listByFolder,
    pickAnyStudio && current.id ? { folderId: current.id } : "skip",
  );
  const videoEdits = useQuery(
    api.videoEdits.listByFolder,
    pickAnyStudio && current.id
      ? { folderId: current.id, expiresUnix }
      : "skip",
  );
  const elements = useQuery(
    api.elements.list,
    pickAnyStudio && current.id ? { folderId: current.id } : "skip",
  );

  const assets = useMemo(() => {
    const rows = folderAssets ?? [];
    if (pickAnyStudio) return rows;
    return rows.filter((asset) => kindSet.has(asset.kind));
  }, [folderAssets, kindSet, pickAnyStudio]);

  const loading =
    folders === undefined ||
    (current.id !== null && folderAssets === undefined) ||
    (pickAnyStudio &&
      current.id !== null &&
      (documents === undefined ||
        videoEdits === undefined ||
        elements === undefined));
  const empty =
    !loading &&
    shareableFolders.length === 0 &&
    assets.length === 0 &&
    (documents?.length ?? 0) === 0 &&
    (videoEdits?.length ?? 0) === 0 &&
    (elements?.length ?? 0) === 0;

  function atCap(id: string) {
    return (
      multi &&
      maxSelected != null &&
      !selectedIds.includes(id) &&
      selectedIds.length >= maxSelected
    );
  }

  function pickItem(pick: StudioAssetPick) {
    onPick(pick);
    if (!multi && !stayOpen) onClose();
  }

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
            {shareableFolders.length > 0 ? (
              <div className="studio-asset-picker-folders">
                {shareableFolders.map((folder) => {
                  const selected = selectedIds.includes(folder._id);
                  const capped = atCap(folder._id);
                  return (
                    <div
                      key={folder._id}
                      className={`studio-asset-picker-folder-row${
                        selected ? " is-selected" : ""
                      }`}
                    >
                      <button
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
                        <ChevronRight
                          className="studio-asset-picker-folder-chevron"
                          aria-hidden="true"
                        />
                      </button>
                      {pickAnyStudio ? (
                        <button
                          type="button"
                          className="studio-asset-picker-folder-select"
                          aria-label={
                            selected
                              ? `Deselect ${folder.name}`
                              : `Share ${folder.name}`
                          }
                          aria-pressed={selected}
                          disabled={capped}
                          onClick={() =>
                            pickItem({
                              _id: folder._id,
                              name: folder.name,
                              kind: "folder",
                              mimeType: "",
                              itemKind: "folder",
                              itemId: folder._id,
                              studioKind: "folder",
                            })
                          }
                        >
                          <Check aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {pickAnyStudio && (documents?.length ?? 0) > 0 ? (
              <div
                className="studio-asset-picker-list"
                role="group"
                aria-label="Scripts in this folder"
              >
                {(documents ?? []).map((doc) => {
                  const selected = selectedIds.includes(doc._id);
                  return (
                    <button
                      key={doc._id}
                      type="button"
                      className={`studio-asset-picker-list-item${
                        selected ? " is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      disabled={atCap(doc._id)}
                      onClick={() =>
                        pickItem({
                          _id: doc._id,
                          name: doc.title || "Script",
                          kind: "document",
                          mimeType: "text/markdown",
                          itemKind: "document",
                          itemId: doc._id,
                          studioKind: "document",
                        })
                      }
                    >
                      <FileText aria-hidden="true" />
                      <span>{doc.title || "Script"}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {pickAnyStudio && (elements?.length ?? 0) > 0 ? (
              <div
                className="studio-asset-picker-list"
                role="group"
                aria-label="Elements in this folder"
              >
                {(elements ?? []).map((element) => {
                  const selected = selectedIds.includes(element._id);
                  const name = element.name?.startsWith("@")
                    ? element.name
                    : `@${element.name || "element"}`;
                  return (
                    <button
                      key={element._id}
                      type="button"
                      className={`studio-asset-picker-list-item${
                        selected ? " is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      disabled={atCap(element._id)}
                      onClick={() =>
                        pickItem({
                          _id: element._id,
                          name,
                          kind: "element",
                          mimeType: "",
                          itemKind: "element",
                          itemId: element._id,
                          studioKind: "element",
                        })
                      }
                    >
                      <Sparkles aria-hidden="true" />
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {pickAnyStudio && (videoEdits?.length ?? 0) > 0 ? (
              <div
                className="studio-asset-picker-list"
                role="group"
                aria-label="Edits in this folder"
              >
                {(videoEdits ?? []).map((edit) => {
                  const selected = selectedIds.includes(edit._id);
                  const name = edit.name || "Edit";
                  return (
                    <button
                      key={edit._id}
                      type="button"
                      className={`studio-asset-picker-list-item${
                        selected ? " is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      disabled={atCap(edit._id)}
                      onClick={() =>
                        pickItem({
                          _id: edit._id,
                          name,
                          kind: "videoEdit",
                          mimeType: "",
                          signedThumbnailUrl: edit.signedThumbnailUrl,
                          itemKind: "videoEdit",
                          itemId: edit._id,
                          studioKind: "videoEdit",
                        })
                      }
                    >
                      <Clapperboard aria-hidden="true" />
                      <span>{name}</span>
                    </button>
                  );
                })}
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
                  return (
                    <button
                      key={asset._id}
                      type="button"
                      className={selected ? "is-selected" : undefined}
                      aria-pressed={selected}
                      disabled={atCap(asset._id)}
                      onClick={() => {
                        pickItem({
                          _id: asset._id,
                          name: asset.name,
                          kind: asset.kind,
                          mimeType: asset.mimeType,
                          signedThumbnailUrl: asset.signedThumbnailUrl,
                          itemKind: "asset",
                          itemId: asset._id,
                          studioKind: "asset",
                        });
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
          {pickAnyStudio && current.id ? (
            <button
              type="button"
              className="studio-asset-picker-done is-secondary"
              disabled={atCap(current.id) && !selectedIds.includes(current.id)}
              onClick={() =>
                pickItem({
                  _id: current.id!,
                  name: current.name,
                  kind: "folder",
                  mimeType: "",
                  itemKind: "folder",
                  itemId: current.id!,
                  studioKind: "folder",
                })
              }
            >
              <Folder aria-hidden="true" />
              {selectedIds.includes(current.id)
                ? "Folder selected"
                : "Add this folder"}
            </button>
          ) : null}
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
