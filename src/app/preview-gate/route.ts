import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_GATE_COOKIE,
  PREVIEW_GATE_PATH,
  previewGatePassword,
  previewGateToken,
} from "@/lib/preview-gate";

function gatePage(next = "/", error = ""): string {
  const action = `${PREVIEW_GATE_PATH}?next=${encodeURIComponent(next)}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Yatishara Studio Preview</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: radial-gradient(circle at 50% 0%, rgba(196, 255, 64, .16), transparent 34%), #0d100c; color: #f5f7ee; }
      form { width: min(360px, calc(100vw - 32px)); display: grid; gap: 14px; padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 22px; background: rgba(22, 27, 18, .88); box-shadow: 0 22px 70px rgba(0,0,0,.42); backdrop-filter: blur(18px); }
      h1 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
      p { margin: 0; color: rgba(245,247,238,.62); font-size: 13px; line-height: 1.45; }
      input { height: 42px; border: 1px solid rgba(255,255,255,.12); border-radius: 13px; background: rgba(255,255,255,.06); color: #fff; padding: 0 12px; font: inherit; outline: none; }
      input:focus { border-color: rgba(210,255,47,.45); box-shadow: 0 0 0 3px rgba(210,255,47,.12); }
      button { height: 42px; border: 0; border-radius: 13px; background: #d8ff00; color: #11170b; font-weight: 800; cursor: pointer; }
      .error { color: #ff9d9d; }
    </style>
  </head>
  <body>
    <form method="post" action="${action}">
      <h1>Preview Gate</h1>
      <p>Enter password to open hot reload Studio preview.</p>
      ${error ? `<p class="error">${error}</p>` : ""}
      <input name="password" type="password" placeholder="Password" autocomplete="current-password" autofocus />
      <button type="submit">Unlock Preview</button>
    </form>
  </body>
</html>`;
}

function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function GET(request: NextRequest): NextResponse {
  const next = request.nextUrl.searchParams.get("next") || "/";
  return new NextResponse(gatePage(next), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const password = previewGatePassword();
  if (!password) {
    return new NextResponse(gatePage("/", "Preview password is not configured."), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const formData = await request.formData();
  const nextUrl = new URL(request.url).searchParams.get("next") || "/";
  const submittedPassword = String(formData.get("password") ?? "");
  if (submittedPassword !== password) {
    return new NextResponse(gatePage(nextUrl, "Wrong password."), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const response = NextResponse.redirect(new URL(nextUrl, publicOrigin(request)));
  response.cookies.set(PREVIEW_GATE_COOKIE, await previewGateToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
