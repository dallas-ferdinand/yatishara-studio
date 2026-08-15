/** Display helpers — billing ledger stays in credits; UI shows TTD (0.50 TTD / credit). */

export const DEFAULT_CREDIT_PRICE_CENTS = 50;

/**
 * Preset top-up packs (credits). At 0.50 TTD/credit:
 * $50 · $500 · $1,000 · $2,000 TTD.
 * Custom amounts allowed at or above TT$50, unless an ops override is set.
 */
export const TOP_UP_TIER_CREDITS = [100, 1000, 2000, 4000] as const;
export const TOP_UP_TIER_LABELS = ["Starter", "Pro", "Studio", "Scale"] as const;

/** Default extra top-up when they have no previous extra top-up. */
export const DEFAULT_TOP_UP_AMOUNT_CENTS = 20_000;

/** Face dollars last extra top-up added (credits × price), else charged cents. */
export function lastExtraTopUpFaceCents(
  payments:
    | Array<{
        status?: string;
        amountCents?: number;
        creditsGranted?: number;
        academyCourseId?: unknown;
        subscriptionPlanId?: unknown;
        billingInterval?: unknown;
      }>
    | undefined,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number | null {
  const row = (payments ?? []).find(
    (payment) =>
      payment.status === "payment_completed" &&
      !payment.academyCourseId &&
      !payment.subscriptionPlanId &&
      !payment.billingInterval,
  );
  if (!row) return null;
  const fromCredits = Math.round(
    Number(row.creditsGranted || 0) * Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS),
  );
  if (fromCredits > 0) return fromCredits;
  const cents = Math.round(Number(row.amountCents) || 0);
  return cents > 0 ? cents : null;
}

/** Last paid extra top-up face amount, else $200, never below the min. */
export function defaultTopUpAmountCents(
  lastPaidCents: number | null | undefined,
  minCents: number,
): number {
  const last = Math.round(Number(lastPaidCents) || 0);
  const pick = last > 0 ? last : DEFAULT_TOP_UP_AMOUNT_CENTS;
  return Math.max(minCents, pick);
}

/** Min top-up = TT$50 (100 credits at default 0.50). Override only for ops tests. */
export const TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE: number | null = null;

export function creditsToCents(
  credits: number,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  return Math.round(Number(credits || 0) * Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS));
}

/** Minimum custom / any top-up: override, else TT$50 floor (not first chip tier). */
export function topUpMinAmountCents(
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  if (TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE != null) {
    return TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE;
  }
  return creditsToCents(100, creditPriceCents);
}

/** Whole credits purchasable for a paid amount (remainder below one credit is not granted). */
export function creditsFromAmountCents(
  amountCents: number,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  const price = Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS);
  if (!price || !Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.floor(Number(amountCents) / price);
}

/**
 * Legacy customer-covers fee (3% + TT$1.50). Not added to the customer total.
 * @see https://docs.wam.money/docs/help-center/fees
 */
export function wamCardFeeCents(amountCents: number): number {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  return Math.floor(base * 0.03) + 150;
}

/** @deprecated Use wamCardFeeCents */
export const paywiseCardFeeCents = wamCardFeeCents;

/** Customer pays the listed product. We swallow Wam fees. */
export function wamCheckoutTotalCents(amountCents: number): number {
  return Math.max(0, Math.round(Number(amountCents) || 0));
}

/** @deprecated Use wamCheckoutTotalCents */
export const paywiseCheckoutTotalCents = wamCheckoutTotalCents;

/** Short money label for buttons: `$50` / `$54.75` (no TTD suffix). */
export function formatTtdShort(amountCents: number | null | undefined): string {
  if (amountCents == null || Number.isNaN(Number(amountCents))) return "—";
  const amount = Number(amountCents) / 100;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a bank/top-up amount already stored in cents → `$25 TTD` / `$12.50 TTD`. */
export function formatTtdCents(amountCents: number | null | undefined): string {
  if (amountCents == null || Number.isNaN(Number(amountCents))) return "—";
  const amount = Number(amountCents) / 100;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} TTD`;
}

/** Format an internal credit amount as TTD for user-facing UI. */
export function formatTtdFromCredits(
  credits: number | null | undefined,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): string {
  if (credits == null || Number.isNaN(Number(credits))) return "—";
  return formatTtdCents(creditsToCents(Number(credits), creditPriceCents));
}
