/** Bunny PUT + signed GET for the ffmpeg worker. Do not import convex/lib/bunny.ts here. */

type BunnyConfig = {
  zone: string;
  accessKey: string;
  storageHost: string;
  cdnHostname: string;
  cdnTokenKey: string;
};

function getBunnyConfig(): BunnyConfig {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_STORAGE_ACCESS_KEY;
  const region = process.env.BUNNY_STORAGE_REGION;
  const cdnHostname = process.env.BUNNY_PULL_ZONE_HOSTNAME;
  const cdnTokenKey = process.env.BUNNY_CDN_SIGNING_KEY;
  if (!zone || !accessKey || !cdnHostname || !cdnTokenKey) {
    throw new Error("Bunny storage/CDN env not configured on ffmpeg worker");
  }
  const storageHost = region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
  return { zone, accessKey, storageHost, cdnHostname, cdnTokenKey };
}

function normalizeStoragePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function clampExpiresUnix(requestedUnix: number, nowUnix = Math.floor(Date.now() / 1000)): number {
  const max = nowUnix + 60 * 60 * 24;
  const min = nowUnix + 60;
  if (!Number.isFinite(requestedUnix)) return max;
  return Math.max(min, Math.min(Math.floor(requestedUnix), max));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function putObject(args: {
  path: string;
  body: Uint8Array | Buffer;
  contentType: string;
}): Promise<void> {
  const config = getBunnyConfig();
  const bytes = args.body instanceof Uint8Array ? args.body : new Uint8Array(args.body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const response = await fetch(
    `https://${config.storageHost}/${config.zone}/${normalizeStoragePath(args.path)}`,
    {
      method: "PUT",
      headers: {
        AccessKey: config.accessKey,
        "Content-Type": args.contentType,
      },
      body: copy,
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bunny PUT failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

export async function signBunnyCdnUrl(path: string, expiresUnix: number): Promise<string> {
  const config = getBunnyConfig();
  const expires = clampExpiresUnix(expiresUnix);
  const tokenPath = path.startsWith("/") ? path : `/${path}`;
  const hashable = `${config.cdnTokenKey}${tokenPath}${expires}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashable));
  const token = base64UrlEncode(new Uint8Array(digest));
  const host = config.cdnHostname.replace(/\/$/, "");
  const params = new URLSearchParams({ token, expires: String(expires) });
  return `https://${host}${tokenPath}?${params.toString()}`;
}
