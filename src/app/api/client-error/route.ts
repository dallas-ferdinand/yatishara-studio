import { NextRequest, NextResponse } from "next/server";

const MAX_FIELD_LENGTH = 12_000;
const MAX_BODY_LENGTH = 64_000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function textField(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

function diagnosticRoute(value: unknown): string {
  const raw = textField(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.pathname.slice(0, MAX_FIELD_LENGTH);
  } catch {
    return raw.split(/[?#]/, 1)[0];
  }
}

function requestKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(request: NextRequest): boolean {
  const now = Date.now();
  if (rateBuckets.size > 1_000) {
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(key);
    }
  }

  const key = requestKey(request);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== request.nextUrl.origin) ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site")
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  if (isRateLimited(request)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_LENGTH) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
    const diagnostic = {
      type: "studio-client-react-error",
      message: textField(body?.message),
      stack: textField(body?.stack),
      componentStack: textField(body?.componentStack),
      route: diagnosticRoute(body?.route),
      userAgent: textField(body?.userAgent),
      build: process.env.NEXT_PUBLIC_DESK_BUILD ?? "",
      timestamp: new Date().toISOString(),
    };
    console.error("[studio-client-error]", JSON.stringify(diagnostic));
  } catch {
    // Diagnostics must never create another client-facing failure.
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
