import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function enqueuePaywiseHttp(
  ctx: ActionCtx,
  request: Request,
  endpoint: "notify" | "callback",
): Promise<Response> {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!paymentId || !token) {
    return jsonResponse({ ok: false }, 400);
  }

  let body = "";
  try {
    body = await request.text();
  } catch {
    return jsonResponse({ ok: false }, 400);
  }

  const result = await ctx.runMutation(internal.billing.enqueuePaywiseCallback, {
    paymentId,
    token,
    endpoint,
    method: request.method,
    requestId:
      request.headers.get("x-request-id") ??
      request.headers.get("pw-request-id") ??
      undefined,
    bodySha256: body ? await sha256Hex(body) : undefined,
    receivedAt: Date.now(),
  });
  if (!result.accepted) {
    return jsonResponse({ ok: false }, 401);
  }
  return jsonResponse({ ok: true, queued: true }, 202);
}

export const paywiseNotify = httpAction(async (ctx, request) => {
  return await enqueuePaywiseHttp(ctx, request, "notify");
});

export const paywiseCallback = httpAction(async (ctx, request) => {
  return await enqueuePaywiseHttp(ctx, request, "callback");
});
