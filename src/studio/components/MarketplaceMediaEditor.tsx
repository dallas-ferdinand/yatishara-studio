"use client";

import { useQuery } from "convex/react";
import {
  Check,
  ChevronLeft,
  Film,
  Folder,
  Image as ImageIcon,
  MousePointerSquareDashed,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  EXPLORER_DND_TYPE,
  inferMediaKind,
  peekActiveExplorerDrag,
  readExplorerDragData,
} from "@/desk/lib/explorer-dnd";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

type SlotTarget = "banner" | "gallery";

const MAX_SAMPLES = 6;

function slotAcceptsKind(target: SlotTarget, kind: string | null): boolean {
  if (target === "banner") return kind === "image";
  return kind === "image" || kind === "video";
}

/** Explorer drag → asset id + media kind, or null when not an accepted asset. */
function readAssetDrop(
  event: DragEvent,
  target: SlotTarget,
): Id<"assets"> | null {
  const entry = readExplorerDragData(event.dataTransfer) as {
    studioKind?: string;
    studioId?: string;
  } | null;
  if (!entry || entry.studioKind !== "asset" || !entry.studioId) return null;
  if (!slotAcceptsKind(target, inferMediaKind(entry))) return null;
  return entry.studioId as Id<"assets">;
}

function isExplorerDrag(event: DragEvent): boolean {
  return [...(event.dataTransfer?.types ?? [])].includes(EXPLORER_DND_TYPE);
}

/** During dragOver getData is blocked — peek the module-level active drag. */
function dragAccepts(target: SlotTarget): boolean {
  const entry = peekActiveExplorerDrag() as {
    studioKind?: string;
  } | null;
  // Cross-window drags have no peek; allow the highlight and validate on drop.
  if (!entry) return true;
  if (entry.studioKind !== "asset") return false;
  return slotAcceptsKind(target, inferMediaKind(entry));
}

