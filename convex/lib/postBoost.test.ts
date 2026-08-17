import { describe, expect, it } from "vitest";
import { boostCreditsForPrice, POST_BOOST_AMOUNT_CENTS } from "./postBoost";

describe("boostCreditsForPrice", () => {
  it("maps 5 TTD cents to 0.1 credits at the default $0.50 price", () => {
    expect(POST_BOOST_AMOUNT_CENTS).toBe(5);
    expect(boostCreditsForPrice(50)).toBe(0.1);
  });
});
