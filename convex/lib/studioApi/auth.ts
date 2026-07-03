export { hashApiKey, generateApiKeySecret, displayKeyPrefix, normalizeScopes, VALID_SCOPES } from "./crypto";
export { requireScope, hasScope, type ApiAuthContext } from "./scopes";

export function parseAuthorizationHeader(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
