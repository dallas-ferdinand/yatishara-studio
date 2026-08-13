"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents, formatTtdShort } from "@/studio/lib/money";
import { StudioConfirmOverlay } from "./StudioConfirmOverlay";
import "./studio-billing.css";

type BillingInterval = "month" | "year";
type InvoiceKind = "all" | "subscription" | "topup" | "academy";
type BillingSection = "plans" | "invoices";

type CatalogPlan = {
  _id: string;
  name: string;
  slug: string;
  monthlyPriceCents: number;
  originalMonthlyPriceCents?: number;
  discountPercent?: number;
  annualDiscountPercent?: number;
  sortOrder: number;
};

type AccountSub = {
  status: string;
  interval?: BillingInterval;
  currentPeriodEnd?: number;
  planId?: string;
  planName?: string;
  planSlug?: string;
  cancelAtPeriodEnd?: boolean;
  cancelScheduledAt?: number;
  canTopUp?: boolean;
} | null;

type InvoiceRow = {
  _id: string;
  amountCents: number;
  status: string;
  createdAt: number;
  billingInterval?: BillingInterval;
  academyCourseId?: string;
  subscriptionPlanId?: string;
  reference?: string;
  providerStatus?: string;
};

type Props = {
  section: BillingSection;
  onSection: (section: BillingSection) => void;
  billingAccount: {
    creditBalance?: number;
    subscription?: AccountSub;
  } | null;
  payments: InvoiceRow[] | undefined;
  onWamHandoff: (handoff: {
    phase: "preparing" | "redirect";
    amountCents?: number;
    checkoutUrl?: string;
  } | null) => void;
};

function quotePlan(plan: CatalogPlan, interval: BillingInterval) {
  const face = Number(plan.originalMonthlyPriceCents ?? plan.monthlyPriceCents ?? 0);
  const discount =
    interval === "year"
      ? Number(plan.annualDiscountPercent ?? 0)
      : Number(plan.discountPercent ?? 0);
  const faceCharge = interval === "year" ? face * 12 : face;
  return {
    faceMonthlyCents: face,
    discountPercent: discount,
    chargeCents: Math.round((faceCharge * (100 - discount)) / 100),
  };
}

function invoiceKind(row: InvoiceRow): Exclude<InvoiceKind, "all"> {
  if (row.academyCourseId) return "academy";
  if (row.subscriptionPlanId || row.billingInterval) return "subscription";
  return "topup";
}

function invoiceTitle(row: InvoiceRow) {
  if (row.reference?.trim()) return row.reference.trim();
  if (row.billingInterval === "year") return "Annual plan";
  if (row.subscriptionPlanId) return "Monthly plan";
  if (row.academyCourseId) return "Academy course";
  return "Top-up";
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    needs_review: "Needs review",
    checkout_failed: "Failed",
    cancelled: "Cancelled",
    receipt_uploaded: "Receipt uploaded",
    receipt_received: "Receipt received",
    payment_completed: "Paid",
    rejected: "Rejected",
  };
  return labels[status] ?? status;
}

function canPayInvoice(row: InvoiceRow) {
  if (!row.subscriptionPlanId) return false;
  return row.status === "pending" || row.status === "checkout_failed";
}

function planCopy(slug: string) {
  if (slug === "plus") {
    return ["Full monthly grant after each paid charge", "Extra top-up at your plan discount", "Upgrade or downgrade anytime"];
  }
  if (slug === "pro") {
    return ["Highest monthly grant", "Best annual savings", "For heavy Studio + Academy use"];
  }
  return ["Start generating in Studio", "Monthly grant after payment", "Upgrade anytime"];
}

