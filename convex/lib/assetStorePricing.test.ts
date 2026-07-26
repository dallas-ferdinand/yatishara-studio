import { describe, expect, it } from "vitest";
import {
  assetStorePriceCredits,
  assetStoreSplit,
  sellerPayoutCentsFromCredits,
} from "./assetStorePricing";

describe("assetStorePricing", () => {
  it("lists at 3× generate credits", () => {
    expect(assetStorePriceCredits(1)).toBe(3);
    expect(assetStorePriceCredits(3)).toBe(9);
    expect(assetStorePriceCredits(6)).toBe(18);
  });

  it("splits 30/70", () => {
    expect(assetStoreSplit(10)).toEqual({
      platformCredits: 3,
      sellerCredits: 7,
    });
    expect(assetStoreSplit(3)).toEqual({
      platformCredits: 0.9,
      sellerCredits: 2.1,
    });
  });

  it("converts seller credits to payout cents", () => {
    expect(sellerPayoutCentsFromCredits(2.1, 50)).toBe(105);
    expect(sellerPayoutCentsFromCredits(7, 50)).toBe(350);
  });
});
