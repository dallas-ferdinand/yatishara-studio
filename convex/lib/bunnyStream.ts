/**
 * Bunny Stream helpers — library create/upload signing + embed token auth.
 * AccessKey never leaves Convex. Token auth key is optional (library Security).
 */

export type BunnyStreamConfig = {
  libraryId: string;
  accessKey: string;
  /** Optional: Stream library Token Authentication key for signed embeds. */
  tokenAuthKey: string | null;
};

let cached: BunnyStreamConfig | null = null;

export function getBunnyStreamConfig(): BunnyStreamConfig {
  if (cached) return cached;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const accessKey = process.env.BUNNY_STREAM_ACCESS_KEY?.trim();
  if (!libraryId || !accessKey) {
    throw new Error("Bunny Stream env not configured (BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_ACCESS_KEY)");
  }
  const tokenAuthKey =
    process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim() ||
    process.env.BUNNY_STREAM_CDN_TOKEN_KEY?.trim() ||
    null;
  cached = { libraryId, accessKey, tokenAuthKey };
  return cached;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** TUS presign: SHA256(libraryId + apiKey + expiration + videoId) */
export async function signStreamTusUpload(args: {
  libraryId: string;
  accessKey: string;
  videoId: string;
  expirationUnix: number;
}): Promise<string> {
  return sha256Hex(
    `${args.libraryId}${args.accessKey}${args.expirationUnix}${args.videoId}`,
  );
}

/** Embed token: SHA256(securityKey + videoId + expiration) */
export async function signStreamEmbedToken(args: {
  tokenAuthKey: string;
  videoId: string;
  expirationUnix: number;
}): Promise<string> {
  return sha256Hex(
    `${args.tokenAuthKey}${args.videoId}${args.expirationUnix}`,
  );
}

export function buildStreamEmbedUrl(args: {
  libraryId: string;
  videoId: string;
  token?: string;
  expiresUnix?: number;
}): string {
  const base = `https://iframe.mediadelivery.net/embed/${args.libraryId}/${args.videoId}`;
  const params = new URLSearchParams();
  params.set("autoplay", "false");
  params.set("preload", "true");
  // Keep iframe inside our 16:9 shell — responsive=true breaks out and feels stuck on mobile.
  params.set("responsive", "false");
  if (args.token && args.expiresUnix) {
    params.set("token", args.token);
    params.set("expires", String(args.expiresUnix));
  }
  return `${base}?${params.toString()}`;
}

export async function createStreamVideo(args: {
  title: string;
}): Promise<{ videoId: string; libraryId: string }> {
  const cfg = getBunnyStreamConfig();
  const res = await fetch(
    `https://video.bunnycdn.com/library/${cfg.libraryId}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: cfg.accessKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: args.title.slice(0, 200) || "Academy course" }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bunny Stream create video failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as { guid?: string };
  if (!body.guid) throw new Error("Bunny Stream create video returned no guid");
  return { videoId: body.guid, libraryId: cfg.libraryId };
}

export async function setStreamThumbnail(args: {
  videoId: string;
  /** Public HTTPS image URL for Bunny to fetch, OR omit and pass `bytes`. */
  thumbnailUrl?: string;
  bytes?: Uint8Array | ArrayBuffer;
}): Promise<void> {
  const cfg = getBunnyStreamConfig();
  const params = new URLSearchParams();
  if (args.thumbnailUrl?.trim()) {
    params.set("thumbnailUrl", args.thumbnailUrl.trim());
  }
  const qs = params.toString();
  const url = `https://video.bunnycdn.com/library/${cfg.libraryId}/videos/${args.videoId}/thumbnail${
    qs ? `?${qs}` : ""
  }`;
  const headers: Record<string, string> = {
    AccessKey: cfg.accessKey,
    Accept: "application/json",
  };
  let body: BodyInit | undefined;
  if (args.bytes) {
    headers["Content-Type"] = "application/octet-stream";
    body = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes);
  }
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bunny Stream set thumbnail failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

export async function mintStreamPlayback(args: {
  videoId: string;
  ttlSec?: number;
}): Promise<{
  libraryId: string;
  videoId: string;
  embedUrl: string;
  expiresUnix: number;
  tokenAuth: boolean;
}> {
  const cfg = getBunnyStreamConfig();
  const ttl = Math.min(Math.max(args.ttlSec ?? 3600, 60), 60 * 60 * 6);
  const expiresUnix = Math.floor(Date.now() / 1000) + ttl;
  let token: string | undefined;
  if (cfg.tokenAuthKey) {
    token = await signStreamEmbedToken({
      tokenAuthKey: cfg.tokenAuthKey,
      videoId: args.videoId,
      expirationUnix: expiresUnix,
    });
  }
  return {
    libraryId: cfg.libraryId,
    videoId: args.videoId,
    embedUrl: buildStreamEmbedUrl({
      libraryId: cfg.libraryId,
      videoId: args.videoId,
      token,
      expiresUnix: token ? expiresUnix : undefined,
    }),
    expiresUnix,
    tokenAuth: Boolean(token),
  };
}
