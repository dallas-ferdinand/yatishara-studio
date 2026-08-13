import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyWamWebhookPayload } from "./lib/wam";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function webhookSecrets(): string[] {
  return [
    process.env.WAM_WEBHOOK_SECRET,
    process.env.WAM_WEBHOOK_SECRET_PREVIOUS,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

/**
 * Wam signed webhooks. Fulfill only after HMAC verify (Web Crypto — no Node SDK).
 * Register in Business Portal: POST https://convex-studio.yatishara.com/wam/webhooks
 */
export const wamWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    console.error("wam_webhook_missing_secret");
    return jsonResponse({ ok: false, error: "not_configured" }, 503);
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: "bad_body" }, 400);
  }

  const signature = request.headers.get("x-wam-signature") ?? "";
  const timestamp = request.headers.get("x-wam-timestamp") ?? "";

  let event: {
    id?: string;
    type: string;
    data: {
      paymentId?: string;
      merchantReference?: string | null;
      status?: string;
    };
  };
  try {
    event = (await verifyWamWebhookPayload({
      rawBody,
      signature,
      timestamp,
      secrets,
    })) as typeof event;
  } catch (err) {
    console.error("wam_webhook_verify_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return jsonResponse({ ok: false, error: "invalid_signature" }, 401);
  }

  const settleTypes = new Set([
    "payment_intent.succeeded",
    "payment_intent.failed",
    "payment_intent.canceled",
    "payment_intent.expired",
  ]);

  if (settleTypes.has(event.type)) {
    await settleFromEvent(ctx, {
      merchantReference: String(event.data.merchantReference || "").trim(),
      externalPaymentId: String(event.data.paymentId || ""),
      eventId: String(event.id || ""),
      type: event.type,
    });
  }

  return jsonResponse({ received: true }, 200);
});

async function settleFromEvent(
  ctx: ActionCtx,
  args: {
    merchantReference: string;
    externalPaymentId: string;
    eventId: string;
    type: string;
  },
): Promise<void> {
  if (!args.merchantReference) {
    console.error("wam_webhook_missing_merchant_reference", {
      eventId: args.eventId,
      type: args.type,
    });
    return;
  }
  try {
    await ctx.runAction(internal.wamActions.settleFromWebhook, {
      paymentId: args.merchantReference as never,
      externalPaymentId: args.externalPaymentId || undefined,
    });
  } catch (err) {
    console.error("wam_webhook_settle_failed", {
      merchantReference: args.merchantReference,
      eventId: args.eventId,
      type: args.type,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
