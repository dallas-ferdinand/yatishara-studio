import type { Doc } from "../_generated/dataModel";
import {
  ACADEMY_CREDIT_PRICE_CENTS,
  isCourseSaleActive,
} from "./academyPricing";

/** Days after saleEndsAt that a deposit still unlocks at the locked sale total. */
export const SALE_HOLD_DAYS = 15;
/** Days from first deposit soft-accept until the plan expires. */
export const DEPOSIT_VALID_DAYS = 90;

export const SALE_HOLD_MS = SALE_HOLD_DAYS * 24 * 60 * 60 * 1000;
export const DEPOSIT_VALID_MS = DEPOSIT_VALID_DAYS * 24 * 60 * 60 * 1000;

export type CoursePriceSnapshot = {
  listPriceCredits: number;
  lockedSalePriceCredits: number | null;
  saleEndsAt: number | null;
  saleHoldEndsAt: number | null;
};

export type PlanMoneyFields = {
  listPriceCredits: number;
  lockedSalePriceCredits?: number;
  saleHoldEndsAt?: number;
  totalPaidCents: number;
};

export function creditsToCents(credits: number): number {
  return Math.max(0, Math.round(Number(credits) || 0) * ACADEMY_CREDIT_PRICE_CENTS);
}

export function centsToCredits(cents: number): number {
  return Math.max(0, Math.floor(Number(cents) || 0) / ACADEMY_CREDIT_PRICE_CENTS);
}

/** List / regular price in credits (compare-at or base). */
export function listPriceCreditsForCourse(
  course: Pick<
    Doc<"academyCourses">,
    "priceCredits" | "listPriceCredits"
  >,
): number {
  const list =
    Number.isFinite(course.listPriceCredits) &&
    Number(course.listPriceCredits) >= 1
      ? Math.floor(Number(course.listPriceCredits))
      : Math.floor(Number(course.priceCredits) || 0);
  return Math.max(1, list || Math.floor(Number(course.priceCredits) || 1));
}

/**
 * Snapshot prices at deposit time.
 * Sale on → lock sale total + saleEndsAt + saleHoldEndsAt (+15d).
 * No sale → list only; no sale hold.
 */
export function snapshotCoursePricesAtDeposit(
  course: Doc<"academyCourses">,
  now = Date.now(),
): CoursePriceSnapshot {
  const list = listPriceCreditsForCourse(course);
  if (isCourseSaleActive(course, now)) {
    const sale = Math.floor(Number(course.salePriceCredits));
    const saleEndsAt = Number(course.saleEndsAt);
    return {
      listPriceCredits: list,
      lockedSalePriceCredits: sale,
      saleEndsAt,
      saleHoldEndsAt: saleEndsAt + SALE_HOLD_MS,
    };
  }
  return {
    listPriceCredits: list,
    lockedSalePriceCredits: null,
    saleEndsAt: null,
    saleHoldEndsAt: null,
  };
}

/** Half of the locked sale total (or list when no sale), in cents. */
export function defaultDepositCents(snapshot: CoursePriceSnapshot): number {
  const totalCredits =
    snapshot.lockedSalePriceCredits != null
      ? snapshot.lockedSalePriceCredits
      : snapshot.listPriceCredits;
  return Math.round(creditsToCents(totalCredits) / 2);
}

/**
 * Target total the customer must reach to unlock.
 * Within sale hold → locked sale total; otherwise → list.
 */
export function targetTotalCredits(plan: PlanMoneyFields, now = Date.now()): number {
  const hold = plan.saleHoldEndsAt;
  if (
    plan.lockedSalePriceCredits != null &&
    hold != null &&
    Number.isFinite(hold) &&
    now < hold
  ) {
    return Math.floor(Number(plan.lockedSalePriceCredits));
  }
  return Math.max(1, Math.floor(Number(plan.listPriceCredits) || 1));
}

export function targetTotalCents(plan: PlanMoneyFields, now = Date.now()): number {
  return creditsToCents(targetTotalCredits(plan, now));
}

/** Remaining cents due right now (0 if overpaid). */
export function amountDueCents(plan: PlanMoneyFields, now = Date.now()): number {
  return Math.max(0, targetTotalCents(plan, now) - Math.round(Number(plan.totalPaidCents) || 0));
}

export function planIsExpired(
  plan: { status: string; expiresAt: number },
  now = Date.now(),
): boolean {
  if (plan.status === "expired") return true;
  if (plan.status !== "active") return false;
  return now > Number(plan.expiresAt);
}

export function planIsFullyPaid(plan: PlanMoneyFields, now = Date.now()): boolean {
  return amountDueCents(plan, now) <= 0;
}
