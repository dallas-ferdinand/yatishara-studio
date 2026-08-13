import { describe, expect, test } from "vitest";
import {
  STUDIO_PLAN_CATALOG,
  creditsFromFaceCents,
  discountedChargeCents,
  quoteStudioPlan,
} from "./studioPlans";

describe("studio subscription catalog", () => {
  test("monthly: pay less, receive full face dollars", () => {
    const plus = STUDIO_PLAN_CATALOG.find((plan) => plan.slug === "plus")!;
    const quote = quoteStudioPlan(plus, "month", 50);
    expect(quote.chargeCents).toBe(28_500);
    expect(quote.faceMonthlyCents).toBe(30_000);
    expect(quote.monthlyCredits).toBe(600);
    expect(discountedChargeCents(30_000, 5)).toBe(28_500);
  });

  test("annual prepaid still grants monthly face credits", () => {
    const pro = STUDIO_PLAN_CATALOG.find((plan) => plan.slug === "pro")!;
    const quote = quoteStudioPlan(pro, "year", 50);
    expect(quote.chargeCents).toBe(960_000);
    expect(quote.monthlyCredits).toBe(creditsFromFaceCents(100_000, 50));
    expect(quote.discountPercent).toBe(20);
  });

  test("core monthly has no discount", () => {
    const core = STUDIO_PLAN_CATALOG.find((plan) => plan.slug === "core")!;
    expect(quoteStudioPlan(core, "month", 50).chargeCents).toBe(10_000);
    expect(quoteStudioPlan(core, "year", 50).chargeCents).toBe(114_000);
  });
});
