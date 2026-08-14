import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUDIO_CS_BOT = String(
  process.env.MERCURYOS_STUDIO_CS_BOT || "18683377338",
).replace(/\D/g, "");

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId: rawId } = await context.params;
  const paymentId = decodeURIComponent(String(rawId || "")).replace(/\/+$/, "");
  const url = new URL(request.url);
  const result = (url.searchParams.get("result") || "").toUpperCase();
  const failed = Boolean(result) && result !== "OK";
  const ref = paymentId ? paymentId.slice(-8) : "";
  const text = failed
    ? `I tried to pay with Wam but it didn't go through${ref ? ` (ref ${ref})` : ""}`
    : `I just paid with Wam${ref ? ` (ref ${ref})` : ""}`;
  const location = `https://wa.me/${STUDIO_CS_BOT}?text=${encodeURIComponent(text)}`;
  return NextResponse.redirect(location, 302);
}
