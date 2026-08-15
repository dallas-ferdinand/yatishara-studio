import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Hosts we will fetch and re-stream for same-origin Save As downloads. */
function allowedDownloadHosts(): Set<string> {
  const hosts = new Set<string>();
  const pull = String(process.env.BUNNY_PULL_ZONE_HOSTNAME || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (pull) hosts.add(pull);
  const bg = String(process.env.NEXT_PUBLIC_STUDIO_BG_CDN || "").trim();
  if (bg) {
    try {
      hosts.add(new URL(bg).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  // Unsigned wallpaper / public assets CDN used in Studio.
  hosts.add("yatishara-studio-assets.b-cdn.net");
  return hosts;
}

function isAllowedMediaUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedDownloadHosts();
  if (allowed.has(host)) return true;
  // Signed Bunny pull zones are almost always *.b-cdn.net
  if (host.endsWith(".b-cdn.net")) return true;
  return false;
}

function safeFilename(name: string, fallbackUrl: string): string {
  const cleaned = String(name || "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim();
  if (cleaned) return cleaned.slice(0, 180);
  try {
    const base = new URL(fallbackUrl).pathname.split("/").filter(Boolean).pop() || "download";
    return base.slice(0, 180);
  } catch {
    return "download";
  }
}

/**
 * Same-origin download proxy for Bunny CDN media.
 * Browser <a download> ignores cross-origin URLs (opens a tab / does nothing).
 * Streaming through this route forces Content-Disposition: attachment.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mediaUrl = String(url.searchParams.get("url") || "").trim();
  const filename = safeFilename(String(url.searchParams.get("filename") || ""), mediaUrl);

  if (!mediaUrl || !isAllowedMediaUrl(mediaUrl)) {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }

  try {
    const upstream = await fetch(mediaUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "*/*" },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { ok: false, error: "upstream_failed" },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get("Content-Type") || "application/octet-stream";
    const contentLength = upstream.headers.get("Content-Length");
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    });
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ ok: false, error: "cdn_download_failed" }, { status: 502 });
  }
}
