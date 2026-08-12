import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string, status = 404) {
  return new Response(
    `<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;line-height:1.45;color:#111"><h1 style="font-size:1.25rem;margin:0 0 .75rem">${title}</h1><p style="margin:0;color:#444">${body}</p></body>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = String(raw || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]{8,16}$/.test(code)) {
    return htmlPage(
      "Link not found",
      "This payment link is invalid. Message us on WhatsApp and we’ll send a fresh one.",
    );
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
      return htmlPage(
        "Link not found",
        "This payment link is invalid or expired. Message us on WhatsApp and we’ll send a fresh one.",
      );
    }
    if (
      resolved.status === "payment_completed" ||
      resolved.status === "cancelled" ||
      resolved.status === "checkout_failed" ||
      resolved.status === "rejected"
    ) {
      return htmlPage(
        "Link no longer active",
        "Ask us on WhatsApp for a new payment link.",
        410,
      );
    }
    return Response.redirect(resolved.checkoutUrl, 302);
  } catch {
    return htmlPage(
      "Payment unavailable",
      "Could not open this payment link right now. Try again in a moment, or message us on WhatsApp.",
      502,
    );
  }
}
