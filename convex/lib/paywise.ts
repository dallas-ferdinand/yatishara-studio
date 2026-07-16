/** PayWise Checkout API client (Recipe 1: /payments/*). */

export const PAYWISE_API_VERSION = "2024-10-01";
export const PAYWISE_CURRENCY = "TTD";

const DEFAULT_USER_AGENT = "yatishara-studio/1.0";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const DEFAULT_REJECTED_STATUSES = new Set(["failed", "rejected", "declined"]);
const DEFAULT_CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const DEFAULT_PENDING_STATUSES = new Set(["pending", "processing"]);

export type PaywiseNormalizedStatus = "paid" | "pending" | "rejected" | "cancelled" | "unknown";

export type PaywiseConfig = {
  apiBase: string;
  subscriptionKey: string;
  apiKey: string;
  payeeMobile: string;
  originCountry: string;
  ipAddress: string;
  paidStatuses: ReadonlySet<string>;
  pendingStatuses: ReadonlySet<string>;
  rejectedStatuses: ReadonlySet<string>;
  cancelledStatuses: ReadonlySet<string>;
};

export type PaywiseCreateRequestInput = {
  transactionId: string;
  amountCents: number;
  description: string;
  payer: {
    mobileNumber: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  urls: {
    success: string;
    error: string;
    notify: string;
    callback: string;
  };
  idempotencyKey: string;
  requestId: string;
};

export type PaywiseCreateRequestResult = {
  paymentDetailsId: string;
  checkoutUrl: string;
  providerRequestId?: string;
  providerStatus?: string;
  rawMessage?: string;
};

export type PaywiseStatusResult = {
  providerStatus: string;
  normalizedStatus: PaywiseNormalizedStatus;
  amountCents: number;
  currency: string;
  providerRequestId?: string;
  paymentDetailsId: string;
};

export class PaywiseError extends Error {
  readonly code: number;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(message: string, opts: { code?: number; requestId?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "PaywiseError";
    this.code = opts.code ?? 500;
    this.requestId = opts.requestId;
    this.retryable = opts.retryable ?? false;
  }
}

export function getPaywiseConfig(): PaywiseConfig {
  const apiBase = (process.env.PAYWISE_API_BASE ?? "").replace(/\/$/, "");
  const subscriptionKey = process.env.PAYWISE_SUBSCRIPTION_KEY?.trim() ?? "";
  const apiKey = process.env.PAYWISE_API_KEY?.trim() ?? "";
  const payeeMobile = process.env.PAYWISE_PAYEE_MOBILE?.trim() ?? "";
  const originCountry = (process.env.PAYWISE_ORIGIN_COUNTRY?.trim() ?? "").toUpperCase();
  const ipAddress = process.env.PAYWISE_IP_ADDRESS?.trim() ?? "";
  const environment = process.env.PAYWISE_ENVIRONMENT?.trim().toLowerCase();
  const paidStatuses = parseStatusSet(process.env.PAYWISE_PAID_STATUSES);
  const missing = (
    [
      ["PAYWISE_API_BASE", apiBase],
      ["PAYWISE_SUBSCRIPTION_KEY", subscriptionKey],
      ["PAYWISE_API_KEY", apiKey],
      ["PAYWISE_PAYEE_MOBILE", payeeMobile],
      ["PAYWISE_ORIGIN_COUNTRY", originCountry],
      ["PAYWISE_IP_ADDRESS", ipAddress],
      ["PAYWISE_ENVIRONMENT", environment],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new PaywiseError(
      `PayWise is not fully configured (missing ${missing.join(", ")}).`,
      {
        code: 500,
        retryable: false,
      },
    );
  }
  if (environment !== "sandbox" && environment !== "production") {
    throw new PaywiseError("PAYWISE_ENVIRONMENT must be sandbox or production.", {
      code: 500,
      retryable: false,
    });
  }
  if (environment === "production" && paidStatuses.size === 0) {
    throw new PaywiseError("PAYWISE_PAID_STATUSES is required in production.", {
      code: 500,
      retryable: false,
    });
  }
  let parsedBase: URL;
  try {
    parsedBase = new URL(apiBase);
  } catch {
    throw new PaywiseError("PAYWISE_API_BASE must be a valid HTTPS URL.", {
      code: 500,
      retryable: false,
    });
  }
  if (parsedBase.protocol !== "https:") {
    throw new PaywiseError("PAYWISE_API_BASE must use HTTPS.", { code: 500, retryable: false });
  }
  const sandboxHost = parsedBase.hostname.toLowerCase().includes("sandbox");
  if ((environment === "sandbox") !== sandboxHost) {
    throw new PaywiseError("PAYWISE_ENVIRONMENT does not match PAYWISE_API_BASE.", {
      code: 500,
      retryable: false,
    });
  }
  const loopbackAddress = ["127.0.0.1", "::1"].includes(ipAddress.toLowerCase());
  if (
    ["0.0.0.0", "localhost"].includes(ipAddress.toLowerCase()) ||
    (environment === "production" && loopbackAddress)
  ) {
    throw new PaywiseError("PAYWISE_IP_ADDRESS must be the deployment's public egress IP.", {
      code: 500,
      retryable: false,
    });
  }
  return {
    apiBase,
    subscriptionKey,
    apiKey,
    payeeMobile,
    originCountry,
    ipAddress,
    paidStatuses,
    pendingStatuses: parseStatusSet(process.env.PAYWISE_PENDING_STATUSES, DEFAULT_PENDING_STATUSES),
    rejectedStatuses: parseStatusSet(process.env.PAYWISE_REJECTED_STATUSES, DEFAULT_REJECTED_STATUSES),
    cancelledStatuses: parseStatusSet(process.env.PAYWISE_CANCELLED_STATUSES, DEFAULT_CANCELLED_STATUSES),
  };
}

export function amountCentsToPaywise(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new PaywiseError("PayWise amount must be a positive integer number of cents", {
      code: 400,
      retryable: false,
    });
  }
  return (amountCents / 100).toFixed(2);
}

export function amountStringToCents(amount: unknown): number {
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PaywiseError("PayWise amount missing or invalid", { code: 502, retryable: false });
    }
    return Math.round(amount * 100);
  }
  const raw = String(amount ?? "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new PaywiseError("PayWise amount missing or invalid", { code: 502, retryable: false });
  }
  const n = Number(raw);
  return Math.round(n * 100);
}

