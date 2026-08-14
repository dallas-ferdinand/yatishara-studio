import { NextResponse } from "next/server";
import {
  STUDIO_WAM_RETURN_COOKIE,
  encodeWamReturnCookie,
} from "@/studio/lib/wamReturn";

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
  const payload = encodeWamReturnCookie({
    ...(paymentId ? { paymentId } : {}),
    ...(academyCourse ? { academyCourse } : {}),
    ...(billing ? { billing } : {}),
    ...(identifier ? { identifier } : {}),
    ...(Number.isFinite(amountRaw) && amountRaw > 0 ? { amountCents: amountRaw } : {}),
    ...(result === "OK" || !result ? { wamOk: true } : {}),
  });
  const origin = url.origin;
  const response = NextResponse.redirect(`${origin}/`, 302);
  response.headers.set("Set-Cookie", cookieHeader(payload));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
