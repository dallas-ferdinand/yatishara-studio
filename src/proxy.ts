import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  PREVIEW_GATE_PATH,
  hasPreviewGateCookie,
  isPreviewGatePath,
  isPreviewHost,
  previewGatePassword,
} from "@/lib/preview-gate";

const convexMiddleware = convexAuthNextjsMiddleware();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const previewPassword = previewGatePassword();
  if (previewPassword || isPreviewHost(request.headers.get("host"))) {
    const pathname = request.nextUrl.pathname;
    if (isPreviewGatePath(pathname)) {
      return NextResponse.next();
    }

    if (!previewPassword) {
      return new NextResponse("Preview password is not configured.", { status: 503 });
    }

    if (!(await hasPreviewGateCookie(request))) {
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = PREVIEW_GATE_PATH;
      gateUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(gateUrl);
    }
  }

  return convexMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!.*\\..*|_next|api/health).*)",
    "/",
    "/(api|trpc)((?!/health).*)",
  ],
};
