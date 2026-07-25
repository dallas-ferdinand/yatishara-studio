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
import { CursorSelect } from "@/desk/components/CursorSelect";
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

type HomeTab = "offers" | "jobs";
type JobFilter = "all" | "sell" | "buy";

const GOOD_STATUSES = new Set(["published", "completed", "approved", "paid"]);
const BAD_STATUSES = new Set([
  "cancelled",
  "refunded",
  "suspended",
  "archived",
]);

function humanStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function StatusChip({ status }: { status: string }) {
  const tone = GOOD_STATUSES.has(status)
    ? " is-good"
    : BAD_STATUSES.has(status)
      ? " is-bad"
      : "";
  return (
    <span className={`marketplace-status-chip${tone}`}>
      {humanStatus(status)}
    </span>
  );
}

function OffersHead({ children }: { children: ReactNode }) {
  return (
    <header className="studio-admin-head">
      <nav className="studio-admin-head-tabs" aria-label="Offers sections">
        {children}
      </nav>
    </header>
  );
}

function Section({
  title,
  extras,
  children,
}: {
  title: string;
  extras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="studio-admin-section">
      <div className="studio-admin-section-head">
        <span className="studio-admin-section-title">{title}</span>
        {extras ? (
          <div className="studio-admin-section-extras">{extras}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  body,
}: {
  label: string;
  value: ReactNode;
  body: string;
}) {
  return (
    <article className="studio-admin-card">
      <p className="studio-admin-card-kicker">{label}</p>
      <h3>{value}</h3>
      <p>{body}</p>
    </article>
  );
}

export function MarketplaceOffersPane({
  onOpenCredits,
  creditPriceCents = 50,
}: MarketplaceOffersPaneProps) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [homeTab, setHomeTab] = useState<HomeTab>("offers");
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
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
  const [assetUrlExpiresUnix, setAssetUrlExpiresUnix] = useState<number | null>(
    null,
  );
  useEffect(() => {
    setAssetUrlExpiresUnix(
      jobIdForAssets ? Math.floor(Date.now() / 1000) + 60 * 60 : null,
    );
  }, [jobIdForAssets]);

  const recentAssets = useQuery(
    api.assets.listRecentReady,
    view.kind === "job" &&
      jobDetail?.job.role === "seller" &&
      assetUrlExpiresUnix !== null
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

  const allJobs = useMemo(() => {
    const sell = (sellerJobs ?? []).map((job) => ({
      ...job,
      _role: "sell" as const,
    }));
    const buy = (buyerJobs ?? []).map((job) => ({
      ...job,
      _role: "buy" as const,
    }));
    return [...sell, ...buy].sort((a, b) => b.createdAt - a.createdAt);
  }, [sellerJobs, buyerJobs]);

  const visibleJobs = useMemo(
    () =>
      jobFilter === "all"
        ? allJobs
        : allJobs.filter((job) => job._role === jobFilter),
    [allJobs, jobFilter],
  );

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

  const isApplyFlow =
    seller === undefined || !seller || seller.status !== "approved";

  if (view.kind === "home" && isApplyFlow) {
    if (seller === undefined) {
      return (
        <div className="marketplace-apply-pane">
          <header className="marketplace-apply-head">
            <nav className="studio-admin-head-tabs" aria-label="Offers">
              <span className="studio-admin-head-tab is-active">Offers</span>
            </nav>
          </header>
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
        <header className="marketplace-apply-head">
          <nav className="studio-admin-head-tabs" aria-label="Seller status">
            <span className="studio-admin-head-tab is-active">
              {seller.status === "pending" ? "In review" : "Seller access"}
            </span>
          </nav>
        </header>
        <div className="marketplace-apply-body">
          <div className="marketplace-apply-stage">
            <div className="marketplace-apply-intro">
              <HandCoins
                className="marketplace-apply-intro-icon"
                aria-hidden="true"
              />
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
                  {busy ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Cancel request
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const offers = myOffers ?? [];
  const liveOffers = offers.filter(
    (offer) => offer.status === "published",
  ).length;
  const draftOffers = offers.filter((offer) => offer.status === "draft").length;
  const openJobs = allJobs.filter(
    (job) => job.status === "in_escrow" || job.status === "in_progress",
  ).length;
  const deliveredJobs = allJobs.filter(
    (job) => job.status === "delivered",
  ).length;
  const completedJobs = allJobs.filter(
    (job) => job.status === "completed",
  ).length;
  const jobsLoading = !sellerJobs || !buyerJobs;

  return (
    <div className="studio-admin-panel">
      {view.kind === "home" ? (
        <OffersHead>
          <button
            type="button"
            className={`studio-admin-head-tab${homeTab === "offers" ? " is-active" : ""}`}
            onClick={() => setHomeTab("offers")}
          >
            Offers
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${homeTab === "jobs" ? " is-active" : ""}`}
            onClick={() => setHomeTab("jobs")}
          >
            Jobs
          </button>
        </OffersHead>
      ) : (
        <OffersHead>
          <button
            type="button"
            className="studio-admin-head-tab"
            onClick={goHome}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <span className="studio-admin-head-tab is-active">
            {view.kind === "create"
              ? "New offer"
              : view.kind === "offer"
                ? "Offer"
                : "Job"}
          </span>
        </OffersHead>
      )}

      <div className="studio-admin-body">
        <div className="studio-admin-workspace">
          {view.kind === "home" && homeTab === "offers" ? (
            <div className="studio-admin-stack">
              <section className="studio-admin-grid-large">
                <MetricCard
                  label="Live"
                  value={liveOffers}
                  body="Published packages buyers can book right now."
                />
                <MetricCard
                  label="Drafts"
                  value={draftOffers}
                  body="Not visible yet — publish when the copy is ready."
                />
                <MetricCard
                  label="Open jobs"
                  value={openJobs}
                  body="Booked work in escrow or in progress."
                />
              </section>

              <Section
                title="Your offers"
                extras={
                  <button
                    type="button"
                    className="marketplace-offers-bar-action"
                    onClick={() => setView({ kind: "create" })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    New offer
                  </button>
                }
              >
                <div className="studio-admin-table-wrap">
                  {!myOffers ? (
                    <Loader2 className="m-4 h-4 w-4 animate-spin" />
                  ) : offers.length === 0 ? (
                    <p className="studio-settings-empty marketplace-offers-table-empty">
                      No offers yet — create your first package.
                    </p>
                  ) : (
                    <table className="studio-admin-table">
                      <thead>
                        <tr>
                          <th>Offer</th>
                          <th>Price</th>
                          <th>Delivery</th>
                          <th>Status</th>
                          <th>Public link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offers.map((offer) => (
                          <tr
                            key={offer._id}
                            onClick={() =>
                              setView({ kind: "offer", offerId: offer._id })
                            }
                          >
                            <td>
                              <strong>{offer.title}</strong>
                              <span>{offer.category ?? "Uncategorised"}</span>
                            </td>
                            <td>{formatTtdCents(offer.priceCents)}</td>
                            <td>{offer.deliveryDays} days</td>
                            <td>
                              <StatusChip status={offer.status} />
                            </td>
                            <td>
                              <a
                                href={`/offers/${offer.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                /offers/{offer.slug}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          ) : null}

          {view.kind === "home" && homeTab === "jobs" ? (
            <div className="studio-admin-stack">
              <section className="studio-admin-grid-large">
                <MetricCard
                  label="Open"
                  value={openJobs}
                  body="Credits held in escrow until the work is accepted."
                />
                <MetricCard
                  label="Delivered"
                  value={deliveredJobs}
                  body="Waiting on buyer acceptance or auto-accept."
                />
                <MetricCard
                  label="Completed"
                  value={completedJobs}
                  body="Escrow released and payout recorded."
                />
              </section>

              <Section
                title="Jobs"
                extras={
                  <>
                    <CursorSelect
                      ariaLabel="Job side"
                      value={jobFilter}
                      onChange={(next) => setJobFilter(next as JobFilter)}
                      options={[
                        { value: "all", label: "All" },
                        { value: "sell", label: "Selling" },
                        { value: "buy", label: "Buying" },
                      ]}
                    />
                    <button
                      type="button"
                      className="marketplace-offers-bar-action"
                      onClick={onOpenCredits}
                    >
                      <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                      Credits
                    </button>
                  </>
                }
              >
                <div className="studio-admin-table-wrap">
                  {jobsLoading ? (
                    <Loader2 className="m-4 h-4 w-4 animate-spin" />
                  ) : visibleJobs.length === 0 ? (
                    <p className="studio-settings-empty marketplace-offers-table-empty">
                      {allJobs.length === 0
                        ? "No jobs yet."
                        : "No jobs on this side of the marketplace."}
                    </p>
                  ) : (
                    <table className="studio-admin-table">
                      <thead>
                        <tr>
                          <th>Job</th>
                          <th>Side</th>
                          <th>Booked</th>
                          <th>Price</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleJobs.map((job) => (
                          <tr
                            key={`${job._role}-${job._id}`}
                            onClick={() =>
                              setView({ kind: "job", jobId: job._id })
                            }
                          >
                            <td>
                              <strong>{job.offerTitle}</strong>
                              <span>{job.priceCredits} credits held</span>
                            </td>
                            <td>
                              {job._role === "sell" ? "Selling" : "Buying"}
                            </td>
                            <td>
                              {new Date(job.createdAt).toLocaleDateString()}
                            </td>
                            <td>{formatTtdCents(job.priceCents)}</td>
                            <td>
                              <StatusChip status={job.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          ) : null}

          {view.kind === "create" ? (
            <div className="studio-admin-stack">
              <Section title="New offer">
                <div className="studio-admin-card">
                  <div className="marketplace-profile-fields">
                    <IconField
                      icon={FileBadge}
                      value={createForm.title}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, title: e.target.value }))
                      }
                      placeholder="Title — e.g. 15s cartoon ad pack"
                      aria-label="Title"
                    />
                    <IconTextarea
                      icon={AlignLeft}
                      value={createForm.description}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      placeholder="What’s included, revisions, delivery notes"
                      aria-label="Description"
                    />
                    <div className="marketplace-optional-row">
                      <IconField
                        icon={Wallet}
                        value={createForm.priceTtd}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            priceTtd: e.target.value,
                          }))
                        }
                        placeholder="Price (TTD)"
                        aria-label="Price in TTD"
                      />
                      <IconField
                        icon={CalendarDays}
                        value={createForm.deliveryDays}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            deliveryDays: e.target.value,
                          }))
                        }
                        placeholder="Delivery days"
                        aria-label="Delivery days"
                      />
                    </div>
                    <IconField
                      icon={Tag}
                      value={createForm.category}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          category: e.target.value,
                        }))
                      }
                      placeholder="Category"
                      aria-label="Category"
                    />
                  </div>
                  <div className="marketplace-offers-actions">
                    <button
                      type="button"
                      className="is-primary"
                      disabled={busy || !createForm.title.trim()}
                      onClick={() => void handleCreateOffer()}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Create draft
                    </button>
                    <button type="button" onClick={goHome}>
                      Cancel
                    </button>
                  </div>
                </div>
              </Section>
            </div>
          ) : null}

          {view.kind === "offer" && selectedOffer && editForm ? (
            <div className="studio-admin-stack">
              <Section
                title={selectedOffer.title}
                extras={<StatusChip status={selectedOffer.status} />}
              >
                <div className="studio-admin-card">
                  <p className="marketplace-offers-link">
                    <a
                      href={`/offers/${selectedOffer.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      /offers/{selectedOffer.slug}
                    </a>
                  </p>
                  <div className="marketplace-profile-fields">
                    <IconField
                      icon={FileBadge}
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm((f) =>
                          f ? { ...f, title: e.target.value } : f,
                        )
                      }
                      placeholder="Title"
                      aria-label="Title"
                    />
                    <IconTextarea
                      icon={AlignLeft}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((f) =>
                          f ? { ...f, description: e.target.value } : f,
                        )
                      }
                      placeholder="Description"
                      aria-label="Description"
                    />
                    <div className="marketplace-optional-row">
                      <IconField
                        icon={Wallet}
                        value={editForm.priceTtd}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, priceTtd: e.target.value } : f,
                          )
                        }
                        placeholder="Price (TTD)"
                        aria-label="Price in TTD"
                      />
                      <IconField
                        icon={CalendarDays}
                        value={editForm.deliveryDays}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, deliveryDays: e.target.value } : f,
                          )
                        }
                        placeholder="Delivery days"
                        aria-label="Delivery days"
                      />
                    </div>
                    <IconField
                      icon={Tag}
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm((f) =>
                          f ? { ...f, category: e.target.value } : f,
                        )
                      }
                      placeholder="Category"
                      aria-label="Category"
                    />
                  </div>
                  <div className="marketplace-offers-actions">
                    <button
                      type="button"
                      className="is-primary"
                      disabled={busy}
                      onClick={() => void handleSaveOffer()}
                    >
                      Save changes
                    </button>
                    {selectedOffer.status !== "published" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handlePublish(selectedOffer._id, "published")
                        }
                      >
                        Publish
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handlePublish(selectedOffer._id, "paused")
                        }
                      >
                        Pause
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handlePublish(selectedOffer._id, "archived")
                      }
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </Section>

              <Section title="Jobs on this offer">
                <div className="studio-admin-table-wrap">
                  {(sellerJobs ?? []).filter(
                    (j) => j.offerId === selectedOffer._id,
                  ).length === 0 ? (
                    <p className="studio-settings-empty marketplace-offers-table-empty">
                      No bookings on this offer yet.
                    </p>
                  ) : (
                    <table className="studio-admin-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Booked</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sellerJobs ?? [])
                          .filter((j) => j.offerId === selectedOffer._id)
                          .map((job) => (
                            <tr
                              key={job._id}
                              onClick={() =>
                                setView({ kind: "job", jobId: job._id })
                              }
                            >
                              <td>
                                <StatusChip status={job.status} />
                              </td>
                              <td>
                                {new Date(job.createdAt).toLocaleString()}
                              </td>
                              <td>{formatTtdCents(job.priceCents)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          ) : null}

          {view.kind === "job" ? (
            !jobDetail ? (
              <p className="studio-settings-empty">Loading job…</p>
            ) : (
              <div className="studio-admin-stack">
                <section className="studio-admin-grid-large">
                  <MetricCard
                    label="Price"
                    value={formatTtdCents(jobDetail.job.priceCents)}
                    body={
                      jobDetail.job.role === "seller"
                        ? "Released to you on acceptance."
                        : "Held in escrow until you accept."
                    }
                  />
                  <MetricCard
                    label="Credits held"
                    value={jobDetail.job.priceCredits}
                    body={`Valued at ${creditPriceCents}¢ per credit.`}
                  />
                  <MetricCard
                    label="Booked"
                    value={new Date(
                      jobDetail.job.createdAt,
                    ).toLocaleDateString()}
                    body={new Date(
                      jobDetail.job.createdAt,
                    ).toLocaleTimeString()}
                  />
                </section>

                <Section
                  title={jobDetail.job.offerTitle}
                  extras={
                    <>
                      <span className="marketplace-offers-bar-note">
                        {jobDetail.job.role === "seller" ? "Selling" : "Buying"}
                      </span>
                      <StatusChip status={jobDetail.job.status} />
                    </>
                  }
                >
                  <div className="studio-admin-card">
                    <h3>Timeline</h3>
                    <ol className="marketplace-offers-timeline">
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
                </Section>

                <Section title="Deliverables">
                  <div className="studio-admin-card">
                    {jobDetail.deliverables.length === 0 ? (
                      <p className="studio-settings-empty">
                        Nothing delivered yet.
                      </p>
                    ) : (
                      <ul className="marketplace-offers-deliverables">
                        {jobDetail.deliverables.map((d) => (
                          <li key={d._id}>
                            {d.signedThumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.signedThumbnailUrl} alt="" />
                            ) : (
                              <span
                                className="marketplace-offers-thumb"
                                aria-hidden="true"
                              />
                            )}
                            <div>
                              {d.signedReadUrl ? (
                                <a
                                  href={d.signedReadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
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
                </Section>

                {jobDetail.job.role === "seller" &&
                (jobDetail.job.status === "in_progress" ||
                  jobDetail.job.status === "delivered") ? (
                  <Section
                    title="Submit delivery"
                    extras={
                      selectedAssetIds.length ? (
                        <span className="marketplace-offers-bar-note">
                          {selectedAssetIds.length} selected
                        </span>
                      ) : undefined
                    }
                  >
                    <div className="studio-admin-card">
                      {!recentAssets ? (
                        <p className="studio-settings-empty">Loading assets…</p>
                      ) : recentAssets.length === 0 ? (
                        <p className="studio-settings-empty">
                          No ready assets yet — upload in Explorer first.
                        </p>
                      ) : (
                        <div
                          className="marketplace-offers-asset-grid"
                          role="group"
                          aria-label="Assets"
                        >
                          {recentAssets.map((asset) => {
                            const selected = selectedAssetIds.includes(
                              asset._id,
                            );
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
                      <div className="marketplace-offers-actions">
                        <button
                          type="button"
                          className="is-primary"
                          disabled={busy || selectedAssetIds.length === 0}
                          onClick={() => void handleDeliver()}
                        >
                          Submit delivery
                        </button>
                      </div>
                    </div>
                  </Section>
                ) : null}

                {(jobDetail.job.role === "buyer" &&
                  jobDetail.job.status === "delivered") ||
                jobDetail.job.status === "in_progress" ||
                jobDetail.job.status === "in_escrow" ? (
                  <div className="marketplace-offers-actions">
                    {jobDetail.job.role === "buyer" &&
                    jobDetail.job.status === "delivered" ? (
                      <button
                        type="button"
                        className="is-primary"
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
                        disabled={busy}
                        onClick={() => void handleCancel()}
                      >
                        Cancel &amp; refund escrow
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