function parseStatusSet(raw: string | undefined, fallback?: ReadonlySet<string>): ReadonlySet<string> {
  const values = raw
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return values?.length ? new Set(values) : (fallback ?? new Set());
}

export function normalizePaywiseStatus(
  raw: unknown,
  config?: Pick<
    PaywiseConfig,
    "paidStatuses" | "pendingStatuses" | "rejectedStatuses" | "cancelledStatuses"
  >,
): PaywiseNormalizedStatus {
  const status = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!status) return "unknown";
  if (config?.paidStatuses.has(status)) return "paid";
  if ((config?.rejectedStatuses ?? DEFAULT_REJECTED_STATUSES).has(status)) return "rejected";
  if ((config?.cancelledStatuses ?? DEFAULT_CANCELLED_STATUSES).has(status)) return "cancelled";
  if ((config?.pendingStatuses ?? DEFAULT_PENDING_STATUSES).has(status)) return "pending";
  return "unknown";
}

/** PayWise requires `YYYY-MM-DD HH:mm:ss` UTC (not ISO-8601). */
function utcRequestDate(date = new Date()): string {
  const iso = date.toISOString(); // 2026-07-15T16:01:31.550Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function buildHeaders(
  config: PaywiseConfig,
  opts: { idempotencyKey?: string; requestId?: string },
): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
    "PW-subscription-key": config.subscriptionKey,
    "PW-origin-country": config.originCountry,
    "PW-request-date": utcRequestDate(),
    "PW-ip-address": config.ipAddress,
    "User-Agent": DEFAULT_USER_AGENT,
  });
  if (opts.idempotencyKey) headers.set("Idempotency-Key", opts.idempotencyKey);
  if (opts.requestId) headers.set("X-Request-Id", opts.requestId);
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number.parseFloat(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(30_000, Math.round(seconds * 1000));
    }
  }
  const base = Math.min(8_000, 400 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchJson(
  config: PaywiseConfig,
  opts: {
    method: "GET" | "POST";
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    idempotencyKey?: string;
    requestId?: string;
    maxRetries?: number;
  },
): Promise<Record<string, unknown>> {
  const url = new URL(`${config.apiBase}${opts.path}`);
  url.searchParams.set("version", PAYWISE_API_VERSION);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      url.searchParams.set(key, value);
    }
  }

  let lastError: PaywiseError | null = null;
  const maxRetries = Math.max(0, Math.min(opts.maxRetries ?? MAX_RETRIES, MAX_RETRIES));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        method: opts.method,
        headers: buildHeaders(config, {
          idempotencyKey: opts.idempotencyKey,
          requestId: opts.requestId,
        }),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: Record<string, unknown> = {};
      if (text) {
        try {
          payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new PaywiseError("PayWise returned a non-JSON response", {
            code: response.status || 502,
            retryable: response.status >= 500,
          });
        }
      }
      const requestId =
        typeof payload.request_id === "string" ? payload.request_id : opts.requestId;
      const envelopeStatus = String(payload.status ?? "").toLowerCase();
      const message =
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : `PayWise request failed (${response.status})`;

      if (response.status === 429 || response.status >= 500) {
        lastError = new PaywiseError(message, {
          code: response.status,
          requestId,
          retryable: true,
        });
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, response.headers.get("Retry-After")));
          continue;
        }
        throw lastError;
      }

      if (!response.ok || envelopeStatus === "error") {
        throw new PaywiseError(message, {
          code: typeof payload.code === "number" ? payload.code : response.status,
          requestId,
          retryable: false,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof PaywiseError) {
        if (error.retryable && attempt < maxRetries) {
          lastError = error;
          await sleep(retryDelayMs(attempt, null));
          continue;
        }
        throw error;
      }
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new PaywiseError(aborted ? "PayWise request timed out" : "PayWise network error", {
        code: 504,
        requestId: opts.requestId,
        retryable: true,
      });
      if (attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new PaywiseError("PayWise request failed", { code: 502, retryable: true });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Sandbox/orchestration often wraps Checkout Builder fields under `data.raw`.
 * Normalize so extractors can read either the docs shape or the live envelope.
 */
function unwrapPaywisePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.data);
  if (!data) return payload;
  const raw = asRecord(data.raw);
  const paymentDetails =
    asRecord(raw?.payment_details) ??
    asRecord(data.payment_details) ??
    asRecord(payload.payment_details);
  const nestedPayers = Array.isArray(paymentDetails?.payers) ? paymentDetails.payers : null;
  const rawPayers = Array.isArray(raw?.payers) ? raw.payers : null;
  const topPayers = Array.isArray(payload.payers) ? payload.payers : null;
  return {
    ...payload,
    ...(raw ?? {}),
    payment_details: paymentDetails ?? undefined,
    payers: rawPayers ?? nestedPayers ?? topPayers ?? payload.payers,
    payment_details_id:
      data.paymentDetailsId ??
      payload.payment_details_id ??
      paymentDetails?.id,
  };
}

function extractCheckoutUrl(payload: Record<string, unknown>): string | null {
  const normalized = unwrapPaywisePayload(payload);
  const payers = normalized.payers;
  if (Array.isArray(payers)) {
    for (const payer of payers) {
      const row = asRecord(payer);
      for (const key of ["link", "url", "checkout_url", "payment_link"] as const) {
        const link = row?.[key];
        if (typeof link === "string" && /^https?:\/\//i.test(link.trim())) {
          return link.trim();
        }
      }
    }
  }
  const paymentDetails = asRecord(normalized.payment_details);
  for (const key of ["link", "checkout_url", "payment_link", "url"] as const) {
    const value = paymentDetails?.[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }
  for (const key of ["checkout_url", "payment_link", "link", "url"] as const) {
    const value = normalized[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

/**
 * PayWise often returns bit.ly / `/nonpaywise_transaction/...` shims that some
 * browsers render blank. Resolve to the final `/payment/...` card page.
 */
async function resolveHostedCheckoutUrl(url: string): Promise<string> {
  if (isPaywiseCardPaymentUrl(url)) {
    return url;
  }

  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (isPaywiseCardPaymentUrl(current)) {
      return current;
    }
    const next = await fetchRedirectTarget(current);
    if (!next || next === current) {
      break;
    }
    current = next;
  }
  return current;
}

function isPaywiseCardPaymentUrl(url: string): boolean {
  return /paywise\.co\/payment\//i.test(url);
}

async function fetchRedirectTarget(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    // Prefer not following automatically so we can read Location / meta refresh
    // from blank intermediate pages like `/nonpaywise_transaction/:id`.
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "text/html,*/*" },
    });

    const location = response.headers.get("location")?.trim();
    if (location) {
      try {
        return new URL(location, url).toString();
      } catch {
        return location;
      }
    }

    if (response.status >= 200 && response.status < 300) {
      if (response.url && response.url !== url && isPaywiseCardPaymentUrl(response.url)) {
        return response.url;
      }
      const html = await response.text();
      const meta =
        html.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=['"]?([^'"\s>]+)/i) ??
        html.match(/content=["'][^"']*url=['"]?([^'"\s>]+)[^"']*["'][^>]*http-equiv=["']?refresh/i);
      if (meta?.[1]) {
        try {
          return new URL(meta[1].replace(/&amp;/g, "&"), url).toString();
        } catch {
          return meta[1];
        }
      }
      const anchor = html.match(/href=["'](https?:\/\/[^"']*paywise\.co\/payment\/[^"']+)["']/i);
      if (anchor?.[1]) {
        return anchor[1];
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractPaymentDetailsId(payload: Record<string, unknown>): string | null {
  const normalized = unwrapPaywisePayload(payload);
  const paymentDetails = asRecord(normalized.payment_details);
  return (
    asId(paymentDetails?.id) ??
    asId(normalized.payment_details_id) ??
    asId(asRecord(normalized.data)?.paymentDetailsId)
  );
}

function extractProviderStatus(
  payload: Record<string, unknown>,
  opts: { required?: boolean } = {},
): string | undefined {
  const normalized = unwrapPaywisePayload(payload);
  const paymentDetails = asRecord(normalized.payment_details);
  const transactionRequest = asRecord(normalized.transaction_request);
  const payers = Array.isArray(normalized.payers) ? normalized.payers : [];
  const payerStatus = payers
    .map((row) => asRecord(row)?.status)
    .find((status) => typeof status === "string" && status.trim());
  const candidates = [
    paymentDetails?.status,
    payerStatus,
    transactionRequest?.status,
    normalized.payment_status,
    normalized.transaction_status,
    // Envelope "success" is transport-level; prefer business status when present.
    typeof normalized.status === "string" &&
    !["success", "error"].includes(String(normalized.status).toLowerCase())
      ? normalized.status
      : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (opts.required !== false) {
    throw new PaywiseError("PayWise status response is missing payment status", {
      code: 502,
      retryable: false,
    });
  }
  return undefined;
}

function extractAmountAndCurrency(payload: Record<string, unknown>): {
  amountCents: number;
  currency: string;
} {
  const normalized = unwrapPaywisePayload(payload);
  const paymentDetails = asRecord(normalized.payment_details);
  const transactionRequest = asRecord(normalized.transaction_request);
  const amount =
    paymentDetails?.amount ??
    transactionRequest?.amount ??
    normalized.amount;
  const currencyRaw =
    paymentDetails?.currency ??
    transactionRequest?.currency ??
    normalized.currency;
  if (currencyRaw === undefined || currencyRaw === null || !String(currencyRaw).trim()) {
    throw new PaywiseError("PayWise status response is missing currency", {
      code: 502,
      retryable: false,
    });
  }
  return {
    amountCents: amountStringToCents(amount),
    currency: String(currencyRaw).trim().toUpperCase(),
  };
}

export async function createPaymentRequest(
  input: PaywiseCreateRequestInput,
  config: PaywiseConfig = getPaywiseConfig(),
): Promise<PaywiseCreateRequestResult> {
  const amount = amountCentsToPaywise(input.amountCents);
  // Keep payload aligned with PayWise docs / Checkout Builder — extra fields are rejected.
  const body = {
    api_key: config.apiKey,
    transaction_request: {
      id: input.transactionId,
      amount,
      currency: PAYWISE_CURRENCY,
      description: input.description,
      fees: {
        // Customer (payer) covers the card-processing fee.
        pays_fees: 2,
        payer_covers: 100,
      },
      fraud_check: 0,
      payees: [
        {
          mobile_number: config.payeeMobile,
          amount,
          delay_days: 0,
        },
      ],
      payers: [
        {
          mobile_number: input.payer.mobileNumber,
          first_name: input.payer.firstName,
          last_name: input.payer.lastName,
          email: input.payer.email,
          // Sandbox isolation: Checkout Builder succeeds with direct_pos+card;
          // payment_link hosted handoff blanks after Pay.
          payment_channel: "direct_pos",
          payment_method: "card",
          amount,
        },
      ],
      urls: input.urls,
    },
  };

  const payload = await fetchJson(config, {
    method: "POST",
    path: "/payments/request",
    body,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
  });

  const paymentDetailsId = extractPaymentDetailsId(payload);
  const rawCheckoutUrl = extractCheckoutUrl(payload);
  const checkoutUrl = rawCheckoutUrl
    ? await resolveHostedCheckoutUrl(rawCheckoutUrl)
    : null;
  if (!paymentDetailsId || !checkoutUrl) {
    throw new PaywiseError("PayWise checkout response missing payment details or hosted link", {
      code: 502,
      requestId: typeof payload.request_id === "string" ? payload.request_id : input.requestId,
      retryable: false,
    });
  }

  return {
    paymentDetailsId,
    checkoutUrl,
    providerRequestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
    providerStatus: extractProviderStatus(payload, { required: false }),
    rawMessage: typeof payload.message === "string" ? payload.message : undefined,
  };
}

export async function getPaymentStatus(
  paymentDetailsId: string,
  opts: { requestId?: string; maxRetries?: number } = {},
  config: PaywiseConfig = getPaywiseConfig(),
): Promise<PaywiseStatusResult> {
  const payload = await fetchJson(config, {
    method: "GET",
    path: "/payments/status",
    query: {
      api_key: config.apiKey,
      payment_details_id: paymentDetailsId,
    },
    requestId: opts.requestId,
    maxRetries: opts.maxRetries,
  });

  const providerStatus = extractProviderStatus(payload);
  if (!providerStatus) {
    throw new PaywiseError("PayWise status response is missing payment status", {
      code: 502,
      retryable: false,
    });
  }
  const { amountCents, currency } = extractAmountAndCurrency(payload);
  const returnedPaymentDetailsId = extractPaymentDetailsId(payload);
  if (!returnedPaymentDetailsId || returnedPaymentDetailsId !== paymentDetailsId) {
    throw new PaywiseError("PayWise status response payment id did not match the request", {
      code: 502,
      requestId: typeof payload.request_id === "string" ? payload.request_id : opts.requestId,
      retryable: false,
    });
  }
  return {
    providerStatus,
    normalizedStatus: normalizePaywiseStatus(providerStatus, config),
    amountCents,
    currency,
    providerRequestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
    paymentDetailsId: returnedPaymentDetailsId,
  };
}

export async function cancelPayment(
  paymentDetailsId: string,
  opts: { requestId?: string; idempotencyKey?: string } = {},
  config: PaywiseConfig = getPaywiseConfig(),
): Promise<void> {
  await fetchJson(config, {
    method: "POST",
    path: "/payments/cancel",
    body: {
      api_key: config.apiKey,
      payment_details_id: paymentDetailsId,
    },
    idempotencyKey: opts.idempotencyKey,
    requestId: opts.requestId,
  });
}

export function splitDisplayName(name: string | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return { firstName: "Studio", lastName: "Customer" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "Customer" };
  }
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
  };
}

export function toPaywiseMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    throw new PaywiseError("Phone number is required for PayWise checkout", {
      code: 400,
      retryable: false,
    });
  }
  if (phone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}
