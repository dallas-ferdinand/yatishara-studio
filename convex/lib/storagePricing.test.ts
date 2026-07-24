import { describe, expect, it } from "vitest";
import {
  BYTES_PER_GIB,
  STORAGE_TTD_PER_GIB_MONTH,
  creditsFromTtd,
  monthlyCharge,
  monthlyRateTtd,
  projectedMonthlyChargeTtd,
} from "./storagePricing";

const gib = (n: number) => n * BYTES_PER_GIB;

describe("storage pricing rates", () => {
  it("resells Bunny storage at 2x — TT$0.20 / GiB / month", () => {
    expect(STORAGE_TTD_PER_GIB_MONTH).toBeCloseTo(0.2, 10);
    expect(monthlyRateTtd(gib(1))).toBeCloseTo(0.2, 10);
    expect(creditsFromTtd(monthlyRateTtd(gib(1)))).toBeCloseTo(0.4, 10);
  });

  it("treats missing or negative sizes as zero", () => {
    expect(monthlyRateTtd(0)).toBe(0);
    expect(monthlyRateTtd(-500)).toBe(0);
    expect(monthlyRateTtd(Number.NaN)).toBe(0);
  });
});

describe("monthly charge", () => {
  it("bills the full monthly rate on the snapshot", () => {
    // 10 GiB → TT$2.00 → 4 credits
    const charge = monthlyCharge(gib(10));
    expect(charge.chargeable).toBe(true);
    expect(charge.ttd).toBeCloseTo(2, 10);
    expect(charge.credits).toBeCloseTo(4, 10);
  });

  it("skips empty accounts", () => {
    expect(monthlyCharge(0).chargeable).toBe(false);
    expect(projectedMonthlyChargeTtd(0)).toBe(0);
  });

  it("projects the same amount shown in settings", () => {
    expect(projectedMonthlyChargeTtd(gib(10))).toBeCloseTo(2, 10);
  });

  it("skips dust under a cent", () => {
    // 0.04 GiB → TT$0.008 → under the floor
    expect(monthlyCharge(gib(0.04)).chargeable).toBe(false);
  });
});
