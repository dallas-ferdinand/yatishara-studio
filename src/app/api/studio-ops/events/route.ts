import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** Proxy Sophie Ops SSE (presence / message / working) — ops token stays server-side. */
export async function GET(req: Request) {
  const token = opsToken();
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (token) {
    headers["x-studio-cs-ops-token"] = token;
    headers.Authorization = `Bearer ${token}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${opsBase()}/api/studio-cs/events`, {
      headers,
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "events_proxy_failed" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { ok: false, error: "events_upstream" },
      { status: upstream.status === 401 ? 401 : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
