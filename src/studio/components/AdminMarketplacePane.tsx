"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  Briefcase,
  CheckCircle2,
  Clock3,
  LayoutList,
  Loader2,
  Store,
  Undo2,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CursorSelect } from "@/desk/components/CursorSelect";
import { CursorTable } from "@/desk/components/CursorTable";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";

type JobStatus =
  | "pending_payment"
  | "in_escrow"
  | "in_progress"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

function DocLink({ label, href }: { label: string; href?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="studio-admin-kyc-doc"
    >
      {label}
    </a>
  );
}

function KycLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <p className="studio-bank-row">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </p>
  );
}

type PayoutAccount = {
  bankName?: string;
  accountName?: string;
  accountNumber: string;
  accountType?: "chequing" | "savings";
  branch?: string;
  note?: string;
};

/** Everything finance needs to send the transfer, straight from the seller's Settings. */
function PayoutDestination({ account }: { account: PayoutAccount | null }) {
  if (!account) {
    return (
      <span className="studio-admin-payout-missing">
        No bank details — ask the seller to add them in Settings → Payouts
      </span>
    );
  }
  const line = [account.bankName, account.accountType, account.branch]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="studio-admin-payout-dest">
      <strong>{account.accountName || "—"}</strong>
      <button
        type="button"
        className="studio-admin-job-link"
        title="Copy account number"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(account.accountNumber)
            .then(() => toast.success("Account number copied"))
            .catch(() => toast.error("Could not copy"));
        }}
      >
        {account.accountNumber}
      </button>
      {line ? <span>{line}</span> : null}
      {account.note ? <span>{account.note}</span> : null}
    </div>
  );
}

function humanizeJobStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatJobAge(createdAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function AdminMarketplacePane() {
  const [sellerFilter, setSellerFilter] = useState<"all" | "pending" | "approved" | "suspended">("pending");
  const [jobFilter, setJobFilter] = useState<"all" | JobStatus>("all");
  const [payoutFilter, setPayoutFilter] = useState<"owed" | "paid" | "all">("owed");
  const [busy, setBusy] = useState(false);
  const [reviewSellerId, setReviewSellerId] = useState<Id<"marketplaceSellers"> | null>(null);
  const [focusJobId, setFocusJobId] = useState<Id<"marketplaceJobs"> | null>(null);
  const [refundJobId, setRefundJobId] = useState<Id<"marketplaceJobs"> | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const jobsSectionRef = useRef<HTMLElement | null>(null);

  const sellers = useQuery(
    api.marketplace.adminListSellers,
    sellerFilter === "all" ? {} : { status: sellerFilter },
  );
  const jobs = useQuery(
    api.marketplace.adminListJobs,
    jobFilter === "all" ? {} : { status: jobFilter },
  );
  const payouts = useQuery(
    api.marketplace.adminListPayouts,
    payoutFilter === "all" ? {} : { status: payoutFilter },
  );
  const application = useQuery(
    api.marketplace.adminGetSellerApplication,
    reviewSellerId ? { sellerId: reviewSellerId } : "skip",
  );

  const approveSeller = useMutation(api.marketplace.adminApproveSeller);
  const markPaid = useMutation(api.marketplace.adminMarkPayoutPaid);
  const refundJob = useMutation(api.marketplace.adminRefundDeliveredJob);

  useEffect(() => {
    if (!focusJobId || !jobs) return;
    jobsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusJobId, jobs]);

  async function setSeller(
    sellerId: Id<"marketplaceSellers">,
    approve: boolean,
  ) {
    setBusy(true);
    try {
      await approveSeller({ sellerId, approve });
      toast.success(approve ? "Seller approved" : "Seller suspended");
      if (approve && reviewSellerId === sellerId) setReviewSellerId(null);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Seller update failed."));
    } finally {
      setBusy(false);
    }
  }

  async function payPayout(payoutId: Id<"sellerPayouts">) {
    const note = window.prompt("Optional payout note", "") ?? undefined;
    setBusy(true);
    try {
      await markPaid({ payoutId, adminNote: note || undefined });
      toast.success("Payout marked paid");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not mark payout paid."));
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund() {
    if (!refundJobId) return;
    const reason = refundReason.trim();
    if (!reason) {
      toast.error("Refund reason is required.");
      return;
    }
    setBusy(true);
    try {
      await refundJob({ jobId: refundJobId, reason });
      toast.success("Job refunded");
      setRefundJobId(null);
      setRefundReason("");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Refund failed."));
    } finally {
      setBusy(false);
    }
  }

  const reviewSeller = sellers?.find((seller) => seller._id === reviewSellerId) ?? null;

  return (
    <>
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Sellers</span>
          <div className="studio-admin-section-extras">
            <CursorSelect
              ariaLabel="Seller status"
              value={sellerFilter}
              onChange={(next) =>
                setSellerFilter(next as "all" | "pending" | "approved" | "suspended")
              }
              options={[
                { value: "pending", label: "Pending", icon: <Clock3 />, tone: "warn" },
                { value: "approved", label: "Approved", icon: <CheckCircle2 />, tone: "good" },
                { value: "suspended", label: "Suspended", icon: <Ban />, tone: "bad" },
                { value: "all", label: "All", icon: <LayoutList />, tone: "muted" },
              ]}
            />
          </div>
        </div>
        <CursorTable
          ariaLabel="Sellers"
          loading={!sellers}
          empty={!!sellers && !sellers.length}
          emptyIcon={<Store />}
          emptyTitle="No sellers"
          emptyHint="No sellers match this filter yet."
        >
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sellers ?? []).map((seller) => (
                  <tr key={seller._id}>
                    <td>
                      <strong>{seller.businessName}</strong>
                      <span>{seller.legalName ?? seller.name ?? seller.userId}</span>
                    </td>
                    <td>
                      <span>
                        {seller.entityType
                          ? seller.entityType === "business"
                            ? seller.businessType?.replace(/_/g, " ") ?? "business"
                            : "freelancer"
                          : "—"}
                      </span>
                    </td>
                    <td>
                      <span>{seller.email ?? seller.phone ?? "—"}</span>
                    </td>
                    <td>{seller.status}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="cursor-settings-action"
                          disabled={busy}
                          onClick={() =>
                            setReviewSellerId((cur) =>
                              cur === seller._id ? null : seller._id,
                            )
                          }
                        >
                          Review
                        </button>
                        {seller.status !== "approved" ? (
                          <button
                            type="button"
                            className="cursor-settings-action"
                            disabled={busy}
                            onClick={() => void setSeller(seller._id, true)}
                          >
                            Approve
                          </button>
                        ) : null}
                        {seller.status !== "suspended" ? (
                          <button
                            type="button"
                            className="cursor-settings-action"
                            disabled={busy}
                            onClick={() => void setSeller(seller._id, false)}
                          >
                            Suspend
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
        </CursorTable>

      </section>

      <section className="studio-admin-section" ref={jobsSectionRef}>
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Jobs</span>
          <div className="studio-admin-section-extras">
            <CursorSelect
              ariaLabel="Job status"
              value={jobFilter}
              onChange={(next) => setJobFilter(next as "all" | JobStatus)}
              options={[
                { value: "all", label: "All", icon: <LayoutList />, tone: "muted" },
                { value: "in_escrow", label: "In escrow", icon: <Wallet />, tone: "warn" },
                { value: "in_progress", label: "In progress", icon: <Briefcase />, tone: "info" },
                { value: "delivered", label: "Delivered", icon: <Clock3 />, tone: "warn" },
                { value: "completed", label: "Completed", icon: <CheckCircle2 />, tone: "good" },
                { value: "refunded", label: "Refunded", icon: <Undo2 />, tone: "muted" },
                { value: "cancelled", label: "Cancelled", icon: <Ban />, tone: "bad" },
                { value: "pending_payment", label: "Pending payment", icon: <Clock3 />, tone: "warn" },
              ]}
            />
          </div>
        </div>
        <CursorTable
          ariaLabel="Marketplace jobs"
          loading={!jobs}
          empty={!!jobs && !jobs.length}
          emptyIcon={<Briefcase />}
          emptyTitle="No jobs"
          emptyHint="No jobs match this filter yet."
        >
          <thead>
            <tr>
              <th>Offer</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Age</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((job) => (
              <tr
                key={job._id}
                className={focusJobId === job._id ? "is-selected" : ""}
                onClick={() => setFocusJobId(job._id)}
              >
                <td>
                  <strong>{job.offerTitle}</strong>
                </td>
                <td>
                  <span>{job.buyerLabel}</span>
                </td>
                <td>
                  <span>{job.sellerLabel}</span>
                </td>
                <td>{formatTtdCents(job.priceCents)}</td>
                <td>{humanizeJobStatus(job.status)}</td>
                <td>{formatJobAge(job.createdAt)}</td>
                <td>
                  {job.canRefund ? (
                    <button
                      type="button"
                      className="cursor-settings-action"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setRefundJobId(job._id);
                        setRefundReason("");
                        setFocusJobId(job._id);
                      }}
                    >
                      Refund
                    </button>
                  ) : (
                    <span className="text-cursor-muted">
                      {job.hasEscrow ? "—" : "No escrow"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </CursorTable>
        {refundJobId ? (
          <div className="studio-admin-credit-form" style={{ marginTop: 8 }}>
            <p className="studio-admin-card-kicker">Refund escrow</p>
            <p className="studio-settings-empty">
              Returns held credits to the buyer and marks the job refunded.
            </p>
            <label className="studio-admin-status-field">
              <span>Reason</span>
              <input
                className="cursor-input"
                type="text"
                placeholder="Why refund this job?"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cursor-settings-action"
                disabled={busy}
                onClick={() => void submitRefund()}
              >
                Confirm refund
              </button>
              <button
                type="button"
                className="cursor-settings-action"
                disabled={busy}
                onClick={() => {
                  setRefundJobId(null);
                  setRefundReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Payouts</span>
          <div className="studio-admin-section-extras">
            <CursorSelect
              ariaLabel="Payout status"
              value={payoutFilter}
              onChange={(next) => setPayoutFilter(next as "owed" | "paid" | "all")}
              options={[
                { value: "owed", label: "Owed", icon: <Wallet />, tone: "warn" },
                { value: "paid", label: "Paid", icon: <CheckCircle2 />, tone: "good" },
                { value: "all", label: "All", icon: <LayoutList />, tone: "muted" },
              ]}
            />
          </div>
        </div>
        <CursorTable
          ariaLabel="Payouts"
          loading={!payouts}
          empty={!!payouts && !payouts.length}
          emptyIcon={<Wallet />}
          emptyTitle="No payouts"
          emptyHint="No payouts match this filter yet."
        >
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Pay to</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(payouts ?? []).map((payout) => (
                  <tr key={payout._id}>
                    <td>
                      <strong>{payout.businessName ?? payout.sellerUserId}</strong>
                      <button
                        type="button"
                        className="studio-admin-job-link"
                        onClick={() => {
                          setJobFilter("all");
                          setFocusJobId(payout.jobId);
                        }}
                      >
                        {payout.offerTitle ?? "Open job"}
                      </button>
                    </td>
                    <td>
                      <PayoutDestination account={payout.payoutAccount} />
                    </td>
                    <td>{formatTtdCents(payout.amountCents)}</td>
                    <td>{payout.status}</td>
                    <td>
                      {payout.status === "owed" ? (
                        <button
                          type="button"
                          className="cursor-settings-action"
                          disabled={busy}
                          onClick={() => void payPayout(payout._id)}
                        >
                          Mark paid
                        </button>
                      ) : (
                        <span className="text-cursor-muted">
                          {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "Paid"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
        </CursorTable>
      </section>
    </div>

    {reviewSellerId ? (
      <>
        <button
          type="button"
          className="studio-admin-payment-sidebar-backdrop"
          onClick={() => setReviewSellerId(null)}
          aria-label="Close application"
        />
        <aside className="studio-admin-payment-sidebar studio-admin-kyc-sidebar">
          <header className="studio-admin-payment-sidebar-head">
            <div>
              <p className="studio-admin-card-kicker">Seller application</p>
              <h3>{application?.businessName ?? reviewSeller?.businessName ?? "Review"}</h3>
            </div>
            <button
              type="button"
              className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close"
              onClick={() => setReviewSellerId(null)}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          {!application ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <div className="studio-admin-detail-list">
                <KycLine label="Status" value={reviewSeller?.status} />
                <KycLine label="Entity" value={application.entityType} />
                <KycLine label="Legal name" value={application.legalName} />
                <KycLine label="Phone" value={application.phone} />
                <KycLine label="Residential" value={application.residentialAddress} />
                <KycLine label="Business address" value={application.businessAddress} />
                <KycLine label="Registration" value={application.businessRegistrationNumber} />
                <KycLine label="BIR" value={application.birNumber} />
              </div>

              <div className="studio-admin-kyc-docs">
                <p className="studio-admin-card-kicker">Documents</p>
                <div className="studio-admin-kyc-doc-list">
                  <DocLink
                    label={`ID 1 (${application.identityDoc1Kind?.replace(/_/g, " ") ?? "doc"})`}
                    href={application.identityDoc1Url}
                  />
                  <DocLink label="ID 1 back" href={application.identityDoc1BackUrl} />
                  <DocLink
                    label={`ID 2 (${application.identityDoc2Kind?.replace(/_/g, " ") ?? "doc"})`}
                    href={application.identityDoc2Url}
                  />
                  <DocLink label="ID 2 back" href={application.identityDoc2BackUrl} />
                  <DocLink
                    label="Residential address proof"
                    href={application.proofOfResidentialAddressUrl}
                  />
                  <DocLink
                    label="Business registration"
                    href={application.businessRegistrationUrl}
                  />
                  <DocLink
                    label="Business address proof"
                    href={application.proofOfBusinessAddressUrl}
                  />
                </div>
              </div>
            </>
          )}

          <div className="studio-admin-detail-actions">
            {reviewSeller?.status !== "approved" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setSeller(reviewSellerId, true)}
              >
                Approve seller
              </button>
            ) : null}
            {reviewSeller?.status !== "suspended" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setSeller(reviewSellerId, false)}
              >
                Suspend
              </button>
            ) : null}
          </div>
        </aside>
      </>
    ) : null}
    </>
  );
}
