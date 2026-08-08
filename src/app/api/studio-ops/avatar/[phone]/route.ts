import { NextResponse } from "next/server";

export const runtime = "nodejs";

function opsBase(): string {
  return (
    process.env.STUDIO_CS_OPS_URL ||
    process.env.MERCURYOS_STUDIO_CS_URL ||
    "http://127.0.0.1:8795"
  ).replace(/\/+$/, "");
}

function opsToken(): string {
  return (
    process.env.STUDIO_CS_OPS_TOKEN ||
    process.env.MERCURYOS_STUDIO_CS_OPS_TOKEN ||
    ""
  ).trim();
}

/** Proxy Sophie WA profile pics from studio-cs (ops-token stays server-side). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> },
) {
  const { phone: raw } = await ctx.params;
  const phone = String(raw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) {
    return NextResponse.json({ ok: false, error: "phone required" }, { status: 400 });
  }
  const token = opsToken();
  const headers: Record<string, string> = { Accept: "image/jpeg,application/json" };
  if (token) {
    headers["x-studio-cs-ops-token"] = token;
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(
      `${opsBase()}/api/studio-cs/avatar/${encodeURIComponent(phone)}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "no_avatar" },
        { status: res.status === 404 ? 404 : 502 },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "avatar_proxy_failed" }, { status: 502 });
  }
}
