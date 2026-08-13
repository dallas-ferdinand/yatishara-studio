"use node";

/** Node-only Wam Payment SDK wrapper — import only from `"use node"` actions. */

import { WamPaymentError, WamPaymentSDK } from "@wamnow/payment-sdk";
import { getWamEnvironment } from "./wam";

export { WamPaymentError, WamPaymentSDK };

let cachedSdk: WamPaymentSDK | null = null;

export function getWamSDK(opts?: { webhookSecret?: string }): WamPaymentSDK {
  const businessId = (process.env.WAM_BUSINESS_ID ?? "").trim();
  const apiKey = (process.env.WAM_API_KEY ?? "").trim();
  if (!businessId || !apiKey) {
    throw new WamPaymentError(
      "Wam is not configured (missing WAM_BUSINESS_ID or WAM_API_KEY).",
      "MISSING_CREDENTIALS",
    );
  }
  const webhookSecret =
    opts?.webhookSecret?.trim() ||
    (process.env.WAM_WEBHOOK_SECRET ?? "").trim() ||
    undefined;
  if (cachedSdk && !opts?.webhookSecret) {
    return cachedSdk;
  }
  const sdk = new WamPaymentSDK({
    businessId,
    apiKey,
    environment: getWamEnvironment(),
    ...(webhookSecret ? { webhookSecret } : {}),
  });
  if (!opts?.webhookSecret) cachedSdk = sdk;
  return sdk;
}
