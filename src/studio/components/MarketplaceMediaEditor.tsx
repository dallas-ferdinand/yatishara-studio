"use client";

import { useQuery } from "convex/react";
import {
  Film,
  Image as ImageIcon,
  MousePointerSquareDashed,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  EXPLORER_DND_TYPE,
  inferMediaKind,
  peekActiveExplorerDrag,
  readExplorerDragData,
} from "@/desk/lib/explorer-dnd";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { StudioAssetPickerSheet } from "./StudioAssetPickerSheet";

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
        <StudioAssetPickerSheet
          title={
            pickerTarget === "banner"
              ? "Pick banner image"
              : "Pick gallery media"
          }
          kinds={
            pickerTarget === "banner" ? ["image"] : ["image", "video"]
          }
          selectedIds={
            pickerTarget === "banner"
              ? coverAssetId
                ? [coverAssetId]
                : []
              : sampleAssetIds
          }
          multi={pickerTarget === "gallery"}
          stayOpen={pickerTarget === "gallery"}
          maxSelected={pickerTarget === "gallery" ? MAX_SAMPLES : undefined}
          countLabel={
            pickerTarget === "gallery"
              ? `${sampleAssetIds.length}/${MAX_SAMPLES}`
              : undefined
          }
          expiresUnix={expiresUnix}
          onPick={(asset) => {
            if (pickerTarget === "banner") {
              onCover(asset._id as Id<"assets">);
              return;
            }
            const assetId = asset._id as Id<"assets">;
            if (
              sampleAssetIds.includes(assetId) ||
              sampleAssetIds.length < MAX_SAMPLES
            ) {
              onToggleSample(assetId);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      ) : null}
    </div>
  );
}