export function OfferMediaEditor({
  coverAssetId,
  sampleAssetIds,
  onCover,
  onToggleSample,
  expiresUnix,
}: {
  coverAssetId: Id<"assets"> | null;
  sampleAssetIds: Id<"assets">[];
  onCover: (id: Id<"assets"> | null) => void;
  onToggleSample: (id: Id<"assets">) => void;
  expiresUnix: number | null;
}) {
  const { isMobile } = useMobileLayout();
  const [dragTarget, setDragTarget] = useState<SlotTarget | null>(null);
  const [pickerTarget, setPickerTarget] = useState<SlotTarget | null>(null);

  const selectedIds = useMemo(
    () => [...(coverAssetId ? [coverAssetId] : []), ...sampleAssetIds],
    [coverAssetId, sampleAssetIds],
  );
  const resolved = useQuery(
    api.assets.listByIds,
    selectedIds.length > 0 && expiresUnix !== null
      ? { assetIds: selectedIds, expiresUnix }
      : "skip",
  );
  const assetById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; kind: string; signedThumbnailUrl?: string }
    >();
    for (const asset of resolved ?? []) map.set(asset._id, asset);
    return map;
  }, [resolved]);

  const bannerAsset = coverAssetId ? assetById.get(coverAssetId) : undefined;

  const dndProps = (target: SlotTarget) => ({
    onDragOver: (event: DragEvent) => {
      if (!isExplorerDrag(event) || !dragAccepts(target)) return;
      event.preventDefault();
      event.stopPropagation();
      setDragTarget(target);
    },
    onDragLeave: () => setDragTarget((t) => (t === target ? null : t)),
    onDrop: (event: DragEvent) => {
      setDragTarget(null);
      const assetId = readAssetDrop(event, target);
      if (!assetId) return;
      event.preventDefault();
      event.stopPropagation();
      if (target === "banner") {
        onCover(assetId);
      } else if (
        !sampleAssetIds.includes(assetId) &&
        sampleAssetIds.length < MAX_SAMPLES
      ) {
        onToggleSample(assetId);
      }
    },
  });

  const dropHint = (target: SlotTarget) =>
    target === "banner"
      ? "Drag an image here from Files"
      : "Drag images or video here from Files";

  return (
    <div className="marketplace-offers-media">
      <div>
        <p className="marketplace-offers-media-label">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Banner — the main image buyers see first
        </p>
        {coverAssetId ? (
          <div
            className={`marketplace-media-banner${
              dragTarget === "banner" ? " is-drop-target" : ""
            }`}
            {...dndProps("banner")}
          >
            {bannerAsset?.signedThumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerAsset.signedThumbnailUrl} alt="" />
            ) : (
              <span className="marketplace-media-banner-blank" aria-hidden="true" />
            )}
            <span className="marketplace-media-banner-bar">
              <span className="marketplace-media-banner-name">
                {bannerAsset?.name ?? "Loading…"}
              </span>
              {isMobile ? (
                <button
                  type="button"
                  className="marketplace-media-mini-btn"
                  onClick={() => setPickerTarget("banner")}
                >
                  Change
                </button>
              ) : null}
              <button
                type="button"
                className="marketplace-media-remove"
                aria-label="Remove banner"
                onClick={() => onCover(null)}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : (
          <div
            className={`marketplace-media-slot${
              dragTarget === "banner" ? " is-drop-target" : ""
            }`}
            {...dndProps("banner")}
          >
            <MousePointerSquareDashed
              className="marketplace-media-slot-icon"
              aria-hidden="true"
            />
            {isMobile ? (
              <button
                type="button"
                className="marketplace-media-pick-btn"
                onClick={() => setPickerTarget("banner")}
              >
                <ImageIcon aria-hidden="true" />
                Pick from Files
              </button>
            ) : (
              <span className="marketplace-media-slot-hint">
                {dropHint("banner")}
              </span>
            )}
          </div>
        )}
      </div>

      <div {...dndProps("gallery")}>
        <p className="marketplace-offers-media-label">
          <Film className="h-3.5 w-3.5" aria-hidden="true" />
          Gallery — up to {MAX_SAMPLES} samples, images or video (
          {sampleAssetIds.length}/{MAX_SAMPLES})
        </p>
        <div className="marketplace-media-gallery">
          {sampleAssetIds.map((id) => {
            const asset = assetById.get(id);
            return (
              <div key={id} className="marketplace-media-tile" title={asset?.name}>
                {asset?.signedThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.signedThumbnailUrl} alt="" />
                ) : (
                  <span
                    className="marketplace-media-tile-blank"
                    aria-hidden="true"
                  />
                )}
                <span className="marketplace-media-tile-name">
                  {asset?.name ?? "Loading…"}
                </span>
                <button
                  type="button"
                  className="marketplace-media-remove is-overlay"
                  aria-label={`Remove ${asset?.name ?? "sample"}`}
                  onClick={() => onToggleSample(id)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {sampleAssetIds.length < MAX_SAMPLES ? (
            <div
              className={`marketplace-media-slot is-tile${
                dragTarget === "gallery" ? " is-drop-target" : ""
              }`}
            >
              {isMobile ? (
                <button
                  type="button"
                  className="marketplace-media-pick-btn"
                  onClick={() => setPickerTarget("gallery")}
                >
                  <Plus aria-hidden="true" />
                  Pick
                </button>
              ) : (
                <>
                  <Plus
                    className="marketplace-media-slot-icon"
                    aria-hidden="true"
                  />
                  <span className="marketplace-media-slot-hint">
                    {dropHint("gallery")}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {pickerTarget && expiresUnix !== null ? (
        <OfferMediaPickerSheet
          target={pickerTarget}
          selectedIds={
            pickerTarget === "banner"
              ? coverAssetId
                ? [coverAssetId]
                : []
              : sampleAssetIds
          }
          expiresUnix={expiresUnix}
          onPick={(id) => {
            if (pickerTarget === "banner") {
              onCover(id);
              setPickerTarget(null);
              return;
            }
            if (
              sampleAssetIds.includes(id) ||
              sampleAssetIds.length < MAX_SAMPLES
            ) {
              onToggleSample(id);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      ) : null}
    </div>
  );
}

type FolderCrumb = { id: Id<"folders"> | null; name: string };

/** Mobile file-manager sheet for picking offer media. */
function OfferMediaPickerSheet({
  target,
  selectedIds,
  expiresUnix,
  onPick,
  onClose,
}: {
  target: SlotTarget;
  selectedIds: Id<"assets">[];
  expiresUnix: number;
  onPick: (id: Id<"assets">) => void;
  onClose: () => void;
}) {
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [stack, setStack] = useState<FolderCrumb[]>([
    { id: null, name: "Files" },
  ]);
  const current = stack[stack.length - 1];

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
    () =>
      (folderAssets ?? []).filter((asset) =>
        slotAcceptsKind(target, asset.kind),
      ),
    [folderAssets, target],
  );

  const loading =
    folders === undefined || (current.id !== null && folderAssets === undefined);
  const empty =
    !loading && (folders?.length ?? 0) === 0 && assets.length === 0;

  if (!portalRoot) return null;

  return createPortal(
    <div
      className="studio-mobile-app-menu-sheet marketplace-media-picker-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={target === "banner" ? "Pick banner image" : "Pick gallery media"}
    >
      <div className="studio-mobile-app-menu-head">
        <h2 className="studio-mobile-app-menu-title">
          {target === "banner" ? "Pick banner image" : "Pick gallery media"}
        </h2>
        <button
          type="button"
          className="studio-mobile-app-menu-close"
          aria-label="Close media picker"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="studio-mobile-app-menu-body">
        <div className="marketplace-media-picker-crumbs">
          {stack.length > 1 ? (
            <button
              type="button"
              className="marketplace-media-picker-back"
              onClick={() => setStack((s) => s.slice(0, -1))}
            >
              <ChevronLeft aria-hidden="true" />
              {stack[stack.length - 2].name}
            </button>
          ) : null}
          <span className="marketplace-media-picker-here">{current.name}</span>
          {target === "gallery" ? (
            <span className="marketplace-media-picker-count">
              {selectedIds.length}/{MAX_SAMPLES}
            </span>
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
              <div className="marketplace-media-picker-folders">
                {(folders ?? []).map((folder) => (
                  <button
                    key={folder._id}
                    type="button"
                    className="marketplace-media-picker-folder"
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
                className="marketplace-offers-asset-grid marketplace-media-picker-grid"
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
                      onClick={() => onPick(asset._id)}
                      title={asset.name}
                    >
                      {asset.signedThumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.signedThumbnailUrl} alt="" />
                      ) : (
                        <span
                          className="marketplace-offers-thumb"
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
      {target === "gallery" ? (
        <div className="marketplace-media-picker-foot">
          <button
            type="button"
            className="marketplace-media-picker-done"
            onClick={onClose}
          >
            <Check aria-hidden="true" />
            Done
          </button>
        </div>
      ) : null}
    </div>,
    portalRoot,
  );
}
