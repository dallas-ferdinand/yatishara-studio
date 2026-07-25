"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";

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

export function AdminMarketplacePane() {
  const [sellerFilter, setSellerFilter] = useState<"all" | "pending" | "approved" | "suspended">("pending");
  const [payoutFilter, setPayoutFilter] = useState<"owed" | "paid" | "all">("owed");
  const [busy, setBusy] = useState(false);
  const [reviewSellerId, setReviewSellerId] = useState<Id<"marketplaceSellers"> | null>(null);

  const sellers = useQuery(
    api.marketplace.adminListSellers,
    sellerFilter === "all" ? {} : { status: sellerFilter },
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

  const reviewSeller = sellers?.find((seller) => seller._id === reviewSellerId) ?? null;

  return (
    <>
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Sellers</span>
          <div className="studio-admin-section-extras">
            <select
              className="studio-admin-filter-select"
              aria-label="Seller status"
              value={sellerFilter}
              onChange={(event) =>
                setSellerFilter(
                  event.target.value as "all" | "pending" | "approved" | "suspended",
                )
              }
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="suspended">Suspended</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        <div className="studio-admin-table-wrap">
          {!sellers ? (
            <Loader2 className="m-4 h-4 w-4 animate-spin" />
          ) : (
            <table className="studio-admin-table">
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
                {sellers.map((seller) => (
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
            </table>
          )}
          {sellers && !sellers.length ? (
            <p className="studio-settings-empty">No sellers in this filter.</p>
          ) : null}
        </div>

      </section>

      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Payouts</span>
          <div className="studio-admin-section-extras">
            <select
              className="studio-admin-filter-select"
              aria-label="Payout status"
              value={payoutFilter}
              onChange={(event) =>
                setPayoutFilter(event.target.value as "owed" | "paid" | "all")
              }
            >
              <option value="owed">Owed</option>
              <option value="paid">Paid</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        <div className="studio-admin-table-wrap">
          {!payouts ? (
            <Loader2 className="m-4 h-4 w-4 animate-spin" />
          ) : (
            <table className="studio-admin-table">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout._id}>
                    <td>
                      <strong>{payout.businessName ?? payout.sellerUserId}</strong>
                      <span>{payout.jobId}</span>
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
            </table>
          )}
          {payouts && !payouts.length ? (
            <p className="studio-settings-empty">No payouts in this filter.</p>
          ) : null}
        </div>
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
