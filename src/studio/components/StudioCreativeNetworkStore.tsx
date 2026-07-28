"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Check, Loader2, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  clearActiveExplorerDrag,
  writeExplorerDragData,
} from "@/desk/lib/explorer-dnd";
import { setChipDragImage } from "@/desk/lib/chip-drag-preview.js";
import { formatTtdCents } from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  cnListingsCacheKey,
  rememberStudioLive,
  readStudioLive,
  studioLiveOrCached,
} from "@/studio/lib/studioLiveCache";
import { markStudioPaint } from "@/studio/lib/studioPaintMarks";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import { MediaLoadWave } from "./media-load-frame";
import "./studio-creative-network-store.css";
import "./studio-chat-audio-player.css";

type AudioFilter = "all" | "music" | "sfx";

type ListingCard = {
  _id: Id<"assetListings">;
  title: string;
  description?: string;
  audioType: "music" | "sfx";
  durationSeconds?: number;
  generateCredits: number;
  priceCredits: number;
  priceCents: number;
  purchaseCount: number;
  sellerBusinessName: string;
  sellerUsername?: string;
  previewUrl?: string;
  ownedBuyerAssetId?: Id<"assets">;
  viewerAccess?: "owned" | "creator";
  listedAt?: number;
};

function ownedDragEntry(listing: ListingCard) {
  const assetId = listing.ownedBuyerAssetId;
  if (!assetId) return null;
  return {
    path: `studio-asset/${assetId}`,
    name: listing.title,
    type: "file" as const,
    studioKind: "asset",
    studioId: assetId,
    mediaKind: "audio" as const,
    mimeType: "audio/mpeg",
    durationSeconds: listing.durationSeconds,
    mediaUrl: listing.previewUrl,
  };
}

