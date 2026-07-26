"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AudioWaveform, Loader2, Music2, Pause, Play, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatTtdCents, formatTtdFromCredits } from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import "./studio-creative-network-store.css";

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
  listedAt?: number;
};

function formatDuration(seconds?: number) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function ListingRow({
  listing,
  playingId,
  onTogglePlay,
  onPurchase,
  busyId,
}: {
  listing: ListingCard;
  playingId: string | null;
  onTogglePlay: (listing: ListingCard) => void;
  onPurchase: (listing: ListingCard) => void;
  busyId: string | null;
}) {
  const owned = Boolean(listing.ownedBuyerAssetId);
  const duration = formatDuration(listing.durationSeconds);
  const isPlaying = playingId === listing._id;
  const busy = busyId === listing._id;

  return (
    <article className="studio-cn-store-card">
      <button
        type="button"
        className="studio-cn-store-play"
        onClick={() => onTogglePlay(listing)}
        disabled={!listing.previewUrl}
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
        title={listing.previewUrl ? (isPlaying ? "Pause" : "Preview") : "Preview unavailable"}
      >
        {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      <div className="studio-cn-store-card-body">
        <div className="studio-cn-store-card-top">
          <h3 className="studio-cn-store-title">{listing.title}</h3>
          <span className="studio-cn-store-price">{formatTtdCents(listing.priceCents)}</span>
        </div>
        <p className="studio-cn-store-meta">
          <span className="studio-cn-store-chip">
            {listing.audioType === "music" ? (
              <Music2 aria-hidden="true" />
            ) : (
              <AudioWaveform aria-hidden="true" />
            )}
            {listing.audioType === "music" ? "Music" : "SFX"}
          </span>
          {duration ? <span>{duration}</span> : null}
          <span>{listing.sellerBusinessName}</span>
        </p>
        {listing.description ? (
          <p className="studio-cn-store-desc">{listing.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        className={`studio-cn-store-buy${owned ? " is-owned" : ""}`}
        disabled={busy || owned}
        onClick={() => onPurchase(listing)}
      >
        {busy ? (
          <Loader2 className="studio-cn-store-spin" aria-hidden="true" />
        ) : owned ? (
          "Owned"
        ) : (
          <>
            <ShoppingBag aria-hidden="true" />
            Buy
          </>
        )}
      </button>
    </article>
  );
}

export function StudioCreativeNetworkStore({
  expiresUnix,
  search,
  onOpenPurchased,
  onNeedTopUp,
}: {
  expiresUnix: number;
  search: string;
  onOpenPurchased?: (buyerAssetId: Id<"assets">) => void;
  onNeedTopUp?: () => void;
}) {
  const [audioFilter, setAudioFilter] = useState<AudioFilter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmListing, setConfirmListing] = useState<ListingCard | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const deferredSearch = search.trim();
  const listings = useQuery(api.assetStore.browseListings, {
    expiresUnix,
    audioType: audioFilter === "all" ? undefined : audioFilter,
    search: deferredSearch || undefined,
    limit: 48,
  });
  const purchaseListing = useAction(api.assetStoreActions.purchaseListing);

  const rows = useMemo(() => listings ?? [], [listings]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }

  function togglePlay(listing: ListingCard) {
    if (!listing.previewUrl) {
      toast.message("Preview unavailable for this track");
      return;
    }
    if (playingId === listing._id) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(listing.previewUrl);
    audioRef.current = audio;
    setPlayingId(listing._id);
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    audio.onerror = () => {
      toast.error("Could not play preview");
      stopPreview();
    };
    void audio.play().catch(() => {
      toast.error("Could not play preview");
      stopPreview();
    });
  }

  async function runPurchase(listing: ListingCard) {
    setBusyId(listing._id);
    try {
      const result = await purchaseListing({ listingId: listing._id });
      setConfirmListing(null);
      if (result.alreadyOwned) {
        toast.message("Already in your Purchased folder");
      } else {
        toast.success("Purchased — yours forever. Use it in any edit.");
      }
      onOpenPurchased?.(result.buyerAssetId);
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

  return (
    <div className="studio-cn-store">
      <div className="studio-cn-store-filters" role="tablist" aria-label="Audio type">
        {(
          [
            { id: "all", label: "All" },
            { id: "music", label: "Music" },
            { id: "sfx", label: "SFX" },
          ] as const
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={audioFilter === chip.id}
            className={`studio-cn-store-filter${audioFilter === chip.id ? " is-active" : ""}`}
            onClick={() => setAudioFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="studio-cn-store-scroll">
        {!listings ? (
          <div className="studio-cn-store-empty">Loading store…</div>
        ) : rows.length === 0 ? (
          <div className="studio-cn-store-empty">
            {deferredSearch
              ? "No matching music or sound effects"
              : "No Creative Network audio listed yet"}
          </div>
        ) : (
          <div className="studio-cn-store-list">
            {rows.map((listing) => (
              <ListingRow
                key={listing._id}
                listing={listing}
                playingId={playingId}
                busyId={busyId}
                onTogglePlay={togglePlay}
                onPurchase={(item) => {
                  if (item.ownedBuyerAssetId) {
                    onOpenPurchased?.(item.ownedBuyerAssetId);
                    return;
                  }
                  setConfirmListing(item);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {confirmListing ? (
        <div
          className="studio-cn-store-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-cn-store-confirm-title"
        >
          <div className="studio-cn-store-confirm-card">
            <h3 id="studio-cn-store-confirm-title">Buy this track?</h3>
            <p>
              <strong>{confirmListing.title}</strong> —{" "}
              {formatTtdCents(confirmListing.priceCents)}. Pay once and keep a personal
              copy forever in your Purchased folder. It counts toward your storage.
            </p>
            <p className="studio-cn-store-confirm-note">
              Generate cost would be{" "}
              {formatTtdFromCredits(confirmListing.generateCredits)}; store price is 3×.
            </p>
            <div className="studio-cn-store-confirm-actions">
              <button
                type="button"
                className="studio-cn-store-confirm-cancel"
                onClick={() => setConfirmListing(null)}
                disabled={busyId === confirmListing._id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="studio-cn-store-confirm-buy"
                disabled={busyId === confirmListing._id}
                onClick={() => void runPurchase(confirmListing)}
              >
                {busyId === confirmListing._id ? (
                  <>
                    <Loader2 className="studio-cn-store-spin" aria-hidden="true" />
                    Buying…
                  </>
                ) : (
                  `Buy for ${formatTtdCents(confirmListing.priceCents)}`
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
