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
      className="cursor-settings-action"
    >
      {label}
    </a>
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

  return (
    <div className="flex flex-col gap-6">
      <section className="studio-admin-card studio-admin-table-card">
        <div className="studio-admin-table-head">
          <div>
            <p className="studio-admin-card-kicker">Sellers</p>
            <h3>Approve marketplace sellers</h3>
          </div>
          <div className="studio-admin-filter-tabs" role="group" aria-label="Seller filters">
            {(["pending", "approved", "suspended", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={sellerFilter === value ? "is-active" : ""}
                onClick={() => setSellerFilter(value)}
              >
                {value}
              </button>
            ))}
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
                          {reviewSellerId === seller._id ? "Hide docs" : "Review"}
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

        {reviewSellerId ? (
          <div className="mt-4 rounded-xl border border-cursor-border-soft p-4">
            {!application ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="studio-admin-card-kicker">Application</p>
                  <h4 className="m-0 text-base font-semibold">{application.businessName}</h4>
                  <p className="m-0 text-cursor-muted">
                    {application.entityType ?? "—"} · {application.legalName ?? "—"} ·{" "}
                    {application.phone ?? "—"}
                  </p>
                </div>
                {application.residentialAddress ? (
                  <p className="m-0">
                    <strong>Residential:</strong> {application.residentialAddress}
                  </p>
                ) : null}
                {application.businessAddress ? (
                  <p className="m-0">
                    <strong>Business address:</strong> {application.businessAddress}
                  </p>
                ) : null}
                {(application.businessRegistrationNumber || application.birNumber) && (
                  <p className="m-0 text-cursor-muted">
                    Reg: {application.businessRegistrationNumber ?? "—"} · BIR:{" "}
                    {application.birNumber ?? "—"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <DocLink
                    label={`Primary ID front (${application.primaryIdKind?.replace(/_/g, " ") ?? "doc"})`}
                    href={application.primaryIdUrl}
                  />
                  <DocLink label="Primary ID back" href={application.primaryIdBackUrl} />
                  <DocLink label="Birth certificate" href={application.birthCertificateUrl} />
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
            )}
          </div>
        ) : null}
      </section>

      <section className="studio-admin-card studio-admin-table-card">
        <div className="studio-admin-table-head">
          <div>
            <p className="studio-admin-card-kicker">Offline payouts</p>
            <h3>Mark creator payouts paid</h3>
          </div>
          <div className="studio-admin-filter-tabs" role="group" aria-label="Payout filters">
            {(["owed", "paid", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={payoutFilter === value ? "is-active" : ""}
                onClick={() => setPayoutFilter(value)}
              >
                {value}
              </button>
            ))}
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
  );
}
