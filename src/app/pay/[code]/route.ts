import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { wamCheckoutTotalCents } from "../../../studio/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin 1200×630 — black π on solid white. Small/transparent marks vanish on WA dark cards. */
const PAY_OG_IMAGE_URL = "/branding/yatishara-og-white-1200.png";
const PAY_MARK_IMAGE_URL = "/branding/yatishara-logo-dark-on-white-512.png";
const PAY_WAM_LOGO_URL = "/branding/wam-logo.png";

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

function paySplashHtml(opts: {
  amountCents: number;
  kind: "course" | "topup";
  canonicalUrl: string;
  payHref: string;
}) {
  const charged = wamCheckoutTotalCents(opts.amountCents);
  const amount = (Math.max(0, charged) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amountShort = Number.isInteger(charged / 100)
    ? String(charged / 100)
    : (charged / 100).toFixed(2);
  const brand = "Yatishara Studio";
  const title = `Pay ${brand} $${amount} TTD`;
  const description =
    opts.kind === "course" ? "Academy course" : "Studio top-up";
  const image = new URL(PAY_OG_IMAGE_URL, opts.canonicalUrl).href;
  const mark = new URL(PAY_MARK_IMAGE_URL, opts.canonicalUrl).href;
  const wamLogo = new URL(PAY_WAM_LOGO_URL, opts.canonicalUrl).href;
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
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(brand)}">
<link rel="icon" href="${esc(mark)}" type="image/png">
<link rel="apple-touch-icon" href="${esc(mark)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #f4f1ea; color: #141414; padding: 1.5rem;
  }
  .card {
    width: min(26rem, 100%); background: #fff; border-radius: 1.25rem;
    padding: 1.75rem 1.5rem 1.5rem; text-align: center;
    box-shadow: 0 18px 50px rgba(20, 16, 8, .08);
  }
  .mark { width: 72px; height: 72px; object-fit: contain; margin: 0 auto .85rem; display: block; }
  .brand { margin: 0; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: #6b675e; }
  h1 { margin: .55rem 0 0; font-size: 2rem; letter-spacing: -.03em; }
  .desc { margin: .55rem 0 1.35rem; color: #4a463d; line-height: 1.4; font-size: .95rem; }
  .pay {
    display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
    width: 100%; text-decoration: none; color: #fff; font-weight: 700; font-size: 1.05rem;
    border-radius: 999px; padding: .9rem 1rem; min-height: 3.15rem;
    border: 1px solid #4ade80; border-bottom-color: #15803d;
    background: linear-gradient(180deg, #4ade80 0%, #22c55e 46%, #15803d 100%);
    box-shadow: inset 0 -2px 0 rgba(5,46,22,.22), 0 4px 10px rgba(22,163,74,.18);
    text-shadow: 0 1px 2px rgba(5,46,22,.45);
  }
  .pay .wam { height: 18px; width: auto; display: block; filter: drop-shadow(0 1px 1px rgba(5,46,22,.45)); }
  .hint { margin: .85rem 0 0; font-size: .78rem; color: #7a756a; }
</style>
</head>
<body>
<main class="card">
<img class="mark" src="${esc(mark)}" alt="${esc(brand)}">
<p class="brand">${esc(brand)}</p>
<h1>$${esc(amount)}</h1>
<p class="desc">${esc(description)}</p>
<a class="pay" href="${esc(opts.payHref)}"><span>Pay $${esc(amountShort)} with</span><img class="wam" src="${esc(wamLogo)}" alt="Wam" width="131" height="40"></a>
<p class="hint">Card or Wam wallet · secure checkout</p>
</main>
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
    const origin = new URL(request.url).origin;
    return paySplashHtml({
      amountCents: resolved.amountCents,
      kind: resolved.kind,
      canonicalUrl: `${origin}/pay/${code}`,
      payHref: `${origin}/pay/${code}/go`,
    });
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
