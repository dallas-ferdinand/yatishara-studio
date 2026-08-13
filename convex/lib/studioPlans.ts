/** Studio subscription catalog — dollars in TTD cents. Customer language is dollars, not credits. */

export type StudioPlanInterval = "month" | "year";

export type StudioPlanCatalogEntry = {
  slug: "core" | "plus" | "pro";
  name: string;
  /** Face value added to the account each month (what they get). */
  faceMonthlyCents: number;
  /** Off the monthly charge. They still receive faceMonthlyCents. */
  monthlyDiscountPercent: number;
  /** Off the prepaid yearly charge. Credits still land monthly. */
  annualDiscountPercent: number;
  sortOrder: number;
};

export const STUDIO_PLAN_CATALOG: readonly StudioPlanCatalogEntry[] = [
  {
    slug: "core",
    name: "Core",
    faceMonthlyCents: 10_000,
    monthlyDiscountPercent: 0,
    annualDiscountPercent: 5,
    sortOrder: 0,
  },
  {
    slug: "plus",
    name: "Plus",
    faceMonthlyCents: 30_000,
    monthlyDiscountPercent: 5,
    annualDiscountPercent: 15,
    sortOrder: 1,
  },
  {
    slug: "pro",
    name: "Pro",
    faceMonthlyCents: 100_000,
    monthlyDiscountPercent: 15,
    annualDiscountPercent: 20,
    sortOrder: 2,
  },
] as const;

export const STUDIO_PLAN_SLUGS = STUDIO_PLAN_CATALOG.map((plan) => plan.slug);

/** Cancel the plan if the renewal is still unpaid after this. */
export const SUBSCRIPTION_DUNNING_MS = 7 * 24 * 60 * 60 * 1000;

export function discountedChargeCents(
  faceCents: number,
  discountPercent: number,
): number {
  const face = Math.max(0, Math.round(faceCents));
  const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return Math.round((face * (100 - discount)) / 100);
}

export function creditsFromFaceCents(
  faceCents: number,
  creditPriceCents: number,
): number {
  const price = Math.max(1, Math.round(creditPriceCents));
  return Math.floor(Math.max(0, Math.round(faceCents)) / price);
}

export function discountForInterval(
  plan: Pick<StudioPlanCatalogEntry, "monthlyDiscountPercent" | "annualDiscountPercent">,
  interval: StudioPlanInterval,
): number {
  return interval === "year"
    ? plan.annualDiscountPercent
    : plan.monthlyDiscountPercent;
}

export function quoteStudioPlan(
  plan: Pick<
    StudioPlanCatalogEntry,
    "faceMonthlyCents" | "monthlyDiscountPercent" | "annualDiscountPercent"
  >,
  interval: StudioPlanInterval,
  creditPriceCents: number,
): {
  interval: StudioPlanInterval;
  discountPercent: number;
  faceMonthlyCents: number;
  chargeCents: number;
  monthlyCredits: number;
} {
  const discountPercent = discountForInterval(plan, interval);
  const faceChargeCents =
    interval === "year" ? plan.faceMonthlyCents * 12 : plan.faceMonthlyCents;
  return {
    interval,
    discountPercent,
    faceMonthlyCents: plan.faceMonthlyCents,
    chargeCents: discountedChargeCents(faceChargeCents, discountPercent),
    monthlyCredits: creditsFromFaceCents(plan.faceMonthlyCents, creditPriceCents),
  };
}

export function addCalendarMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
