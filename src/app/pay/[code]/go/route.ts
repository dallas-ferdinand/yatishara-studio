import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string, status = 404) {
  return new Response(
    `<!doctype html><meta charset=utf-8><title>${title}</title><body style="font-family:system-ui;padding:2rem"><h1>${title}</h1><p>${body}</p></body>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

async function goToCheckout(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = String(raw || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]{8,16}$/.test(code)) {
    return htmlPage("Link not found", "This payment link is invalid.");
  }
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return htmlPage("Payment unavailable", "Checkout is temporarily unavailable.", 503);
  }
  try {
    const client = new ConvexHttpClient(convexUrl);
    const resolved = await client.query(api.billing.resolvePublicPayLink, {
      code,
    });
    if (!resolved?.checkoutUrl) {
      return htmlPage("Link not found", "This payment link is invalid or expired.");
    }
    if (
      resolved.status === "payment_completed" ||
      resolved.status === "cancelled" ||
      resolved.status === "checkout_failed" ||
      resolved.status === "rejected"
    ) {
      return htmlPage("Link no longer active", "Ask us on WhatsApp for a new payment link.", 410);
    }
    return Response.redirect(resolved.checkoutUrl, 302);
  } catch {
    return htmlPage("Payment unavailable", "Could not open this payment link right now.", 502);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return goToCheckout(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return goToCheckout(request, context);
}
