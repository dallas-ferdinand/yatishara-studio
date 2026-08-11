const KEY_PREFIX = "ysk_live_";
const KEY_RANDOM_BYTES = 24;

export function apiKeyPrefix(): string {
  return KEY_PREFIX;
}

function bytesToHex(bytes: Uint8Array, padChar = "0"): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, padChar),
  ).join("");
}

export function generateApiKeySecret(): string {
  const bytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  return `${KEY_PREFIX}${bytesToHex(bytes, "0")}`;
}

export function displayKeyPrefix(fullKey: string): string {
  return fullKey.slice(0, KEY_PREFIX.length + 4);
}

/** Canonical SHA-256 hex (pad with 0). */
export async function hashApiKey(fullKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullKey),
  );
  return bytesToHex(new Uint8Array(digest), "0");
}

/**
 * Legacy broken encoding: padStart(2, "hex") inserted h/e/x instead of 0.
 * Existing apiKeys.keyHash rows may use this — keep for dual-read auth.
 */
export async function hashApiKeyLegacy(fullKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullKey),
  );
  return bytesToHex(new Uint8Array(digest), "hex");
}

/** Prefer modern hash first; include legacy when different. */
export async function hashApiKeyCandidates(fullKey: string): Promise<string[]> {
  const modern = await hashApiKey(fullKey);
  const legacy = await hashApiKeyLegacy(fullKey);
  return modern === legacy ? [modern] : [modern, legacy];
}

export const VALID_SCOPES = ["read", "write", "generate", "messages", "social", "marketplace"] as const;
export type ApiKeyScope = (typeof VALID_SCOPES)[number];

export function normalizeScopes(scopes: string[]): ApiKeyScope[] {
  const normalized = scopes.filter((scope): scope is ApiKeyScope =>
    VALID_SCOPES.includes(scope as ApiKeyScope),
  );
  if (!normalized.includes("read")) {
    normalized.unshift("read");
  }
  if (normalized.includes("generate") && !normalized.includes("write")) {
    normalized.push("write");
  }
  return [...new Set(normalized)];
}
