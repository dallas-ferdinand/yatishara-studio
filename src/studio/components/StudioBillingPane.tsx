"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { STUDIO_PLAN_CATALOG, STUDIO_PLAN_SLUGS } from "../../../convex/lib/studioPlans";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  DEFAULT_CREDIT_PRICE_CENTS,
  TOP_UP_TIER_CREDITS,
  creditsFromAmountCents,
  formatTtdCents,
  formatTtdFromCredits,
  formatTtdShort,
  paywiseCardFeeCents,
  paywiseCheckoutTotalCents,
  topUpMinAmountCents,
} from "@/studio/lib/money";
import { StudioConfirmOverlay } from "./StudioConfirmOverlay";
import "./studio-billing.css";

type BillingInterval = "month" | "year";
type InvoiceKind = "all" | "subscription" | "topup" | "academy";
type BillingSection = "plans" | "invoices" | "topup";

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
  discountPercent?: number;
  annualDiscountPercent?: number;
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
  pricing?: {
    creditPriceCents?: number;
  } | null;
  topUpPrefillCents?: number | null;
  onTopUpPrefillConsumed?: () => void;
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

function planPitch(slug: string) {
  if (slug === "plus") return "For regular production";
  if (slug === "pro") return "For heavy Studio work";
  return "For getting started";
}

function planCopy(slug: string, grantLabel: string, discountPercent: number) {
  if (slug === "plus") {
    return [
      `${grantLabel} credited every month after payment`,
      discountPercent > 0 ? `Extra top-up at ${discountPercent}% off` : "Extra top-up on this plan",
      "Upgrade or downgrade anytime",
    ];
  }
  if (slug === "pro") {
    return [
      `${grantLabel} credited every month after payment`,
      discountPercent > 0 ? `Best savings at ${discountPercent}% off` : "Highest monthly grant",
      "Built for Studio + Academy volume",
    ];
  }
  return [
    `${grantLabel} credited every month after payment`,
    "Start generating in Studio",
    "Upgrade anytime",
  ];
}

