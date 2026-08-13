/** Pure Wam helpers — safe for Convex default runtime (no Node crypto / SDK). */

export const WAM_CURRENCY = "TTD";

export type WamNormalizedStatus =
  | "paid"
  | "pending"
  | "rejected"
  | "cancelled"
  | "unknown";

export type WamEnvironment = "staging" | "production";

export function getWamEnvironment(): WamEnvironment {
  const raw = (process.env.WAM_ENVIRONMENT ?? "staging").trim().toLowerCase();
  if (raw === "production" || raw === "prod" || raw === "live") return "production";
  return "staging";
}

/** Map Wam intent status → Studio normalized grant status. */
export function normalizeWamIntentStatus(status: string): WamNormalizedStatus {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "succeeded") return "paid";
  if (s === "failed") return "rejected";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "expired") return "cancelled";
  if (
    s === "created" ||
    s === "requires_payment_method" ||
    s === "processing"
  ) {
    return "pending";
  }
  return "unknown";
}

/**
 * Wam card fee when payer covers 100%: 3% + TT$1.50.
 * @see https://docs.wam.money/docs/help-center/fees
 */
export function wamCardFeeCents(amountCents: number): number {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  return Math.round(base * 0.03) + 150;
}

export function wamCheckoutTotalCents(amountCents: number): number {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  return base + wamCardFeeCents(base);
}

export function wamErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Wam checkout failed";
}

/** Hex compare without Node Buffer (httpAction-safe). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();
  if (x.length !== y.length || !/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y)) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify Wam webhook HMAC in the Convex default runtime (Web Crypto).
 * Same canonical form as SDK: HMAC-SHA256(secret, `${timestamp}.${rawBody}`) → hex.
 */
export async function verifyWamWebhookPayload(args: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secrets: string[];
  toleranceSec?: number;
}): Promise<unknown> {
  const tolerance = args.toleranceSec ?? 300;
  const ts = Number(args.timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) {
    throw new Error("Webhook timestamp out of range");
  }
  const sig = String(args.signature || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) {
    throw new Error("Invalid webhook signature format");
  }
  const secrets = args.secrets.map((s) => String(s || "").trim()).filter(Boolean);
  if (!secrets.length) throw new Error("Webhook secret missing");

  const encoder = new TextEncoder();
  const payload = encoder.encode(`${args.timestamp}.${args.rawBody}`);
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, payload);
    if (timingSafeEqualHex(bytesToHex(mac), sig)) {
      return JSON.parse(args.rawBody);
    }
  }
  throw new Error("Invalid webhook signature");
}
