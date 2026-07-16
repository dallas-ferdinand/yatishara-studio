export type BunnyConfig = {
  zone: string;
  accessKey: string;
  storageHost: string;
  cdnHostname: string;
  cdnTokenKey: string;
};

let cachedConfig: BunnyConfig | null = null;

export function getBunnyConfig(): BunnyConfig {
  if (cachedConfig) return cachedConfig;
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_STORAGE_ACCESS_KEY;
  const region = process.env.BUNNY_STORAGE_REGION;
  const cdnHostname = process.env.BUNNY_PULL_ZONE_HOSTNAME;
  const cdnTokenKey = process.env.BUNNY_CDN_SIGNING_KEY;
  if (!zone || !accessKey || !cdnHostname || !cdnTokenKey) {
    throw new Error("Bunny storage/CDN env not configured");
  }
  const storageHost = region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
  cachedConfig = { zone, accessKey, storageHost, cdnHostname, cdnTokenKey };
  return cachedConfig;
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

/** Thumbnail path used for grid/peek previews (not the full media URL). */
export function assetThumbnailPath(asset: {
  kind?: string;
  bunnyPath?: string;
  thumbnailPath?: string;
}): string | undefined {
  if (asset.thumbnailPath) return asset.thumbnailPath;
  if (asset.kind === "image" && asset.bunnyPath) return asset.bunnyPath;
  return undefined;
}

/** Bunny Optimizer transforms for list/peek thumbs (not full media). */
export type BunnyImageTransform = {
  width?: number;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
  blur?: number;
};

/** Grid / asset list thumbs — small WebP, edge-cached after first hit. */
export const THUMB_TRANSFORM: BunnyImageTransform = {
  width: 640,
  quality: 74,
  format: "webp",
};

/** Style-sheet / large preview cards — sharp enough for look selection. */
export const PREVIEW_TRANSFORM: BunnyImageTransform = {
  width: 1280,
  quality: 88,
  format: "webp",
};

/**
 * Full image views — high width ceiling + quality 100 so Bunny Optimizer Autopilot
 * does not downscale to ~1600px. Bunny will not upscale past the origin.
 */
export const FULL_QUALITY_TRANSFORM: BunnyImageTransform = {
  width: 8192,
  quality: 100,
};

/** Folder peek cards — even smaller. */
export const PEEK_TRANSFORM: BunnyImageTransform = {
  width: 280,
  quality: 58,
  format: "webp",
};

/** Tiny blur placeholder for progressive fade-in. */
export const LQIP_TRANSFORM: BunnyImageTransform = {
  width: 48,
  quality: 28,
  format: "webp",
  blur: 15,
};

function transformToQuery(transform?: BunnyImageTransform): Record<string, string> {
  if (!transform) return {};
  const query: Record<string, string> = {};
  if (transform.width != null) query.width = String(transform.width);
  if (transform.quality != null) query.quality = String(transform.quality);
  if (transform.format) query.format = transform.format;
  if (transform.blur != null) query.blur = String(transform.blur);
  return query;
}

/**
 * Sign a Bunny CDN URL. Optional Optimizer query params are included in the
 * token hash (Bunny Token Auth V2) so width/quality cannot be stripped.
 */
export async function signBunnyCdnUrl(
  path: string,
  expiresUnix: number,
  transform?: BunnyImageTransform,
): Promise<string> {
  const config = getBunnyConfig();
  const tokenPath = path.startsWith("/") ? path : `/${path}`;
  const extra = transformToQuery(transform);
  const parameterData = Object.keys(extra)
    .sort()
    .map((key) => `${key}=${extra[key]}`)
    .join("&");
  const hashable = `${config.cdnTokenKey}${tokenPath}${expiresUnix}${parameterData}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(hashable),
  );
  const token = base64UrlEncode(new Uint8Array(digest));
  const host = config.cdnHostname.replace(/\/$/, "");
  const params = new URLSearchParams({
    token,
    expires: String(expiresUnix),
    ...extra,
  });
  return `https://${host}${tokenPath}?${params.toString()}`;
}

/** Sign many paths once — list/peek queries must stay under Convex's 1s limit. */
export async function signBunnyCdnUrls(
  paths: Array<string | undefined | null>,
  expiresUnix: number,
  transform?: BunnyImageTransform,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const entries = await Promise.all(
    unique.map(async (path) => [path, await signBunnyCdnUrl(path, expiresUnix, transform)] as const),
  );
  return new Map(entries);
}

/** List/peek thumbnail URL (resized). Full media uses FULL_QUALITY_TRANSFORM for images. */
export async function signBunnyThumbUrl(
  path: string,
  expiresUnix: number,
  transform: BunnyImageTransform = THUMB_TRANSFORM,
): Promise<string> {
  return signBunnyCdnUrl(path, expiresUnix, transform);
}

/** Sign a full-fidelity image URL (bypass Autopilot downscale). Videos: raw path. */
export async function signBunnyFullUrl(
  path: string,
  expiresUnix: number,
  kind?: string,
): Promise<string> {
  if (kind && kind !== "image") {
    return signBunnyCdnUrl(path, expiresUnix);
  }
  return signBunnyCdnUrl(path, expiresUnix, FULL_QUALITY_TRANSFORM);
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
