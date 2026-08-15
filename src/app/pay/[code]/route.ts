import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_RE =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|Discordbot|LinkedInBot|Iframely|SkypeUriPreview/i;

function isLinkPreviewBot(userAgent: string | null) {
  const ua = String(userAgent || "");
  if (BOT_RE.test(ua)) return true;
  if (/WhatsApp/i.test(ua) && !/Mozilla/i.test(ua)) return true;
  return false;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function payPreviewHtml(opts: {
  amountCents: number;
  kind: "course" | "topup";
  canonicalUrl: string;
}) {
  const amount = (Math.max(0, opts.amountCents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const brand = "Yatishara Studio";
  const title = `Pay ${brand} $${amount} TTD`;
  const description =
    opts.kind === "course" ? "Academy course" : "Studio top-up";
  const image = "https://link.yatishara.com/branding/yatishara-logo-light-192.webp";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(opts.canonicalUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:28rem;line-height:1.45;color:#111">
<h1 style="font-size:1.2rem;margin:0 0 .5rem">${esc(title)}</h1>
<p style="margin:0;color:#444">${esc(description)}</p>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function resolvePay(
  request: Request,
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
    if (isLinkPreviewBot(request.headers.get("user-agent"))) {
      const origin = new URL(request.url).origin;
      return payPreviewHtml({
        amountCents: resolved.amountCents,
        kind: resolved.kind,
        canonicalUrl: `${origin}/pay/${code}`,
      });
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

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return resolvePay(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return resolvePay(request, context);
}
