export type BunnyConfig = {
  zone: string;
  accessKey: string;
  storageHost: string;
  cdnHostname: string;
  cdnTokenKey: string;
};

export function getBunnyConfig(): BunnyConfig {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_STORAGE_ACCESS_KEY;
  const region = process.env.BUNNY_STORAGE_REGION;
  const cdnHostname = process.env.BUNNY_PULL_ZONE_HOSTNAME;
  const cdnTokenKey = process.env.BUNNY_CDN_SIGNING_KEY;
  if (!zone || !accessKey || !cdnHostname || !cdnTokenKey) {
    throw new Error("Bunny storage/CDN env not configured");
  }
  const storageHost = region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
  return { zone, accessKey, storageHost, cdnHostname, cdnTokenKey };
}

export function buildAssetPath(args: {
  userId: string;
  folderId: string;
  assetId: string;
  filename: string;
}): string {
  const filename = sanitizeSegment(args.filename) || "asset.bin";
  return `users/${args.userId}/folders/${args.folderId}/assets/${args.assetId}/${filename}`;
}

export function buildReceiptPath(args: {
  userId: string;
  paymentId: string;
  filename: string;
}): string {
  const filename = sanitizeSegment(args.filename) || "receipt.bin";
  return `users/${args.userId}/payments/${args.paymentId}/${filename}`;
}

export function getStorageUploadCredentials(path: string): {
  putUrl: string;
  storageAccessKey: string;
  bunnyPath: string;
} {
  const config = getBunnyConfig();
  const bunnyPath = normalizeStoragePath(path);
  return {
    putUrl: `https://${config.storageHost}/${config.zone}/${bunnyPath}`,
    storageAccessKey: config.accessKey,
    bunnyPath,
  };
}

export async function putObject(args: {
  path: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  const config = getBunnyConfig();
  const body =
    args.body instanceof Uint8Array
      ? copyUint8ArrayToArrayBuffer(args.body)
      : args.body;
  const response = await fetch(
    `https://${config.storageHost}/${config.zone}/${normalizeStoragePath(args.path)}`,
    {
      method: "PUT",
      headers: {
        AccessKey: config.accessKey,
        "Content-Type": args.contentType,
      },
      body,
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bunny PUT failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

function copyUint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function signBunnyCdnUrl(
  path: string,
  expiresUnix: number,
): Promise<string> {
  const config = getBunnyConfig();
  const tokenPath = path.startsWith("/") ? path : `/${path}`;
  const hashable = `${config.cdnTokenKey}${tokenPath}${expiresUnix}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(hashable),
  );
  const token = base64UrlEncode(new Uint8Array(digest));
  const host = config.cdnHostname.replace(/\/$/, "");
  return `https://${host}${tokenPath}?token=${token}&expires=${expiresUnix}`;
}

function normalizeStoragePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
