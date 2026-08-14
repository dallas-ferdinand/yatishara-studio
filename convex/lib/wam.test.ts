import { describe, expect, it } from "vitest";
import { normalizeWamIntentStatus, wamCardFeeCents, wamCheckoutTotalCents, humanizeWamProviderStatus } from "./wam";

describe("wam helpers", () => {
  it("computes 3% + TT$1.50 fee", () => {
    expect(wamCardFeeCents(10_00)).toBe(180); // 30 + 150
    expect(wamCheckoutTotalCents(10_00)).toBe(11_80);
    expect(wamCardFeeCents(50_00)).toBe(300); // 150 + 150
  });

  it("normalizes intent statuses", () => {
    expect(normalizeWamIntentStatus("succeeded")).toBe("paid");
    expect(normalizeWamIntentStatus("failed")).toBe("rejected");
    expect(normalizeWamIntentStatus("canceled")).toBe("cancelled");
    expect(normalizeWamIntentStatus("expired")).toBe("cancelled");
    expect(normalizeWamIntentStatus("processing")).toBe("pending");
    expect(normalizeWamIntentStatus("weird")).toBe("unknown");
  });

  it("humanizes Wam checkout states", () => {
    expect(humanizeWamProviderStatus("requires_payment_method")).toBe("Needs a card");
    expect(humanizeWamProviderStatus("processing")).toBe("Processing");
    expect(humanizeWamProviderStatus("foo_bar_baz")).toBe("Foo Bar Baz");
    expect(humanizeWamProviderStatus("")).toBeNull();
  });
});
