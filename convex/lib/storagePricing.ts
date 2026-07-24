/**
 * Storage pricing.
 *
 * Bunny Edge Storage `yatishara-media` is Standard (HDD), single region (DE),
 * no replication → US$0.01/GB/month. Customers pay 2× COGS like every other
 * meter in `generationPricing.ts`: US$0.02/GiB → TT$0.20/GiB → 0.4 credits/GiB
 * per month. CDN bandwidth is billed separately by Bunny and is not resold here.
 *
 * Billing shape: once a month on the 1st (00:00 AST), charge the full monthly
 * rate for whatever is stored that day. Uploads and deletes only move the
 * byte counter — they never raise a charge mid-month.
 */

import { CREDIT_PRICE_TTD, USD_TO_TTD } from "./generationPricing";

export const BYTES_PER_GIB = 1024 ** 3;

/** Bunny Standard tier, single region. */
export const BUNNY_USD_PER_GB_MONTH = 0.01;
export const STORAGE_MARKUP = 2;

/** Customer TT$ per GiB per full month. */
export const STORAGE_TTD_PER_GIB_MONTH =
  BUNNY_USD_PER_GB_MONTH * STORAGE_MARKUP * USD_TO_TTD;

/** Charges below this are skipped rather than written to the ledger. */
export const MIN_CHARGE_TTD = 0.01;

/** Monthly charge day (1st) at 00:00 AST = 04:00 UTC. */
export const BILLING_DAY_UTC_HOUR = 4;

export function bytesToGib(bytes: number): number {
  const safe = Number(bytes);
  if (!Number.isFinite(safe) || safe <= 0) return 0;
  return safe / BYTES_PER_GIB;
}

/** Binary float slop would push exact cents (0.01 → 1.0000000000000002) up a cent. */
const CENT_EPSILON = 1e-9;

function roundUpToCentTtd(ttd: number): number {
  const cents = ttd * 100;
  const nearest = Math.round(cents);
  if (Math.abs(cents - nearest) < CENT_EPSILON) return nearest / 100;
  return Math.ceil(cents) / 100;
}

/** Full-month TT$ for a byte total. */
export function monthlyRateTtd(bytes: number): number {
  return bytesToGib(bytes) * STORAGE_TTD_PER_GIB_MONTH;
}

/** Credits for a TT$ amount, at the 0.01-credit ledger granularity used for text. */
export function creditsFromTtd(ttd: number): number {
  return Math.round((ttd / CREDIT_PRICE_TTD) * 100) / 100;
}

export type StorageCharge = {
  /** TT$ owed, rounded up to the cent. Zero when skipped. */
  ttd: number;
  /** Ledger credits (0.01 granularity). Zero when skipped. */
  credits: number;
  /** False when the amount is under a cent. */
  chargeable: boolean;
};

function toCharge(rawTtd: number): StorageCharge {
  if (!Number.isFinite(rawTtd) || rawTtd < MIN_CHARGE_TTD - CENT_EPSILON) {
    return { ttd: 0, credits: 0, chargeable: false };
  }
  const ttd = roundUpToCentTtd(rawTtd);
  return { ttd, credits: creditsFromTtd(ttd), chargeable: true };
}

/** Full monthly rate on the live snapshot, charged on the 1st. */
export function monthlyCharge(bytes: number): StorageCharge {
  return toCharge(monthlyRateTtd(bytes));
}

/**
 * What the 1st will cost at the current size — shown in Settings so users can
 * see the effect of emptying trash before the billing day.
 */
export function projectedMonthlyChargeTtd(bytes: number): number {
  const raw = monthlyRateTtd(bytes);
  return raw < MIN_CHARGE_TTD - CENT_EPSILON ? 0 : roundUpToCentTtd(raw);
}
