/**
 * Wave 4 — Account extras + notifications HTTP surface.
 *
 * Mounted in http.ts (Wave HTTP wiring). Exact /api/v1/account stays on studioApiV1.
 *
 * | Method | Path                          | Scope  | ForApi                                      |
 * |--------|-------------------------------|--------|---------------------------------------------|
 * | GET    | /api/v1/account/payments      | read   | billing.listMyPaymentsForApi                |
 * | GET    | /api/v1/account/payments/:id  | read   | billing.getMyPaymentForApi                  |
 * | GET    | /api/v1/account/credits       | read   | billing.listMyCreditTransactionsForApi      |
 * | GET    | /api/v1/account/plans         | read   | billing.listSubscriptionPlansForApi         |
 * | GET    | /api/v1/account/pricing       | read   | billing.getPricingForApi                    |
 * | GET    | /api/v1/account/storage       | read   | storageBilling.getMyStorageForApi           |
 * | GET    | /api/v1/notifications         | social | notifications.listMineForApi                |
 * | POST   | /api/v1/notifications/:id/read| social | notifications.markReadForApi                |
 *
 * Existing: GET /api/v1/account (studioApiV1) — credit balance only.
 * Optional later: enrich /account with billing.currentAccountForApi (subscription).
 *
 * Mount sketch for http.ts when ready:
 *   import { studioApiAccountExtra, studioApiAccountExtraOptions } from "./studioApiAccountExtra";
 *   for (const path of ["/api/v1/account/payments", "/api/v1/account/credits", ...]) { ... }
 *   http.route({ pathPrefix: "/api/v1/account/", method: "GET", handler: studioApiAccountExtra });
 *   http.route({ pathPrefix: "/api/v1/notifications", method: "GET"|"POST", handler: studioApiAccountExtra });
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  authenticateStudioRequest,
  type StudioHttpAuth,
} from "./lib/studioApi/requestAuth";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from "./lib/studioApi/httpHelpers";

type AuthContext = Pick<StudioHttpAuth, "userId" | "apiKeyId" | "scopes">;

async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  requiredScope: string,
): Promise<AuthContext | Response> {
  const auth = await authenticateStudioRequest(ctx, request, requiredScope);
  if (auth instanceof Response) return auth;
  return {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes: auth.scopes,
  };
}

function routePath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
}

export const studioApiAccountExtra = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  const started = Date.now();
  const url = new URL(request.url);
  const route = routePath(url.pathname);
  let audit: { apiKeyId: Id<"apiKeys">; userId: Id<"users"> } | null = null;

  const finish = async (response: Response) => {
    if (audit) {
      await ctx
        .runMutation(internal.studioApiInternal.logApiRequest, {
          apiKeyId: audit.apiKeyId,
          userId: audit.userId,
          method: request.method,
          route: `/api/v1/${route}`,
          status: response.status,
          latencyMs: Date.now() - started,
        })
        .catch(() => {});
    }
    return response;
  };

  const authFor = async (scope: string): Promise<AuthContext | Response> => {
    const auth = await authenticateRequest(ctx, request, scope);
    if (!(auth instanceof Response)) {
      audit = { apiKeyId: auth.apiKeyId, userId: auth.userId };
    }
    return auth;
  };

  try {
    // --- Billing depth (scope: read) ---

    if (request.method === "GET" && route === "account/payments") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const payments = await ctx.runQuery(internal.billing.listMyPaymentsForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ payments }));
    }

    const paymentMatch = route.match(/^account\/payments\/([^/]+)$/);
    if (request.method === "GET" && paymentMatch) {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const payment = await ctx.runQuery(internal.billing.getMyPaymentForApi, {
        userId: auth.userId,
        paymentId: paymentMatch[1] as Id<"payments">,
      });
      if (!payment) {
        return finish(errorResponse("Payment not found", 404));
      }
      return finish(jsonResponse({ payment }));
    }

    if (request.method === "GET" && route === "account/credits") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const numItemsRaw = url.searchParams.get("numItems");
      const numItems = numItemsRaw ? Number(numItemsRaw) : 50;
      if (!Number.isFinite(numItems) || numItems < 1 || numItems > 200) {
        return finish(errorResponse("numItems must be 1–200", 400));
      }
      const cursorParam = url.searchParams.get("cursor");
      const cursor = cursorParam && cursorParam.length > 0 ? cursorParam : null;
      const result = await ctx.runQuery(internal.billing.listMyCreditTransactionsForApi, {
        userId: auth.userId,
        paginationOpts: { numItems, cursor },
      });
      return finish(jsonResponse(result));
    }

    if (request.method === "GET" && route === "account/plans") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const plans = await ctx.runQuery(internal.billing.listSubscriptionPlansForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ plans }));
    }

    if (request.method === "GET" && route === "account/pricing") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const pricing = await ctx.runQuery(internal.billing.getPricingForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ pricing }));
    }

    if (request.method === "GET" && route === "account/storage") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const storage = await ctx.runQuery(internal.storageBilling.getMyStorageForApi, {
        userId: auth.userId,
        now: Date.now(),
      });
      return finish(jsonResponse({ storage }));
    }

    // Optional: subscription-enriched account (not replacing GET /account yet)
    if (request.method === "GET" && route === "account/subscription") {
      const auth = await authFor("read");
      if (auth instanceof Response) return finish(auth);
      const account = await ctx.runQuery(internal.billing.currentAccountForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse(account));
    }

    // --- Notifications (scope: social) ---

    if (request.method === "GET" && route === "notifications") {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      const notifications = await ctx.runQuery(internal.notifications.listMineForApi, {
        userId: auth.userId,
      });
      return finish(jsonResponse({ notifications }));
    }

    const notifReadMatch = route.match(/^notifications\/([^/]+)\/read$/);
    if (request.method === "POST" && notifReadMatch) {
      const auth = await authFor("social");
      if (auth instanceof Response) return finish(auth);
      await ctx.runMutation(internal.notifications.markReadForApi, {
        userId: auth.userId,
        notificationId: notifReadMatch[1] as Id<"notifications">,
      });
      return finish(jsonResponse({ ok: true, id: notifReadMatch[1] }));
    }

    if (request.method === "POST" && route === "account/checkout") {
      const auth = await authFor("generate");
      if (auth instanceof Response) return finish(auth);
      const body = await readJsonBody<{
        amountCents?: number;
        creditsRequested?: number;
        reference?: string;
        academyCourseId?: string;
        clientRequestId?: string;
      }>(request);
      if (body.amountCents == null || !Number.isFinite(body.amountCents) || body.amountCents <= 0) {
        return finish(errorResponse("amountCents is required"));
      }
      const result = await ctx.runAction(internal.wamActions.startCheckoutForApi, {
        userId: auth.userId,
        clientRequestId:
          body.clientRequestId?.trim() ||
          `mcp:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        amountCents: Math.round(body.amountCents),
        creditsRequested: body.creditsRequested,
        reference: body.reference,
        academyCourseId: body.academyCourseId
          ? (body.academyCourseId as Id<"academyCourses">)
          : undefined,
      });
      return finish(jsonResponse(result));
    }

    return finish(errorResponse("Not found", 404));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      message.includes("not found") || message.includes("Not found") ? 404 : 400;
    return finish(errorResponse(message, status));
  }
});

export const studioApiAccountExtraOptions = httpAction(async () => optionsResponse());
