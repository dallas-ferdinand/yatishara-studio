/** Display helpers — billing ledger stays in credits; UI shows TTD (0.50 TTD / credit). */

export const DEFAULT_CREDIT_PRICE_CENTS = 50;

/**
 * Preset top-up packs (credits). At 0.50 TTD/credit:
 * $50 · $500 · $1,000 · $2,000 TTD.
 * Custom amounts allowed at or above TT$10 (PayWise min), unless override is set.
 */
export const TOP_UP_TIER_CREDITS = [100, 1000, 2000, 4000] as const;
export const TOP_UP_TIER_LABELS = ["Starter", "Pro", "Studio", "Scale"] as const;

/** Min top-up = TT$10 (20 credits at default 0.50). Override only for ops tests. */
export const TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE: number | null = 1000;

export function creditsToCents(
  credits: number,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  return Math.round(Number(credits || 0) * Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS));
}

/** Minimum custom / any top-up: override, else TT$10 floor (not first chip tier). */
export function topUpMinAmountCents(
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  if (TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE != null) {
    return TOP_UP_MIN_AMOUNT_CENTS_OVERRIDE;
  }
  return creditsToCents(20, creditPriceCents);
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
 * Wam published card fee when the payer covers 100%: 3% + TT$1.50.
 * Used for checkout disclosure; live charged total may round a few cents differently.
 * @see https://docs.wam.money/docs/help-center/fees
 */
export function wamCardFeeCents(amountCents: number): number {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  return Math.round(base * 0.03) + 150;
}

/** @deprecated Use wamCardFeeCents */
export const paywiseCardFeeCents = wamCardFeeCents;

/** Top-up amount + Wam card fee (what the payer is charged). */
export function wamCheckoutTotalCents(amountCents: number): number {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  return base + wamCardFeeCents(base);
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
