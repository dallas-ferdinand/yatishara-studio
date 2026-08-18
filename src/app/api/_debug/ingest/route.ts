import { appendFile } from "node:fs/promises";
import { NextResponse } from "next/server";

const LOG_PATH = "/opt/mercuryos/.cursor/debug-e220af.log";
const INGEST = "http://localhost:7783/ingest/94ebaafc-d725-476e-b382-9cc88f168e9c";

/** Debug-mode ingest so preview.studio (browser) logs reach the VPS session file. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const line = `${JSON.stringify(body)}\n`;
  await appendFile(LOG_PATH, line).catch(() => undefined);
  void fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "e220af",
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
