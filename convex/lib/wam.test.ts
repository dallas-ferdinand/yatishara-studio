import { describe, expect, it } from "vitest";
import {
  normalizeWamIntentStatus,
  wamCardFeeCents,
  wamCheckoutTotalCents,
  wamPaidAmountMatchesProduct,
  studioWamAppReturnUrl,
  studioWamCsReturnUrl,
  humanizeWamProviderStatus,
} from "./wam";

describe("wam helpers", () => {
  it("computes 3% + TT$1.50 fee (Wam floors the 3%)", () => {
    expect(wamCardFeeCents(10_00)).toBe(180); // 30 + 150
    expect(wamCheckoutTotalCents(10_00)).toBe(11_80);
    expect(wamCardFeeCents(50_00)).toBe(300); // 150 + 150
    // Pro 8% off $10 → $9.20 charge; floor(27.6)+150 = 177 → total $10.97
    expect(wamCardFeeCents(9_20)).toBe(177);
    expect(wamCheckoutTotalCents(9_20)).toBe(10_97);
    expect(wamPaidAmountMatchesProduct(10_00, 10_00)).toBe(true);
    expect(wamPaidAmountMatchesProduct(11_80, 10_00)).toBe(true);
    expect(wamPaidAmountMatchesProduct(10_97, 9_20)).toBe(true);
    expect(wamPaidAmountMatchesProduct(11_00, 10_00)).toBe(false);
  });

  it("keeps Studio return ids in the path so Wam query replace cannot strip them", () => {
    expect(studioWamAppReturnUrl("https://studio.yatishara.com/", "pay123")).toBe(
      "https://studio.yatishara.com/pay/done/pay123/",
    );
    expect(studioWamCsReturnUrl("https://studio.yatishara.com", "pay123")).toBe(
      "https://studio.yatishara.com/pay/wa/pay123/",
    );
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
