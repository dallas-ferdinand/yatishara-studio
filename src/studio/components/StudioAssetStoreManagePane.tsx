"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CircleDollarSign,
  Loader2,
  Package,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStickySignedUrlExpiry } from "@/studio/lib/signedUrlExpiry";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CursorTable } from "@/desk/components/CursorTable";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import "./marketplace-offers-pane.css";

const URL_EXPIRES_SEC = 3600;

function statusLabel(status: string, platformOwned?: boolean): string {
  if (platformOwned) return "Platform owned";
  switch (status) {
    case "pending_review":
      return "In review";
    case "listed":
      return "Live";
    case "rejected":
      return "Rejected";
    case "unlisted":
      return "Unlisted";
    case "removed":
      return "Removed";
    default:
      return status;
  }
}

function SummaryChip({
  label,
  value,
  body,
}: {
  label: string;
  value: ReactNode;
  body: string;
}) {
  return (
    <article className="marketplace-offers-summary-chip" title={body}>
      <strong className="marketplace-offers-summary-value">{value}</strong>
      <span className="marketplace-offers-summary-label">{label}</span>
    </article>
  );
}

function SummaryRow({ children }: { children: ReactNode }) {
  return <section className="marketplace-offers-summary">{children}</section>;
}

export function StudioAssetStoreManagePane() {
  const [selectedId, setSelectedId] = useState<Id<"assetListings"> | null>(null);
  const [busy, setBusy] = useState(false);
  const expiresUnix = useStickySignedUrlExpiry(URL_EXPIRES_SEC);
  const [nowMs] = useState(() => Date.now());

  const summary = useQuery(api.assetStore.myAssetStoreSummary, { nowMs });
  const listings = useQuery(api.assetStore.listMyListings, {});
  const detail = useQuery(
    api.assetStore.getMyListingDetail,
    selectedId ? { listingId: selectedId, expiresUnix } : "skip",
  );
  const unlistFromNetwork = useMutation(api.assetStore.unlistFromNetwork);
  const releaseListingToPlatform = useMutation(
    api.assetStore.releaseListingToPlatform,
  );

  async function runUnlist(listingId: Id<"assetListings">) {
    setBusy(true);
    try {
      await unlistFromNetwork({ listingId });
      toast.success("Listing updated");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not unlist"));
    } finally {
      setBusy(false);
    }
  }

  async function runRelease(listingId: Id<"assetListings">, title: string) {
    const ok = window.confirm(
      `Release "${title}" to the platform? It stays live. Future sale profits go to the platform. This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await releaseListingToPlatform({ listingId });
      toast.success("Released to the platform");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not release listing"));
    } finally {
      setBusy(false);
    }
  }

  if (selectedId) {
    return (
      <div className="studio-admin-panel">
        <header className="studio-admin-head">
          <nav className="studio-admin-head-tabs" aria-label="Asset detail">
            <button
              type="button"
              className="studio-admin-head-tab"
              onClick={() => setSelectedId(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              My assets
            </button>
            <span className="studio-admin-head-tab is-active">
              {detail?.title ?? "Listing"}
            </span>
          </nav>
        </header>

        <div className="studio-admin-body">
          <div className="studio-admin-workspace">
            <div className="studio-admin-stack">
              {!detail ? (
                <div className="studio-settings-empty">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading listing…
                </div>
              ) : (
                <section className="studio-admin-section">
                  <div className="studio-admin-section-head">
                    <span className="studio-admin-section-title">
                      {detail.title}
                    </span>
                    <div className="studio-admin-section-extras flex flex-wrap gap-2">
                      {detail.canUnlist ? (
                        <button
                          type="button"
                          className="cursor-settings-action"
                          disabled={busy}
                          onClick={() => void runUnlist(detail._id)}
                        >
                          {detail.status === "pending_review"
                            ? "Withdraw"
                            : "Unlist"}
                        </button>
                      ) : null}
                      {detail.canRelease ? (
                        <button
                          type="button"
                          className="cursor-settings-action"
                          disabled={busy}
                          onClick={() =>
                            void runRelease(detail._id, detail.title)
                          }
                        >
                          Release to platform
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="studio-settings-empty">
                    {statusLabel(detail.status, Boolean(detail.platformOwnedAt))}
                    {" · "}
                    {formatTtdCents(detail.priceCents)}
                    {" · "}
                    {detail.purchaseCount} purchase
                    {detail.purchaseCount === 1 ? "" : "s"}
                  </p>

                  {detail.rejectionReason ? (
                    <p className="desk-explorer-dialog-error">
                      Rejected: {detail.rejectionReason}
                    </p>
                  ) : null}

                  {detail.previewUrl ? (
                    <div className="studio-chat-audio-player-host">
                      <StudioChatAudioPlayer
                        src={detail.previewUrl}
                        title={detail.title}
                        durationHint={detail.durationSeconds}
                      />
                    </div>
                  ) : null}

                  {detail.description ? (
                    <p className="studio-settings-empty">{detail.description}</p>
                  ) : null}

                  <CursorTable
                    ariaLabel="Listing orders"
                    loading={false}
                    empty={!detail.orders.length}
                    emptyIcon={<CircleDollarSign />}
                    emptyTitle="No purchases yet"
                    emptyHint="Orders for this asset show up here."
                  >
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Buyer</th>
                        <th>Paid</th>
                        <th>Your share</th>
                        <th>Platform</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.orders.map((order) => (
                        <tr key={order._id}>
                          <td>{new Date(order.createdAt).toLocaleString()}</td>
                          <td>{order.buyerLabel}</td>
                          <td>{formatTtdCents(order.priceCents)}</td>
                          <td>{formatTtdCents(order.sellerPayoutCents)}</td>
                          <td>{formatTtdCents(order.platformCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </CursorTable>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-admin-panel">
      <div className="studio-admin-body">
        <div className="studio-admin-workspace">
          <div className="studio-admin-stack">
            <SummaryRow>
              <SummaryChip
                label="Listed"
                value={summary?.listedCount ?? "—"}
                body="Live catalog listings"
              />
              <SummaryChip
                label="In review"
                value={summary?.pendingCount ?? "—"}
                body="Awaiting quality approval"
              />
              <SummaryChip
                label="Funds generated"
                value={
                  summary ? formatTtdCents(summary.totalFundsCents) : "—"
                }
                body="All-time buyer spend on your assets"
              />
              <SummaryChip
                label="Profit this month"
                value={
                  summary ? formatTtdCents(summary.monthProfitCents) : "—"
                }
                body="Your seller share paid out this calendar month"
              />
            </SummaryRow>

            <section className="studio-admin-section">
              <CursorTable
                ariaLabel="Asset listings"
                loading={!listings}
                empty={!!listings && !listings.length}
                emptyIcon={<Package />}
                emptyTitle="No asset listings yet"
                emptyHint="Right-click music or SFX in Files → List on Creative Network."
              >
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {(listings ?? []).map((row) => (
                    <tr
                      key={row._id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(row._id)}
                    >
                      <td>
                        <strong>{row.title}</strong>
                      </td>
                      <td>{row.audioType === "music" ? "Music" : "SFX"}</td>
                      <td>
                        {statusLabel(row.status, Boolean(row.platformOwnedAt))}
                      </td>
                      <td>{formatTtdCents(row.priceCents)}</td>
                      <td>{row.purchaseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </CursorTable>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
