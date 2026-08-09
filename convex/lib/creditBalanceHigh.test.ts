import { describe, expect, it } from "vitest";
import {
  nextCreditBalanceHigh,
  resolveCreditBalanceHigh,
} from "./creditBalanceHigh";

describe("nextCreditBalanceHigh", () => {
  it("reset sets Total to balance after top-up (prior + credit)", () => {
    expect(
      nextCreditBalanceHigh({
        previousHigh: 10,
        balanceAfter: 40,
        mode: "reset",
      }),
    ).toBe(40);
  });

  it("max keeps the taller peak on refund", () => {
    expect(
      nextCreditBalanceHigh({
        previousHigh: 40,
        balanceAfter: 35,
        mode: "max",
      }),
    ).toBe(40);
    expect(
      nextCreditBalanceHigh({
        previousHigh: 40,
        balanceAfter: 45,
        mode: "max",
      }),
    ).toBe(45);
  });
});

describe("resolveCreditBalanceHigh", () => {
  it("Total stays at last top-up peak while Remaining drops", () => {
    expect(
      resolveCreditBalanceHigh({
        creditBalance: 25,
        creditBalanceHigh: 40,
        lastGrantBalanceAfter: 40,
      }),
    ).toBe(40);
  });

  it("repairs collapsed stored high from last grant peak", () => {
    expect(
      resolveCreditBalanceHigh({
        creditBalance: 25,
        creditBalanceHigh: 25,
        lastGrantBalanceAfter: 40,
      }),
    ).toBe(40);
  });

  it("uses grant when stored high was never set", () => {
    expect(
      resolveCreditBalanceHigh({
        creditBalance: 25,
        creditBalanceHigh: 0,
        lastGrantBalanceAfter: 40,
      }),
    ).toBe(40);
  });

  it("had 10 then topped up 30 → Total 40", () => {
    expect(
      resolveCreditBalanceHigh({
        creditBalance: 40,
        creditBalanceHigh: null,
        lastGrantBalanceAfter: 40,
      }),
    ).toBe(40);
  });
});
