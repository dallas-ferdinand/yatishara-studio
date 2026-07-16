import { afterEach, describe, expect, test, vi } from "vitest";
import {
  PaywiseError,
  amountCentsToPaywise,
  amountStringToCents,
  createPaymentRequest,
  getPaywiseConfig,
  getPaymentStatus,
  normalizePaywiseStatus,
  type PaywiseConfig,
} from "./paywise";

const config: PaywiseConfig = {
  apiBase: "https://sandbox-api.paywise.co",
  subscriptionKey: "subscription-key",
  apiKey: "api-key",
  payeeMobile: "+18685550123",
  originCountry: "TT",
  ipAddress: "203.0.113.10",
  paidStatuses: new Set(["sandbox-settled"]),
  pendingStatuses: new Set(["sandbox-pending"]),
  rejectedStatuses: new Set(["sandbox-declined"]),
  cancelledStatuses: new Set(["sandbox-cancelled"]),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PayWise status contract", () => {
  test("only configured paid states are accepted as paid", () => {
    expect(normalizePaywiseStatus("sandbox-settled", config)).toBe("paid");
    expect(normalizePaywiseStatus("success", config)).toBe("unknown");
    expect(normalizePaywiseStatus("sandbox-pending", config)).toBe("pending");
  });

  test("status responses require matching identity, amount, and currency", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get("PW-request-date")).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      return new Response(
        JSON.stringify({
          request_id: "request-1",
          payment_details: {
            id: "payment-1",
            status: "sandbox-settled",
            amount: "50.00",
            currency: "TTD",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(getPaymentStatus("payment-1", { maxRetries: 0 }, config)).resolves.toMatchObject({
      paymentDetailsId: "payment-1",
      normalizedStatus: "paid",
      amountCents: 5_000,
      currency: "TTD",
    });
  });

  test("sandbox permits the documented loopback IP but production does not", () => {
    for (const [name, value] of Object.entries({
      PAYWISE_API_BASE: "https://sandbox-api.paywise.co",
      PAYWISE_ENVIRONMENT: "sandbox",
      PAYWISE_SUBSCRIPTION_KEY: "subscription-key",
      PAYWISE_API_KEY: "api-key",
      PAYWISE_PAYEE_MOBILE: "+18685550123",
      PAYWISE_ORIGIN_COUNTRY: "TT",
      PAYWISE_IP_ADDRESS: "127.0.0.1",
    })) {
      vi.stubEnv(name, value);
    }
    expect(getPaywiseConfig().ipAddress).toBe("127.0.0.1");

    vi.stubEnv("PAYWISE_API_BASE", "https://api.paywise.co");
    vi.stubEnv("PAYWISE_ENVIRONMENT", "production");
    vi.stubEnv("PAYWISE_PAID_STATUSES", "completed");
    expect(() => getPaywiseConfig()).toThrow("public egress IP");
  });

  test("missing currency is never inferred", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            payment_details: {
              id: "payment-1",
              status: "sandbox-settled",
              amount: "50.00",
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(getPaymentStatus("payment-1", { maxRetries: 0 }, config)).rejects.toThrow(
      "missing currency",
    );
  });

  test("a different returned payment id is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            payment_details: {
              id: "payment-2",
              status: "sandbox-settled",
              amount: "50.00",
              currency: "TTD",
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(getPaymentStatus("payment-1", { maxRetries: 0 }, config)).rejects.toThrow(
      "payment id did not match",
    );
  });

  test("checkout payload uses payment_link card and omits rejected fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const trx = body.transaction_request;
      expect(trx.customer_reference).toBeUndefined();
      expect(trx.tax).toBeUndefined();
      expect(trx.tip).toBeUndefined();
      expect(trx.convenience).toBeUndefined();
      expect(trx.metadata).toBeUndefined();
      expect(trx.fees).toMatchObject({
        pays_fees: 2,
        payer_covers: 100,
      });
      expect(trx.payers[0]).toMatchObject({
        payment_channel: "direct_pos",
        payment_method: "card",
      });
      expect(trx.payees[0].fees_covered).toBeUndefined();
      return new Response(
        JSON.stringify({
          status: "success",
          request_id: "request-1",
          data: {
            paymentDetailsId: 298,
            raw: {
              payment_details: {
                id: 298,
                amount: "50.00",
                currency: "TTD",
                payers: [
                  {
                    payment_channel: "payment_link",
                    payment_method: "card",
                    status: "Pending",
                    url: "https://payers.example.test/pay/payment-1",
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPaymentRequest(
        {
          transactionId: "trx-1",
          amountCents: 5_000,
          description: "Studio credit top-up",
          payer: {
            mobileNumber: "+18685550999",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.test",
          },
          urls: {
            success: "https://studio.example/success",
            error: "https://studio.example/error",
            notify: "https://api.example/notify",
            callback: "https://api.example/callback",
          },
          idempotencyKey: "idem-1",
          requestId: "req-1",
        },
        config,
      ),
    ).resolves.toMatchObject({
      paymentDetailsId: "298",
      checkoutUrl: "https://payers.example.test/pay/payment-1",
    });
  });
});

describe("PayWise amount parsing", () => {
  test("accepts exact cents and rejects ambiguous values", () => {
    expect(amountCentsToPaywise(5_000)).toBe("50.00");
    expect(amountStringToCents("1,234.56")).toBe(123_456);
    expect(() => amountStringToCents("50.001")).toThrow(PaywiseError);
    expect(() => amountStringToCents("50 TTD")).toThrow(PaywiseError);
    expect(() => amountCentsToPaywise(50.5)).toThrow(PaywiseError);
  });
});