function newRequestId(prefix: string) {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function StudioBillingPane({
  section,
  onSection,
  billingAccount,
  payments,
  onWamHandoff,
}: Props) {
  const catalog = useQuery(api.billing.listSubscriptionPlans, {});
  const ensureStudioPlans = useMutation(api.billing.ensureStudioPlans);
  const startSubscribe = useAction(api.wamActions.startSubscribe);
  const startInvoicePay = useAction(api.wamActions.startInvoicePay);
  const stopRecurring = useAction(api.wamActions.stopRecurring);
  const resumeWam = useAction(api.wamActions.resumeWamRecurring);
  const cancelMyPlan = useMutation(api.subscriptions.cancelMyPlan);
  const resumeMyPlan = useMutation(api.subscriptions.resumeMyPlan);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceKind>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const requestIds = useRef(new Map<string, string>());
  const sub = billingAccount?.subscription ?? null;
  const currentPlanId = sub?.planId || "";
  const live = Boolean(sub && (sub.status === "active" || sub.status === "past_due"));

  useEffect(() => {
    if (!catalog || catalog.length > 0) return;
    void ensureStudioPlans({}).catch(() => {});
  }, [catalog, ensureStudioPlans]);

  const plans = useMemo(
    () => [...(catalog ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3),
    [catalog],
  );

  const filteredInvoices = useMemo(
    () => (payments ?? []).filter((row) => invoiceFilter === "all" || invoiceKind(row) === invoiceFilter),
    [payments, invoiceFilter],
  );

  function requestIdFor(key: string, prefix: string) {
    const existing = requestIds.current.get(key);
    if (existing) return existing;
    const next = newRequestId(prefix);
    requestIds.current.set(key, next);
    return next;
  }

  async function checkout(plan: CatalogPlan) {
    const quote = quotePlan(plan, interval);
    setBusy(plan._id);
    onWamHandoff({ phase: "preparing", amountCents: quote.chargeCents });
    try {
      const result = await startSubscribe({
        clientRequestId: requestIdFor(`${plan._id}:${interval}`, "sub"),
        planId: plan._id as never,
        interval,
      });
      onWamHandoff({
        phase: "redirect",
        amountCents: quote.chargeCents,
        checkoutUrl: result.checkoutUrl,
      });
    } catch (error) {
      onWamHandoff(null);
      requestIds.current.delete(`${plan._id}:${interval}`);
      toast.error(friendlyConvexError(error, "Could not start checkout."));
    } finally {
      setBusy(null);
    }
  }

  async function payInvoice(row: InvoiceRow) {
    setBusy(row._id);
    onWamHandoff({ phase: "preparing", amountCents: row.amountCents });
    try {
      const result = await startInvoicePay({
        paymentId: row._id as never,
        clientRequestId: requestIdFor(`invoice:${row._id}`, "inv"),
      });
      onWamHandoff({
        phase: "redirect",
        amountCents: row.amountCents,
        checkoutUrl: result.checkoutUrl,
      });
    } catch (error) {
      onWamHandoff(null);
      requestIds.current.delete(`invoice:${row._id}`);
      toast.error(friendlyConvexError(error, "Could not start payment."));
    } finally {
      setBusy(null);
    }
  }

  async function cancelPlan() {
    setBusy("cancel");
    try {
      const result = await cancelMyPlan({});
      if (result.wamSubscriptionId) {
        await stopRecurring({ wamSubscriptionId: result.wamSubscriptionId });
      }
      setManageOpen(false);
      toast.success(
        result.mode === "immediate"
          ? "Plan cancelled. No further charges."
          : "Billing stops at the next payment date. Resume before then to keep it.",
      );
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not cancel."));
    } finally {
      setBusy(null);
    }
  }

  async function resumePlan() {
    setBusy("resume");
    try {
      const result = await resumeMyPlan({});
      if (result.needsWamResume) {
        await resumeWam({});
      }
      toast.success("Plan resumed. Billing continues.");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not resume."));
    } finally {
      setBusy(null);
    }
  }

  function actionLabel(plan: CatalogPlan) {
    if (!live) return "Subscribe";
    if (plan._id === currentPlanId) {
      if ((sub?.interval ?? "month") === interval) return "Current plan";
      return interval === "year" ? "Switch to annual" : "Switch to monthly";
    }
    const current = plans.find((item) => item._id === currentPlanId);
    if (!current) return "Switch plan";
    return plan.sortOrder > current.sortOrder ? "Upgrade" : "Downgrade";
  }

  return (
    <div className="studio-billing-pane">
      <header className="studio-admin-head">
        <nav className="studio-admin-head-tabs" aria-label="Billing">
          <button
            type="button"
            role="tab"
            className={`studio-admin-head-tab${section === "plans" ? " is-active" : ""}`}
            aria-selected={section === "plans"}
            onClick={() => onSection("plans")}
          >
            Plans
          </button>
          <button
            type="button"
            role="tab"
            className={`studio-admin-head-tab${section === "invoices" ? " is-active" : ""}`}
            aria-selected={section === "invoices"}
            onClick={() => onSection("invoices")}
          >
            Invoices
          </button>
        </nav>
      </header>

      <div className="studio-billing-body">
        {section === "plans" ? (
          <div className="studio-billing-canvas">
            <div className="studio-billing-intro">
              <p className="studio-billing-kicker">Yatishara Studio</p>
              <h1>Choose a plan</h1>
              <p>Pay less, get the full monthly amount. Annual is prepaid; balance still lands each month.</p>
            </div>

            {live ? (
              <div className="studio-billing-current">
                <div>
                  <h2>Your plan</h2>
                  <strong>{sub?.planName || "Studio"}</strong>
                  <p>
                    {sub?.cancelAtPeriodEnd
                      ? `Cancels ${sub.cancelScheduledAt ? new Date(sub.cancelScheduledAt).toLocaleDateString() : "at period end"}. Resume before then to keep it.`
                      : sub?.status === "past_due"
                        ? "Payment failed. Open Invoices and pay to keep the plan."
                        : `Renews ${sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "next cycle"}.`}
                  </p>
                </div>
                <div className="studio-billing-current-actions">
                  {sub?.cancelAtPeriodEnd ? (
                    <button type="button" disabled={busy === "resume"} onClick={() => void resumePlan()}>
                      Resume plan
                    </button>
                  ) : (
                    <button type="button" className="is-danger" onClick={() => setManageOpen(true)}>
                      Manage plan
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="studio-billing-period" role="tablist" aria-label="Billing period">
              <button
                type="button"
                className={interval === "month" ? "is-active" : ""}
                onClick={() => setInterval("month")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={interval === "year" ? "is-active" : ""}
                onClick={() => setInterval("year")}
              >
                Annual
              </button>
            </div>

            <div className="studio-billing-plans">
              {plans.map((plan) => {
                const quote = quotePlan(plan, interval);
                const featured = plan.slug === "plus";
                const current = live && plan._id === currentPlanId && (sub?.interval ?? "month") === interval;
                const label = actionLabel(plan);
                return (
                  <article
                    key={plan._id}
                    className={`studio-billing-card${featured ? " is-featured" : ""}${current ? " is-current" : ""}`}
                  >
                    <div className="studio-billing-card-kicker">
                      <h3>{plan.name}</h3>
                      {featured ? <span className="studio-billing-badge">Popular</span> : null}
                    </div>
                    <p className="studio-billing-price">
                      {formatTtdShort(quote.chargeCents)}
                      <span>{interval === "year" ? "/yr" : "/mo"}</span>
                    </p>
                    <p>
                      {quote.discountPercent > 0
                        ? `Pay ${quote.discountPercent}% less, get ${formatTtdShort(quote.faceMonthlyCents)} every month.`
                        : `Get ${formatTtdShort(quote.faceMonthlyCents)} every month.`}
                    </p>
                    <ul>
                      {planCopy(plan.slug).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={current ? "is-ghost" : ""}
                      disabled={Boolean(busy) || current}
                      onClick={() => void checkout(plan)}
                    >
                      {busy === plan._id ? "Opening checkout…" : label}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="studio-billing-canvas">
            <div className="studio-billing-intro">
              <p className="studio-billing-kicker">Billing</p>
              <h1>Invoices</h1>
              <p>Payments and failed attempts. If an auto-charge misses, pay here while Wam retries.</p>
            </div>
            <div className="studio-billing-filters">
              {(["all", "subscription", "topup", "academy"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={invoiceFilter === kind ? "is-active" : ""}
                  onClick={() => setInvoiceFilter(kind)}
                >
                  {kind === "all" ? "All" : kind === "topup" ? "Top-up" : kind === "academy" ? "Academy" : "Subscription"}
                </button>
              ))}
            </div>
            {filteredInvoices.length === 0 ? (
              <p className="studio-billing-empty">No invoices in this filter.</p>
            ) : (
              filteredInvoices.map((row) => (
                <div key={row._id} className="studio-billing-invoice">
                  <div>
                    <strong>{invoiceTitle(row)}</strong>
                    <span>
                      {invoiceKind(row)} · {invoiceStatusLabel(row.status)}
                      {row.providerStatus && row.status !== "payment_completed"
                        ? ` · ${row.providerStatus}`
                        : ""}{" "}
                      · {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="studio-billing-invoice-meta">
                    <strong>{formatTtdCents(row.amountCents)}</strong>
                    {canPayInvoice(row) ? (
                      <button type="button" disabled={Boolean(busy)} onClick={() => void payInvoice(row)}>
                        {busy === row._id ? "Opening…" : "Pay"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <StudioConfirmOverlay
        open={manageOpen}
        title="Cancel this plan?"
        body={
          sub?.status === "past_due"
            ? "This period was not paid, so the plan will cancel now. No further charges."
            : "Billing stops at the next payment date. You can resume before then. After that date you will need a new subscription."
        }
        confirmLabel="Cancel plan"
        cancelLabel="Keep plan"
        danger
        busy={busy === "cancel"}
        onConfirm={() => void cancelPlan()}
        onCancel={() => setManageOpen(false)}
      />
    </div>
  );
}
