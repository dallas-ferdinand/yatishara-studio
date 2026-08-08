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

/** Proxy Sophie WA media from studio-cs (ops-token stays server-side). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ ok: false, error: "key required" }, { status: 400 });
  }
  const token = opsToken();
  const headers: Record<string, string> = {
    Accept: "*/*",
  };
  if (token) {
    headers["x-studio-cs-ops-token"] = token;
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(
      `${opsBase()}/api/studio-cs/media?key=${encodeURIComponent(key)}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "media not found" },
        { status: res.status === 404 ? 404 : 502 },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "media_proxy_failed" }, { status: 502 });
  }
}
