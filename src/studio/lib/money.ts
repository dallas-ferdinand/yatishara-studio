/** Display helpers — billing ledger stays in credits; UI shows TTD (0.50 TTD / credit). */

export const DEFAULT_CREDIT_PRICE_CENTS = 50;

/**
 * Preset top-up packs (credits). At 0.50 TTD/credit:
 * $50 · $500 · $1,000 · $2,000 TTD.
 * Custom amounts allowed at or above the first tier ($50 TTD).
 */
export const TOP_UP_TIER_CREDITS = [100, 1000, 2000, 4000] as const;
export const TOP_UP_TIER_LABELS = ["Starter", "Pro", "Studio", "Scale"] as const;

export function creditsToCents(
  credits: number,
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  return Math.round(Number(credits || 0) * Number(creditPriceCents || DEFAULT_CREDIT_PRICE_CENTS));
}

/** Minimum custom / any top-up: price of the first (cheapest) tier. */
export function topUpMinAmountCents(
  creditPriceCents: number = DEFAULT_CREDIT_PRICE_CENTS,
): number {
  return creditsToCents(TOP_UP_TIER_CREDITS[0], creditPriceCents);
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
