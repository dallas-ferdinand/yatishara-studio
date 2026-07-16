import { NextRequest, NextResponse } from "next/server";

const MAX_FIELD_LENGTH = 12_000;

function textField(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const diagnostic = {
      type: "studio-client-react-error",
      message: textField(body?.message),
      stack: textField(body?.stack),
      componentStack: textField(body?.componentStack),
      route: textField(body?.route),
      userAgent: textField(body?.userAgent),
      build: process.env.NEXT_PUBLIC_DESK_BUILD ?? "",
      timestamp: new Date().toISOString(),
    };
    console.error("[studio-client-error]", JSON.stringify(diagnostic));
  } catch {
    // Diagnostics must never create another client-facing failure.
  }

  return NextResponse.json({ ok: true });
}
