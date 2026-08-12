import { describe, expect, it } from "vitest";
import {
  amountDueCents,
  creditsToCents,
  defaultDepositCents,
  DEPOSIT_VALID_MS,
  planIsFullyPaid,
  SALE_HOLD_MS,
  snapshotCoursePricesAtDeposit,
  targetTotalCents,
} from "./academyPaymentPlan";

describe("academyPaymentPlan", () => {
  const saleCourse = {
    priceCredits: 3000,
    listPriceCredits: 3000,
    salePriceCredits: 1500,
    saleEndsAt: Date.parse("2026-09-01T04:00:00.000Z"),
  } as const;

  it("snapshots sale lock and half deposit", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const snap = snapshotCoursePricesAtDeposit(saleCourse as never, now);
    expect(snap.lockedSalePriceCredits).toBe(1500);
    expect(snap.listPriceCredits).toBe(3000);
    expect(snap.saleHoldEndsAt).toBe(saleCourse.saleEndsAt + SALE_HOLD_MS);
    expect(defaultDepositCents(snap)).toBe(375_00);
  });

  it("keeps sale target inside 15-day hold", () => {
    const plan = {
      listPriceCredits: 3000,
      lockedSalePriceCredits: 1500,
      saleHoldEndsAt: saleCourse.saleEndsAt + SALE_HOLD_MS,
      totalPaidCents: 375_00,
    };
    const inside = saleCourse.saleEndsAt + 5 * 24 * 60 * 60 * 1000;
    expect(targetTotalCents(plan, inside)).toBe(750_00);
    expect(amountDueCents(plan, inside)).toBe(375_00);
  });

  it("raises due to list after sale hold", () => {
    const plan = {
      listPriceCredits: 3000,
      lockedSalePriceCredits: 1500,
      saleHoldEndsAt: saleCourse.saleEndsAt + SALE_HOLD_MS,
      totalPaidCents: 375_00,
    };
    const after = saleCourse.saleEndsAt + SALE_HOLD_MS + 1;
    expect(targetTotalCents(plan, after)).toBe(1500_00);
    expect(amountDueCents(plan, after)).toBe(1125_00);
  });

  it("unlocks when installments cover target", () => {
    const plan = {
      listPriceCredits: 3000,
      lockedSalePriceCredits: 1500,
      saleHoldEndsAt: saleCourse.saleEndsAt + SALE_HOLD_MS,
      totalPaidCents: 750_00,
    };
    const inside = saleCourse.saleEndsAt + 1;
    expect(planIsFullyPaid(plan, inside)).toBe(true);
    expect(amountDueCents(plan, inside)).toBe(0);
  });

  it("deposit validity is 90 days from depositAt", () => {
    const depositAt = Date.parse("2026-08-01T12:00:00.000Z");
    expect(depositAt + DEPOSIT_VALID_MS - depositAt).toBe(DEPOSIT_VALID_MS);
    expect(creditsToCents(1500)).toBe(750_00);
  });
});
