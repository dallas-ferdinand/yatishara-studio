import type { Doc } from "../_generated/dataModel";

/** TT$0.50 per credit — keep in sync with Studio wallet. */
export const ACADEMY_CREDIT_PRICE_CENTS = 50;

export type AcademyCourseStatus = "draft" | "published" | "coming_soon";

export function ttdToCredits(ttd: number): number {
  return Math.max(1, Math.round((Number(ttd) || 0) * 100) / ACADEMY_CREDIT_PRICE_CENTS);
}

export function creditsToTtd(credits: number): number {
  return Math.round(Number(credits || 0) * (ACADEMY_CREDIT_PRICE_CENTS / 100) * 100) / 100;
}

type PriceFields = {
  priceCredits: number;
  listPriceCredits?: number;
  salePriceCredits?: number;
  saleEndsAt?: number;
};

/** True when a timed sale is active (charge salePriceCredits). */
export function isCourseSaleActive(
  course: PriceFields,
  now = Date.now(),
): boolean {
  const sale = course.salePriceCredits;
  const ends = course.saleEndsAt;
  if (sale == null || !Number.isFinite(sale) || sale < 1) return false;
  if (ends == null || !Number.isFinite(ends)) return false;
  return now < ends;
}

/**
 * Credits charged at purchase time.
 * Prefer salePriceCredits while saleEndsAt is in the future; else list/base.
 */
export function effectiveCoursePriceCredits(
  course: PriceFields,
  now = Date.now(),
): number {
  const list =
    Number.isFinite(course.listPriceCredits) &&
    Number(course.listPriceCredits) >= 1
      ? Math.floor(Number(course.listPriceCredits))
      : Math.floor(Number(course.priceCredits) || 0);
  if (isCourseSaleActive(course, now)) {
    return Math.floor(Number(course.salePriceCredits));
  }
  return Math.max(1, list || Math.floor(Number(course.priceCredits) || 1));
}

/** Strikethrough / “was” price when sale is active. */
export function compareAtCoursePriceCredits(
  course: PriceFields,
  now = Date.now(),
): number | null {
  if (!isCourseSaleActive(course, now)) return null;
  const list =
    Number.isFinite(course.listPriceCredits) &&
    Number(course.listPriceCredits) >= 1
      ? Math.floor(Number(course.listPriceCredits))
      : Math.floor(Number(course.priceCredits) || 0);
  const sale = Math.floor(Number(course.salePriceCredits));
  if (list > sale) return list;
  return null;
}

export function courseIsComingSoon(
  course: Pick<Doc<"academyCourses">, "status"> | { status: string },
): boolean {
  return course.status === "coming_soon";
}

export function courseIsBuyable(
  course: Pick<Doc<"academyCourses">, "status"> | { status: string },
): boolean {
  return course.status === "published";
}
