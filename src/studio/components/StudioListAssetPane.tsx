"use client";

import { useAction, useQuery } from "convex/react";
import { AlignLeft, ArrowLeft, AudioLines, FileBadge, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import { IconField, IconTextarea } from "./MarketplaceIconField";
import "./marketplace-offers-pane.css";

type StudioListAssetPaneProps = {
  assetId: string;
  onCancel: () => void;
  onSubmitted?: () => void;
};

export function StudioListAssetPane({
  assetId,
  onCancel,
  onSubmitted,
}: StudioListAssetPaneProps) {
  const listOnNetwork = useAction(api.assetStoreActions.listOnNetwork);
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const assets = useQuery(api.assets.listByIds, {
    assetIds: [assetId as Id<"assets">],
    quality: "preview",
    expiresUnix,
  });
  const quote = useQuery(api.assetStore.quoteListPrice, {
    assetId: assetId as Id<"assets">,
  });
  const asset = assets?.[0] ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !asset) return;
    const base = String(asset.name ?? "")
      .replace(/\.[^.]+$/, "")
      .trim();
    setTitle(base);
    setDescription("");
    setSeeded(true);
  }, [asset, seeded]);

  const price =
    quote && quote.canList ? formatTtdCents(quote.priceCents) : null;
  const typeLabel =
    quote?.audioType === "music"
      ? "Music"
      : quote?.audioType === "sfx"
        ? "Sound effect"
        : null;

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Display name is required");
      return;
    }
    if (!quote?.canList) {
      toast.error(quote?.reason || "Cannot list this audio");
      return;
    }
    setBusy(true);
    try {
      const desc = description.trim();
      await listOnNetwork({
        assetId: assetId as Id<"assets">,
        title: trimmed.slice(0, 120),
        description: desc ? desc.slice(0, 400) : undefined,
      });
      toast.success(`Submitted for review · ${formatTtdCents(quote.priceCents)}`);
      onSubmitted?.();
      onCancel();
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not submit listing"));
    } finally {
      setBusy(false);
    }
  }

  const loading = assets === undefined || quote === undefined;
  const blocked = Boolean(quote && !quote.canList);

  return (
    <div className="studio-admin-panel">
      <header className="studio-admin-head">
        <nav className="studio-admin-head-tabs" aria-label="List asset">
          <button
            type="button"
            className="studio-admin-head-tab"
            onClick={onCancel}
            disabled={busy}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <span className="studio-admin-head-tab is-active">Details</span>
        </nav>
        <div className="marketplace-offers-head-action">
          <button
            type="button"
            className="marketplace-offers-bar-action"
            disabled={busy || loading || blocked || !title.trim()}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <AudioLines className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </header>

      <div className="studio-admin-body">
        <div className="studio-admin-workspace">
          <div className="studio-admin-stack">
            <section className="studio-admin-section">
              <div className="studio-admin-section-head">
                <span className="studio-admin-section-title">
                  List on Creative Network
                </span>
              </div>
              <div className="studio-admin-card">
                {loading ? (
                  <p className="studio-settings-empty">Loading listing details…</p>
                ) : blocked ? (
                  <p className="studio-settings-empty">
                    {quote?.reason || "This file cannot be listed."}
                  </p>
                ) : (
                  <>
                    <p className="marketplace-offers-hint">
                      <AudioLines aria-hidden="true" />
                      {typeLabel}
                      {price ? ` · buyers pay ${price} once` : null}. You earn
                      70% after approval. Submissions are reviewed before going
                      live.
                    </p>
                    <div className="marketplace-profile-fields">
                      <IconField
                        icon={FileBadge}
                        label="Display name"
                        value={title}
                        maxLength={120}
                        disabled={busy}
                        autoFocus
                        placeholder="e.g. Soft bass drop"
                        aria-label="Display name"
                        onChange={(event) => setTitle(event.target.value)}
                        onFocus={(event) => event.target.select()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submit();
                          }
                          if (event.key === "Escape" && !busy) onCancel();
                        }}
                      />
                      <IconTextarea
                        icon={AlignLeft}
                        label="Description"
                        hint="Optional — mood, use case, instruments."
                        value={description}
                        maxLength={400}
                        rows={4}
                        disabled={busy}
                        placeholder="Mood, use case, instruments…"
                        aria-label="Description"
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
