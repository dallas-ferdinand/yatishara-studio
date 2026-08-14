import { NextResponse } from "next/server";
import {
  STUDIO_WAM_RETURN_COOKIE,
  encodeWamReturnCookie,
} from "@/studio/lib/wamReturn";
import { publicStudioOrigin } from "@/studio/lib/publicSiteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieHeader(value: string) {
  return `${STUDIO_WAM_RETURN_COOKIE}=${value}; Path=/; Max-Age=900; SameSite=Lax`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId: rawId } = await context.params;
  const paymentId = decodeURIComponent(String(rawId || "")).replace(/\/+$/, "");
  const url = new URL(request.url);
  const result = (url.searchParams.get("result") || "").toUpperCase();
  const paid = result === "OK";
  const home = `${publicStudioOrigin(url)}/`;
  const response = NextResponse.redirect(home, 302);
  response.headers.set("Cache-Control", "no-store");
  if (!paid) {
    response.headers.set(
      "Set-Cookie",
      cookieHeader(encodeWamReturnCookie({ abandoned: true })),
    );
    return response;
  }
  const identifier = (url.searchParams.get("identifier") || "").trim();
  const amountRaw = Number.parseInt(url.searchParams.get("amount") || "", 10);
  const billingRaw = url.searchParams.get("billing");
  const billing =
    billingRaw === "plans" ||
    billingRaw === "invoices" ||
    billingRaw === "topup" ||
    billingRaw === "academy"
      ? billingRaw
      : undefined;
  const academyCourse = url.searchParams.get("academyCourse") || undefined;
  response.headers.set(
    "Set-Cookie",
    cookieHeader(
      encodeWamReturnCookie({
        wamOk: true,
        ...(paymentId ? { paymentId } : {}),
        ...(academyCourse ? { academyCourse } : {}),
        ...(billing ? { billing } : {}),
        ...(identifier ? { identifier } : {}),
        ...(Number.isFinite(amountRaw) && amountRaw > 0 ? { amountCents: amountRaw } : {}),
      }),
    ),
  );
  return response;
}