function ListingRow({
  listing,
  onBuyClick,
  onCancelConfirm,
  confirming,
  busyId,
}: {
  listing: ListingCard;
  onBuyClick: (listing: ListingCard) => void;
  onCancelConfirm: () => void;
  confirming: boolean;
  busyId: string | null;
}) {
  const owned = Boolean(listing.ownedBuyerAssetId);
  const isCreator = listing.viewerAccess === "creator";
  const accessLabel = isCreator ? "Creator" : "Owned";
  const busy = busyId === listing._id;
  const typeLabel = listing.audioType === "music" ? "Music" : "SFX";
  const displayTitle = `${typeLabel} · ${listing.title}`;
  const priceLabel = formatTtdCents(listing.priceCents);

  function handleDragStart(event: DragEvent<HTMLElement>) {
    const entry = ownedDragEntry(listing);
    if (!entry) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    // Keep play / scrub / buttons interactive — drag from chrome around them.
    if (target?.closest(".studio-chat-audio-row, button, a, input")) {
      event.preventDefault();
      return;
    }
    writeExplorerDragData(event.dataTransfer, entry);
    event.dataTransfer?.setData(
      "application/x-studio-asset",
      JSON.stringify({
        assetId: entry.studioId,
        kind: "audio",
        name: entry.name,
        durationSeconds: entry.durationSeconds,
      }),
    );
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    setChipDragImage(event.dataTransfer, {
      label: entry.name,
      kind: "audio",
    });
    document.body.classList.add("is-drag-cursor");
  }

  function handleDragEnd() {
    document.body.classList.remove("is-drag-cursor");
    clearActiveExplorerDrag();
  }

  const buyControl = (
    <div className="studio-cn-store-buy-group">
      {confirming && !owned ? (
        <button
          type="button"
          className="studio-cn-store-cancel"
          disabled={busy}
          onClick={onCancelConfirm}
          aria-label="Cancel purchase"
          title="Cancel"
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={`studio-cn-store-buy${owned ? " is-owned" : ""}${confirming ? " is-confirm" : ""}`}
        disabled={busy || owned}
        onClick={() => onBuyClick(listing)}
        aria-label={
          owned
            ? `${accessLabel} — drag card to timeline`
            : busy
              ? "Buying"
              : confirming
                ? `Confirm buy for ${priceLabel}`
                : `Buy for ${priceLabel}`
        }
        title={
          owned
            ? `${accessLabel} · drag to timeline`
            : confirming
              ? `Confirm · ${priceLabel}`
              : `Buy · ${priceLabel}`
        }
      >
        {busy ? (
          <Loader2 className="studio-cn-store-spin" aria-hidden="true" />
        ) : confirming ? (
          <Check aria-hidden="true" />
        ) : owned ? null : (
          <ShoppingBag aria-hidden="true" />
        )}
        <span>
          {owned
            ? accessLabel
            : busy
              ? "Buying"
              : confirming
                ? "Confirm"
                : priceLabel}
        </span>
      </button>
    </div>
  );

  return (
    <article
      className={`studio-cn-store-card${owned ? " is-owned-drag" : ""}`}
      draggable={owned}
      onDragStart={owned ? handleDragStart : undefined}
      onDragEnd={owned ? handleDragEnd : undefined}
      title={owned ? `${displayTitle} · Drag to timeline` : undefined}
    >
      {listing.previewUrl ? (
        <StudioChatAudioPlayer
          src={listing.previewUrl}
          title={displayTitle}
          durationHint={listing.durationSeconds}
          showTitle
          compact
          headerEnd={buyControl}
        />
      ) : (
        <div
          className="studio-chat-audio-player is-compact"
          role="status"
          aria-busy="true"
          aria-label="Preview unavailable"
        >
          <div className="studio-chat-audio-head">
            <span className="studio-chat-audio-head-title" title={displayTitle}>
              {displayTitle}
            </span>
            <div className="studio-chat-audio-head-end">{buyControl}</div>
          </div>
          <div className="studio-chat-audio-load-body">
            <MediaLoadWave size="sm" />
            <p className="studio-chat-audio-load-label">Preview unavailable</p>
          </div>
        </div>
      )}
    </article>
  );
}

export function StudioCreativeNetworkStore({
  expiresUnix,
  search,
  audioFilter = "all",
  onOpenPurchased,
  onNeedTopUp,
}: {
  expiresUnix: number;
  search: string;
  /** All / Music / SFX — controlled from the search-bar type dropdown. */
  audioFilter?: AudioFilter;
  onOpenPurchased?: (buyerAssetId?: Id<"assets">) => void;
  onNeedTopUp?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const deferredSearch = search.trim();
  const listingsLive = useQuery(api.assetStore.browseListings, {
    expiresUnix,
    audioType: audioFilter === "all" ? undefined : audioFilter,
    search: deferredSearch || undefined,
    limit: 48,
  });
  const listingsCacheKey = cnListingsCacheKey(
    audioFilter === "all" ? "all" : audioFilter,
    deferredSearch,
  );
  useEffect(() => {
    rememberStudioLive(listingsCacheKey, listingsLive);
  }, [listingsCacheKey, listingsLive]);
  const { data: listings, pending: listingsPending } = studioLiveOrCached(
    listingsLive,
    readStudioLive(listingsCacheKey),
  );
  useEffect(() => {
    if (listings != null) markStudioPaint("network");
  }, [listings]);
  const purchaseListing = useAction(api.assetStoreActions.purchaseListing);

  const rows = useMemo(() => listings ?? [], [listings]);

  async function runPurchase(listing: ListingCard) {
    setBusyId(listing._id);
    try {
      await purchaseListing({ listingId: listing._id });
      setConfirmId(null);
      // Files → Your files → Purchased (no asset tab / no modal).
      onOpenPurchased?.();
    } catch (error) {
      const message = friendlyConvexError(error, "Could not complete purchase.");
      toast.error(message);
      if (/top up|not enough balance|insufficient/i.test(message)) {
        onNeedTopUp?.();
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleBuyClick(listing: ListingCard) {
    if (listing.ownedBuyerAssetId) {
      onOpenPurchased?.(listing.ownedBuyerAssetId);
      return;
    }
    if (confirmId === listing._id) {
      void runPurchase(listing);
      return;
    }
    setConfirmId(listing._id);
  }

  return (
    <div className="studio-cn-store">
      <div className="studio-cn-store-scroll">
        {!listings ? (
          <div
            className={`studio-cn-store-empty${listingsPending ? " is-pending" : ""}`}
            aria-busy={listingsPending || undefined}
            aria-hidden={listingsPending ? true : undefined}
          />
        ) : rows.length === 0 ? (
          <div className="studio-cn-store-empty">
            {deferredSearch
              ? "No matching music or sound effects"
              : "No asset library audio listed yet"}
          </div>
        ) : (
          <div className="studio-cn-store-list">
            {rows.map((listing) => (
              <ListingRow
                key={listing._id}
                listing={listing}
                busyId={busyId}
                confirming={confirmId === listing._id}
                onBuyClick={handleBuyClick}
                onCancelConfirm={() => setConfirmId(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