function newRequestId(prefix: string) {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function amountInputFromCents(amountCents: number) {
  const dollars = Number(amountCents) / 100;
  if (!Number.isFinite(dollars) || dollars <= 0) return "";
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function chipAmountLabel(amountCents: number) {
  const dollars = Number(amountCents) / 100;
  if (!Number.isFinite(dollars)) return "—";
  return `$${dollars.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function BillingTopUp({
  billingAccount,
  pricing,
  topUpPrefillCents,
  onTopUpPrefillConsumed,
  onChoosePlan,
  onWamHandoff,
}: {
  billingAccount: Props["billingAccount"];
  pricing: Props["pricing"];
  topUpPrefillCents?: number | null;
  onTopUpPrefillConsumed?: () => void;
  onChoosePlan: () => void;
  onWamHandoff: Props["onWamHandoff"];
}) {
  const startWamCheckout = useAction(api.wamActions.startCheckout);
  const creditPriceCents = pricing?.creditPriceCents ?? DEFAULT_CREDIT_PRICE_CENTS;
  const minAmountCents = topUpMinAmountCents(creditPriceCents);
  const minAmountLabel = formatTtdCents(minAmountCents);
  const tiers = TOP_UP_TIER_CREDITS.map((credits, index) => ({
    key: `tier-${index}`,
    credits,
    amountCents: Math.round(credits * creditPriceCents),
  }));
  const liveSubscription = billingAccount?.subscription;
  const canTopUp = Boolean(liveSubscription?.canTopUp);
  const topUpDiscountPercent =
    liveSubscription?.interval === "year"
      ? Number(liveSubscription?.annualDiscountPercent ?? 0)
      : Number(liveSubscription?.discountPercent ?? 0);
  const [selectedPlanKey, setSelectedPlanKey] = useState("custom");
  const [customAmountInput, setCustomAmountInput] = useState("");
  const [customAmountError, setCustomAmountError] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [checkoutStarting, setCheckoutStarting] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);
  const customAmountCents = Math.round(Number.parseFloat(customAmountInput || "0") * 100);
  const customCredits = creditsFromAmountCents(customAmountCents, creditPriceCents);
  const checkoutPlan =
    tiers.find((plan) => plan.amountCents === customAmountCents) ??
    (customCredits > 0 && customAmountCents >= minAmountCents
      ? {
          key: "custom",
          credits: customCredits,
          amountCents: customAmountCents,
        }
      : null);
  const topUpChargeCents =
    Number.isFinite(customAmountCents) && customAmountCents >= minAmountCents
      ? Math.round((customAmountCents * (100 - topUpDiscountPercent)) / 100)
      : 0;
  const paywiseFeeCents = topUpChargeCents > 0 ? paywiseCardFeeCents(topUpChargeCents) : 0;
  const paywiseTotalCents = topUpChargeCents > 0 ? paywiseCheckoutTotalCents(topUpChargeCents) : 0;

  useEffect(() => {
    if (topUpPrefillCents == null) return;
    const cents = Math.max(minAmountCents, Math.round(Number(topUpPrefillCents) || 0));
    if (!Number.isFinite(cents) || cents <= 0) {
      onTopUpPrefillConsumed?.();
      return;
    }
    const matched = tiers.find((plan) => plan.amountCents === cents);
    setSelectedPlanKey(matched?.key ?? "custom");
    setCustomAmountInput(amountInputFromCents(cents));
    setCustomAmountError("");
    setPaymentStatus("");
    clientRequestIdRef.current = null;
    onTopUpPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per prefill handoff
  }, [topUpPrefillCents, minAmountCents]);

  async function handleWamCheckout() {
    if (checkoutStarting) return;
    if (!canTopUp) {
      setCustomAmountError("Subscribe to a plan before topping up.");
      return;
    }
    if (!Number.isFinite(customAmountCents) || customAmountCents < minAmountCents) {
      setCustomAmountError(`Enter an amount of at least ${minAmountLabel}.`);
      return;
    }
    if (!checkoutPlan) {
      setCustomAmountError("Amount is too low to add balance.");
      return;
    }
    setCustomAmountError("");
    setSelectedPlanKey(checkoutPlan.key);
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = newRequestId("topup");
    }
    setCheckoutStarting(true);
    setPaymentStatus("Please wait…");
    onWamHandoff({
      phase: "preparing",
      amountCents: topUpChargeCents || checkoutPlan.amountCents,
    });
    try {
      const result = await startWamCheckout({
        clientRequestId: clientRequestIdRef.current,
        amountCents: checkoutPlan.amountCents,
        creditsRequested: checkoutPlan.credits,
        reference: `Top up: ${formatTtdShort(checkoutPlan.amountCents)}`,
      });
      setPaymentStatus("Redirecting…");
      onWamHandoff({
        phase: "redirect",
        amountCents: topUpChargeCents || checkoutPlan.amountCents,
        checkoutUrl: result.checkoutUrl,
      });
    } catch (error) {
      onWamHandoff(null);
      setPaymentStatus(friendlyConvexError(error, "Wam checkout failed."));
      setCheckoutStarting(false);
      clientRequestIdRef.current = null;
    }
  }

  return (
    <div className="studio-billing-canvas">
      <div className="studio-billing-intro">
        <p className="studio-billing-kicker">Billing</p>
        <h1>Add extra balance</h1>
        <p>On a plan, extra top-up uses the same discount.</p>
      </div>
      <div className="studio-billing-topup">
        <div className="studio-billing-current">
          <div>
            <h2>Current balance</h2>
            <strong>
              {formatTtdFromCredits(billingAccount?.creditBalance ?? 0, creditPriceCents)}
            </strong>
            <p>
              {canTopUp
                ? liveSubscription?.planName
                  ? `${liveSubscription.planName} · ${liveSubscription.interval === "year" ? "annual" : "monthly"}${liveSubscription.status === "past_due" ? " · payment due" : ""}`
                  : "Plan active"
                : "Extra top-up is available on a plan."}
            </p>
          </div>
          {canTopUp ? null : (
            <div className="studio-billing-current-actions">
              <button type="button" onClick={onChoosePlan}>
                Choose a plan
              </button>
            </div>
          )}
        </div>
        {canTopUp ? (
          <div className="studio-settings-custom-amount">
            <label className="studio-settings-custom-amount-input is-full is-emphasis">
              {customAmountInput ? <span>$</span> : null}
              <input
                type="number"
                min={minAmountCents / 100}
                step="0.01"
                inputMode="decimal"
                placeholder="eg. $78"
                value={customAmountInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomAmountInput(value);
                  setCustomAmountError("");
                  setPaymentStatus("");
                  const cents = Math.round(Number.parseFloat(value || "0") * 100);
                  const matched = tiers.find((plan) => plan.amountCents === cents);
                  setSelectedPlanKey(matched?.key ?? "custom");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleWamCheckout();
                  }
                }}
              />
              {customAmountInput ? <span>TTD</span> : null}
            </label>
            <div className="studio-settings-topup-chips" role="group" aria-label="Suggested amounts">
              {tiers.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  className={`studio-settings-topup-chip${selectedPlanKey === plan.key && customAmountCents === plan.amountCents ? " is-active" : ""}`}
                  onClick={() => {
                    setSelectedPlanKey(plan.key);
                    setCustomAmountInput(amountInputFromCents(plan.amountCents));
                    setCustomAmountError("");
                    setPaymentStatus("");
                    clientRequestIdRef.current = null;
                  }}
                >
                  {chipAmountLabel(plan.amountCents)}
                </button>
              ))}
            </div>
            {Number.isFinite(customAmountCents) &&
            customAmountCents >= minAmountCents &&
            paywiseTotalCents > 0 ? (
              <dl className="studio-academy-checkout-receipt studio-settings-billing-receipt">
                <div className="studio-academy-checkout-row">
                  <dt>Add to account</dt>
                  <dd>{formatTtdCents(customAmountCents)}</dd>
                </div>
                {topUpDiscountPercent > 0 ? (
                  <div className="studio-academy-checkout-row is-muted">
                    <dt>Plan discount ({topUpDiscountPercent}%)</dt>
                    <dd>{formatTtdCents(topUpChargeCents)}</dd>
                  </div>
                ) : null}
                {paywiseFeeCents > 0 ? (
                  <div className="studio-academy-checkout-row is-muted">
                    <dt>Card fee</dt>
                    <dd>{formatTtdShort(paywiseFeeCents)}</dd>
                  </div>
                ) : null}
                <div className="studio-academy-checkout-row is-total">
                  <dt>Total</dt>
                  <dd>{formatTtdCents(paywiseTotalCents)}</dd>
                </div>
              </dl>
            ) : null}
            <button
              type="button"
              className={`studio-settings-topup-pay${
                checkoutStarting ? " is-loading" : ""
              }${
                !checkoutStarting &&
                (customAmountError ||
                  /fail|error|not completed|cancelled|missing|could not/i.test(paymentStatus))
                  ? " is-error"
                  : ""
              }`}
              disabled={!checkoutPlan || customAmountCents < minAmountCents || checkoutStarting}
              aria-busy={checkoutStarting}
              onClick={() => void handleWamCheckout()}
            >
              {checkoutStarting ? (
                <Loader2 className="studio-settings-topup-pay-spin" aria-hidden="true" />
              ) : null}
              <span className="studio-settings-topup-pay-label">
                {checkoutStarting
                  ? paymentStatus || "Please wait…"
                  : customAmountError
                    ? customAmountError
                    : paymentStatus ||
                      (paywiseTotalCents > 0
                        ? `Pay ${formatTtdShort(paywiseTotalCents)} with Wam`
                        : "Pay with Wam")}
              </span>
            </button>
            <p className="studio-settings-topup-secure">
              <Lock aria-hidden="true" />
              <span>secure checkout</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StudioBillingPane({
  section,
  onSection,
  billingAccount,
  payments,
  pricing,
  topUpPrefillCents,
  onTopUpPrefillConsumed,
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
    if (!catalog) return;
    const bySlug = new Map(catalog.map((plan) => [plan.slug, plan]));
    const ratesStale = STUDIO_PLAN_CATALOG.some((want) => {
      const have = bySlug.get(want.slug);
      if (!have) return true;
      return (
        Number(have.discountPercent ?? 0) !== want.monthlyDiscountPercent ||
        Number(have.annualDiscountPercent ?? 0) !== want.annualDiscountPercent ||
        Number(have.originalMonthlyPriceCents ?? have.monthlyPriceCents) !== want.faceMonthlyCents
      );
    });
    const extraPlans = catalog.some((plan) => !STUDIO_PLAN_SLUGS.includes(plan.slug as (typeof STUDIO_PLAN_SLUGS)[number]));
    if (!ratesStale && !extraPlans) return;
    void ensureStudioPlans({}).catch(() => {});
  }, [catalog, ensureStudioPlans]);

  const plans = useMemo(
    () =>
      [...(catalog ?? [])]
        .filter((plan) => STUDIO_PLAN_SLUGS.includes(plan.slug as (typeof STUDIO_PLAN_SLUGS)[number]))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 3),
    [catalog],
  );
  const maxAnnualSave = Math.max(
    ...STUDIO_PLAN_CATALOG.map((plan) => plan.annualDiscountPercent),
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
          <button
            type="button"
            role="tab"
            className={`studio-admin-head-tab${section === "topup" ? " is-active" : ""}`}
            aria-selected={section === "topup"}
            onClick={() => onSection("topup")}
          >
            Top-up
          </button>
        </nav>
      </header>

      <div className="studio-billing-body">
        {section === "plans" ? (
          <div className="studio-billing-canvas">
            <div className="studio-billing-intro">
              <p className="studio-billing-kicker">Yatishara Studio</p>
              <h1>Pick the plan that keeps you making</h1>
              <p>Subscribe to a community of creators and builders just like you.</p>
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
                <span>Save up to {maxAnnualSave}%</span>
              </button>
            </div>

            <div className="studio-billing-plans">
              {plans.map((plan) => {
                const quote = quotePlan(plan, interval);
                const featured = plan.slug === "plus";
                const current = live && plan._id === currentPlanId && (sub?.interval ?? "month") === interval;
                const label = actionLabel(plan);
                const faceYearCents = quote.faceMonthlyCents * (interval === "year" ? 12 : 1);
                return (
                  <article
                    key={plan._id}
                    className={`studio-billing-card${featured ? " is-featured" : ""}${current ? " is-current" : ""}`}
                  >
                    <div className="studio-billing-card-kicker">
                      <div>
                        <h3>{plan.name}</h3>
                        <p className="studio-billing-pitch">{planPitch(plan.slug)}</p>
                      </div>
                      {featured ? <span className="studio-billing-badge">Most popular</span> : null}
                    </div>
                    <div className="studio-billing-price-block">
                      <p className="studio-billing-price">
                        {quote.discountPercent > 0 ? (
                          <s className="studio-academy-card-compare">{formatTtdShort(faceYearCents)}</s>
                        ) : null}
                        <span className="studio-billing-price-now">
                          {formatTtdShort(quote.chargeCents)}
                          <span className="studio-billing-price-unit">
                            {interval === "year" ? "/yr" : "/mo"}
                          </span>
                        </span>
                        {quote.discountPercent > 0 ? (
                          <span className="studio-billing-save">Save {quote.discountPercent}%</span>
                        ) : null}
                      </p>
                      {interval === "year" ? (
                        <p className="studio-billing-equiv">
                          {formatTtdShort(Math.round(quote.chargeCents / 12))}/mo billed yearly ·{" "}
                          {formatTtdShort(quote.faceMonthlyCents)} still lands each month
                        </p>
                      ) : (
                        <p className="studio-billing-equiv">
                          {formatTtdShort(quote.faceMonthlyCents)} credited every month
                        </p>
                      )}
                    </div>
                    <ul>
                      {planCopy(plan.slug, formatTtdShort(quote.faceMonthlyCents), quote.discountPercent).map((line) => (
                        <li key={line}>
                          <Check aria-hidden="true" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`studio-billing-card-cta${current ? " is-ghost" : featured ? " is-featured-cta" : ""}`}
                      disabled={Boolean(busy) || current}
                      onClick={() => void checkout(plan)}
                    >
                      <span>{busy === plan._id ? "Opening checkout…" : label}</span>
                      {current || busy === plan._id ? null : <ArrowRight aria-hidden="true" />}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ) : section === "topup" ? (
          <BillingTopUp
            billingAccount={billingAccount}
            pricing={pricing}
            topUpPrefillCents={topUpPrefillCents}
            onTopUpPrefillConsumed={onTopUpPrefillConsumed}
            onChoosePlan={() => onSection("plans")}
            onWamHandoff={onWamHandoff}
          />
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
