import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const convexMiddleware = convexAuthNextjsMiddleware();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  return convexMiddleware(request, event);
}

export const config = {
  matcher: [
    // Public PayWise short links: /pay/<code> (no auth gate).
    "/((?!.*\\..*|_next|api/health|pay/).*)",
    "/",
    "/(api|trpc)((?!/health).*)",
  ],
};
