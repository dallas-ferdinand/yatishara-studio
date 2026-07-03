const KEY_PREFIX = "ysk_live_";
const KEY_RANDOM_BYTES = 24;

export function apiKeyPrefix(): string {
  return KEY_PREFIX;
}

export function generateApiKeySecret(): string {
  const bytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "hex")).join("");
  return `${KEY_PREFIX}${randomPart}`;
}

export function displayKeyPrefix(fullKey: string): string {
  return fullKey.slice(0, KEY_PREFIX.length + 4);
}

export async function hashApiKey(fullKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fullKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "hex")).join("");
}

export const VALID_SCOPES = ["read", "write", "generate"] as const;
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
