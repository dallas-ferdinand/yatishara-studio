"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlignLeft,
  ArrowLeft,
  CalendarDays,
  FileBadge,
  HandCoins,
  Loader2,
  MessageSquare,
  Plus,
  Tag,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import { IconField, IconTextarea } from "./MarketplaceIconField";
import { SellerAccessApplicationForm } from "./SellerAccessApplicationForm";
import "./marketplace-offers-pane.css";

type MarketplaceOffersPaneProps = {
  onOpenCredits: () => void;
  creditPriceCents?: number;
};

type View =
  | { kind: "home" }
  | { kind: "offer"; offerId: Id<"marketplaceOffers"> }
  | { kind: "job"; jobId: Id<"marketplaceJobs"> }
  | { kind: "create" };

function humanStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function StatusChip({ status }: { status: string }) {
  return <span className="marketplace-status-chip">{humanStatus(status)}</span>;
}

function OffersChromeHead({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <header className="marketplace-apply-head">
      <nav className="marketplace-offers-head-nav" aria-label={ariaLabel}>
        {children}
      </nav>
    </header>
  );
}

export function MarketplaceOffersPane({
  onOpenCredits,
  creditPriceCents = 50,
}: MarketplaceOffersPaneProps) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [busy, setBusy] = useState(false);

  const seller = useQuery(api.marketplace.getMySellerStatus);
  const myOffers = useQuery(
    api.marketplace.listMyOffers,
    seller?.status === "approved" ? {} : "skip",
  );
  const sellerJobs = useQuery(
    api.marketplace.listMySellerJobs,
    seller?.status === "approved" ? {} : "skip",
  );
  const buyerJobs = useQuery(api.marketplace.listMyBuyerJobs);

  const cancelSellerRequest = useMutation(api.marketplace.cancelSellerRequest);
  const createOffer = useMutation(api.marketplace.createOffer);
  const setOfferStatus = useMutation(api.marketplace.setOfferStatus);
  const updateOffer = useMutation(api.marketplace.updateOffer);
  const deliverJob = useMutation(api.marketplace.deliverJobAssets);
  const acceptJob = useMutation(api.marketplace.acceptJobDelivery);
  const cancelJob = useMutation(api.marketplace.cancelJobBeforeDelivery);

  const jobDetail = useQuery(
    api.marketplace.getJob,
    view.kind === "job" ? { jobId: view.jobId } : "skip",
  );

  const jobIdForAssets = view.kind === "job" ? view.jobId : null;
  // Signed-URL window is stamped per job outside render so it stays stable.
  const [assetUrlExpiresUnix, setAssetUrlExpiresUnix] = useState<number | null>(null);
  useEffect(() => {
    setAssetUrlExpiresUnix(jobIdForAssets ? Math.floor(Date.now() / 1000) + 60 * 60 : null);
  }, [jobIdForAssets]);

  const recentAssets = useQuery(
    api.assets.listRecentReady,
    view.kind === "job" && jobDetail?.job.role === "seller" && assetUrlExpiresUnix !== null
      ? { limit: 24, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priceTtd: "50",
    deliveryDays: "5",
    category: "ads",
  });
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    priceTtd: string;
    deliveryDays: string;
    category: string;
  } | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Id<"assets">[]>([]);
  const [deliverNote, setDeliverNote] = useState("");

  const selectedOffer = useMemo(() => {
    if (view.kind !== "offer" || !myOffers) return null;
    return myOffers.find((o) => o._id === view.offerId) ?? null;
  }, [view, myOffers]);

  useEffect(() => {
    if (!selectedOffer) {
      setEditForm(null);
      return;
    }
    setEditForm({
      title: selectedOffer.title,
      description: selectedOffer.description,
      priceTtd: String(selectedOffer.priceCents / 100),
      deliveryDays: String(selectedOffer.deliveryDays),
      category: selectedOffer.category ?? "",
    });
  }, [selectedOffer?._id, selectedOffer?.updatedAt]);

  useEffect(() => {
    setSelectedAssetIds([]);
    setDeliverNote("");
  }, [jobIdForAssets]);

  function toggleAsset(id: Id<"assets">) {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCancelSellerRequest() {
    setBusy(true);
    try {
      await cancelSellerRequest({});
      toast.success("Seller request cancelled");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not cancel request."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOffer() {
    setBusy(true);
    try {
      const priceCents = Math.round(Number(createForm.priceTtd) * 100);
      const offerId = await createOffer({
        title: createForm.title,
        description: createForm.description,
        priceCents,
        deliveryDays: Number(createForm.deliveryDays) || 5,
        category: createForm.category || undefined,
      });
      toast.success("Draft offer created");
      setView({ kind: "offer", offerId });
      setCreateForm({
        title: "",
        description: "",
        priceTtd: "50",
        deliveryDays: "5",
        category: "ads",
      });
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not create offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(
    offerId: Id<"marketplaceOffers">,
    statusValue: "published" | "paused" | "archived" | "draft",
  ) {
    setBusy(true);
    try {
      await setOfferStatus({ offerId, status: statusValue });
      toast.success(`Offer ${statusValue}`);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOffer() {
    if (!selectedOffer || !editForm) return;
    setBusy(true);
    try {
      await updateOffer({
        offerId: selectedOffer._id,
        title: editForm.title,
        description: editForm.description,
        priceCents: Math.round(Number(editForm.priceTtd) * 100),
        deliveryDays: Number(editForm.deliveryDays) || 5,
        category: editForm.category || undefined,
      });
      toast.success("Offer saved");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not save offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeliver() {
    if (view.kind !== "job") return;
    if (!selectedAssetIds.length) {
      toast.error("Select one or more assets to deliver.");
      return;
    }
    setBusy(true);
    try {
      await deliverJob({
        jobId: view.jobId,
        assetIds: selectedAssetIds,
        note: deliverNote || undefined,
      });
      toast.success("Delivery submitted");
      setSelectedAssetIds([]);
      setDeliverNote("");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Delivery failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (view.kind !== "job") return;
    setBusy(true);
    try {
      await acceptJob({ jobId: view.jobId });
      toast.success("Delivery accepted");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Accept failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (view.kind !== "job") return;
    setBusy(true);
    try {
      await cancelJob({ jobId: view.jobId });
      toast.success("Job cancelled; escrow refunded");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Cancel failed."));
    } finally {
      setBusy(false);
    }
  }

  function goHome() {
    setView({ kind: "home" });
  }

  const showBack = view.kind !== "home";
  const isApplyFlow = seller === undefined || !seller || seller.status !== "approved";

  if (view.kind === "home" && isApplyFlow) {
    if (seller === undefined) {
      return (
        <div className="marketplace-apply-pane">
          <OffersChromeHead ariaLabel="Offers">
            <button type="button" className="marketplace-offers-head-pill is-active" disabled>
              Offers
            </button>
          </OffersChromeHead>
          <div className="marketplace-apply-body">
            <div className="marketplace-apply-stage">
              <p className="marketplace-status-empty">Loading…</p>
            </div>
          </div>
        </div>
      );
    }
    if (!seller) {
      return <SellerAccessApplicationForm busy={busy} setBusy={setBusy} />;
    }
    return (
      <div className="marketplace-apply-pane">
        <OffersChromeHead ariaLabel="Seller status">
          <button type="button" className="marketplace-offers-head-pill is-active" disabled>
            {seller.status === "pending" ? "In review" : "Seller access"}
          </button>
        </OffersChromeHead>
        <div className="marketplace-apply-body">
          <div className="marketplace-apply-stage">
            <div className="marketplace-apply-intro">
              <HandCoins className="marketplace-apply-intro-icon" aria-hidden="true" />
              <h2>{seller.businessName}</h2>
              <p>
                {seller.status === "pending"
                  ? "In review — you’ll sell once approved."
                  : "Seller access is suspended."}
              </p>
            </div>
            <div className="marketplace-status-actions">
              <StatusChip status={seller.status} />
              {seller.status === "pending" ? (
                <button
                  type="button"
                  className="marketplace-status-cancel"
                  disabled={busy}
                  onClick={() => void handleCancelSellerRequest()}
                >
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Cancel request
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-offers-pane">
      {showBack ? (
        <OffersChromeHead ariaLabel="Offers navigation">
          <button
            type="button"
            className="marketplace-offers-head-pill"
            onClick={goHome}
            aria-label="Back"
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </button>
          <button type="button" className="marketplace-offers-head-pill is-active" disabled>
            {view.kind === "create"
              ? "New offer"
              : view.kind === "offer"
                ? "Offer"
                : "Job"}
          </button>
        </OffersChromeHead>
      ) : null}

      <div className="marketplace-offers-body">
        <div className="marketplace-offers-stack">
          {view.kind === "home" ? (
            <>
              <section className="marketplace-detail-card">
                <div className="studio-offers-card-head">
                  <div className="marketplace-detail-title">Your offers</div>
                  <button
                    type="button"
                    className="marketplace-action"
                    onClick={() => setView({ kind: "create" })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    New
                  </button>
                </div>
                {!myOffers ? (
                  <p className="marketplace-status-empty">Loading…</p>
                ) : myOffers.length === 0 ? (
                  <>
                    <p className="marketplace-status-empty">No offers yet.</p>
                    <div className="marketplace-detail-actions">
                      <button
                        type="button"
                        className="marketplace-action"
                        onClick={() => setView({ kind: "create" })}
                      >
                        Create offer
                      </button>
                    </div>
                  </>
                ) : (
                  <ul className="studio-offers-list">
                    {myOffers.map((offer) => (
                      <li key={offer._id}>
                        <button
                          type="button"
                          className="studio-offers-list-row"
                          onClick={() => setView({ kind: "offer", offerId: offer._id })}
                        >
                          <span className="studio-offers-list-main">
                            <strong>{offer.title}</strong>
                            <span>
                              /offers/{offer.slug} · {offer.deliveryDays}d
                            </span>
                          </span>
                          <StatusChip status={offer.status} />
                          <span className="studio-offers-list-price">
                            {formatTtdCents(offer.priceCents)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="marketplace-detail-card">
                <div className="studio-offers-card-head">
                  <div className="marketplace-detail-title">Jobs</div>
                  <button
                    type="button"
                    className="marketplace-action muted"
                    onClick={onOpenCredits}
                  >
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                    Credits
                  </button>
                </div>
                {!sellerJobs || !buyerJobs ? (
                  <p className="marketplace-status-empty">Loading…</p>
                ) : sellerJobs.length === 0 && buyerJobs.length === 0 ? (
                  <p className="marketplace-status-empty">No jobs yet.</p>
                ) : (
                  <ul className="studio-offers-list">
                    {[
                      ...sellerJobs.map((job) => ({ ...job, _role: "sell" as const })),
                      ...buyerJobs.map((job) => ({ ...job, _role: "buy" as const })),
                    ]
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((job) => (
                        <li key={`${job._role}-${job._id}`}>
                          <button
                            type="button"
                            className="studio-offers-list-row"
                            onClick={() => setView({ kind: "job", jobId: job._id })}
                          >
                            <span className="studio-offers-list-main">
                              <strong>{job.offerTitle}</strong>
                              <span>
                                {job._role === "sell" ? "Selling" : "Buying"} ·{" "}
                                {new Date(job.createdAt).toLocaleDateString()}
                              </span>
                            </span>
                            <StatusChip status={job.status} />
                            <span className="studio-offers-list-price">
                              {formatTtdCents(job.priceCents)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          {view.kind === "create" ? (
            <section className="marketplace-detail-card">
              <div className="marketplace-detail-title">Draft a package</div>
              <div className="marketplace-profile-fields">
                <IconField
                  icon={FileBadge}
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Title — e.g. 15s cartoon ad pack"
                  aria-label="Title"
                />
                <IconTextarea
                  icon={AlignLeft}
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What’s included, revisions, delivery notes"
                  aria-label="Description"
                />
                <div className="marketplace-optional-row">
                  <IconField
                    icon={Wallet}
                    value={createForm.priceTtd}
                    onChange={(e) => setCreateForm((f) => ({ ...f, priceTtd: e.target.value }))}
                    placeholder="Price (TTD)"
                    aria-label="Price in TTD"
                  />
                  <IconField
                    icon={CalendarDays}
                    value={createForm.deliveryDays}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, deliveryDays: e.target.value }))
                    }
                    placeholder="Delivery days"
                    aria-label="Delivery days"
                  />
                </div>
                <IconField
                  icon={Tag}
                  value={createForm.category}
                  onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Category"
                  aria-label="Category"
                />
              </div>
              <div className="marketplace-detail-actions">
                <button
                  type="button"
                  className="marketplace-action"
                  disabled={busy || !createForm.title.trim()}
                  onClick={() => void handleCreateOffer()}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Create draft
                </button>
                <button type="button" className="marketplace-action muted" onClick={goHome}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {view.kind === "offer" && selectedOffer && editForm ? (
            <section className="marketplace-detail-card">
              <div className="studio-offers-card-head">
                <div className="marketplace-detail-title">{selectedOffer.title}</div>
                <StatusChip status={selectedOffer.status} />
              </div>
              <p className="marketplace-status-empty">
                Public link:{" "}
                <a href={`/offers/${selectedOffer.slug}`} target="_blank" rel="noreferrer">
                  /offers/{selectedOffer.slug}
                </a>
              </p>
              <div className="marketplace-profile-fields">
                <IconField
                  icon={FileBadge}
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, title: e.target.value } : f))}
                  placeholder="Title"
                  aria-label="Title"
                />
                <IconTextarea
                  icon={AlignLeft}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, description: e.target.value } : f))
                  }
                  placeholder="Description"
                  aria-label="Description"
                />
                <div className="marketplace-optional-row">
                  <IconField
                    icon={Wallet}
                    value={editForm.priceTtd}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, priceTtd: e.target.value } : f))
                    }
                    placeholder="Price (TTD)"
                    aria-label="Price in TTD"
                  />
                  <IconField
                    icon={CalendarDays}
                    value={editForm.deliveryDays}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, deliveryDays: e.target.value } : f))
                    }
                    placeholder="Delivery days"
                    aria-label="Delivery days"
                  />
                </div>
                <IconField
                  icon={Tag}
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, category: e.target.value } : f))
                  }
                  placeholder="Category"
                  aria-label="Category"
                />
              </div>
              <div className="marketplace-detail-actions">
                <button
                  type="button"
                  className="marketplace-action"
                  disabled={busy}
                  onClick={() => void handleSaveOffer()}
                >
                  Save changes
                </button>
                {selectedOffer.status !== "published" ? (
                  <button
                    type="button"
                    className="marketplace-action muted"
                    disabled={busy}
                    onClick={() => void handlePublish(selectedOffer._id, "published")}
                  >
                    Publish
                  </button>
                ) : (
                  <button
                    type="button"
                    className="marketplace-action muted"
                    disabled={busy}
                    onClick={() => void handlePublish(selectedOffer._id, "paused")}
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="marketplace-action muted"
                  disabled={busy}
                  onClick={() => void handlePublish(selectedOffer._id, "archived")}
                >
                  Archive
                </button>
              </div>
              <div className="studio-offers-subblock">
                <div className="marketplace-detail-title">Jobs for this offer</div>
                {(sellerJobs ?? []).filter((j) => j.offerId === selectedOffer._id).length ===
                0 ? (
                  <p className="marketplace-status-empty">No jobs on this offer yet.</p>
                ) : (
                  <ul className="studio-offers-list">
                    {(sellerJobs ?? [])
                      .filter((j) => j.offerId === selectedOffer._id)
                      .map((job) => (
                        <li key={job._id}>
                          <button
                            type="button"
                            className="studio-offers-list-row"
                            onClick={() => setView({ kind: "job", jobId: job._id })}
                          >
                            <span className="studio-offers-list-main">
                              <strong>{humanStatus(job.status)}</strong>
                              <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                            </span>
                            <span className="studio-offers-list-price">
                              {formatTtdCents(job.priceCents)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {view.kind === "job" ? (
            !jobDetail ? (
              <p className="marketplace-status-empty">Loading job…</p>
            ) : (
              <section className="marketplace-detail-card">
                <div className="studio-offers-card-head">
                  <div>
                    <p className="marketplace-status-empty" style={{ marginBottom: 4 }}>
                      {jobDetail.job.role === "seller" ? "Seller job" : "Buyer job"}
                    </p>
                    <div className="marketplace-detail-title">{jobDetail.job.offerTitle}</div>
                  </div>
                  <StatusChip status={jobDetail.job.status} />
                </div>
                <div className="studio-offers-meta">
                  <div>
                    <span>Price</span>
                    <strong>{formatTtdCents(jobDetail.job.priceCents)}</strong>
                  </div>
                  <div>
                    <span>Credits held</span>
                    <strong>
                      {jobDetail.job.priceCredits} @ {creditPriceCents}¢
                    </strong>
                  </div>
                  <div>
                    <span>Booked</span>
                    <strong>{new Date(jobDetail.job.createdAt).toLocaleString()}</strong>
                  </div>
                </div>

                <div className="studio-offers-subblock">
                  <div className="marketplace-detail-title">Timeline</div>
                  <ol className="studio-offers-timeline">
                    {jobDetail.events.map((e) => (
                      <li key={e._id}>
                        <strong>{humanStatus(e.kind)}</strong>
                        {e.message ? <span>{e.message}</span> : null}
                        <time dateTime={new Date(e.createdAt).toISOString()}>
                          {new Date(e.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="studio-offers-subblock">
                  <div className="marketplace-detail-title">Deliverables</div>
                  {jobDetail.deliverables.length === 0 ? (
                    <p className="marketplace-status-empty">None yet.</p>
                  ) : (
                    <ul className="studio-offers-deliverables">
                      {jobDetail.deliverables.map((d) => (
                        <li key={d._id}>
                          {d.signedThumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.signedThumbnailUrl} alt="" />
                          ) : (
                            <span className="studio-offers-thumb-empty" aria-hidden="true" />
                          )}
                          <div>
                            {d.signedReadUrl ? (
                              <a href={d.signedReadUrl} target="_blank" rel="noreferrer">
                                {d.name ?? d.assetId}
                              </a>
                            ) : (
                              <span>{d.name ?? d.assetId}</span>
                            )}
                            {d.note ? <p>{d.note}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {jobDetail.job.role === "seller" &&
                (jobDetail.job.status === "in_progress" ||
                  jobDetail.job.status === "delivered") ? (
                  <div className="studio-offers-subblock">
                    <div className="marketplace-detail-title">Submit delivery</div>
                    <p className="marketplace-status-empty">
                      Pick assets from Explorer
                      {selectedAssetIds.length ? ` · ${selectedAssetIds.length} selected` : ""}.
                    </p>
                    {!recentAssets ? (
                      <p className="marketplace-status-empty">Loading assets…</p>
                    ) : recentAssets.length === 0 ? (
                      <p className="marketplace-status-empty">
                        No ready assets yet — upload in Explorer first.
                      </p>
                    ) : (
                      <div className="studio-offers-asset-grid" role="group" aria-label="Assets">
                        {recentAssets.map((asset) => {
                          const selected = selectedAssetIds.includes(asset._id);
                          return (
                            <button
                              key={asset._id}
                              type="button"
                              className={selected ? "is-selected" : undefined}
                              aria-pressed={selected}
                              onClick={() => toggleAsset(asset._id)}
                              title={asset.name}
                            >
                              {asset.signedThumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={asset.signedThumbnailUrl} alt="" />
                              ) : (
                                <span className="studio-offers-thumb-empty" aria-hidden="true" />
                              )}
                              <span>{asset.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="marketplace-profile-fields">
                      <IconField
                        icon={MessageSquare}
                        value={deliverNote}
                        onChange={(e) => setDeliverNote(e.target.value)}
                        placeholder="Note (optional)"
                        aria-label="Delivery note (optional)"
                      />
                    </div>
                    <div className="marketplace-detail-actions">
                      <button
                        type="button"
                        className="marketplace-action"
                        disabled={busy || selectedAssetIds.length === 0}
                        onClick={() => void handleDeliver()}
                      >
                        Submit delivery
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="marketplace-detail-actions">
                  {jobDetail.job.role === "buyer" && jobDetail.job.status === "delivered" ? (
                    <button
                      type="button"
                      className="marketplace-action"
                      disabled={busy}
                      onClick={() => void handleAccept()}
                    >
                      Accept delivery
                    </button>
                  ) : null}
                  {jobDetail.job.status === "in_progress" ||
                  jobDetail.job.status === "in_escrow" ? (
                    <button
                      type="button"
                      className="marketplace-action muted"
                      disabled={busy}
                      onClick={() => void handleCancel()}
                    >
                      Cancel &amp; refund escrow
                    </button>
                  ) : null}
                </div>
              </section>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
