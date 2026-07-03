import type { Doc } from "../../_generated/dataModel";

export type ApiAuthContext = {
  user: Doc<"users">;
  apiKey: Doc<"apiKeys">;
  scopes: Set<string>;
};

export function requireScope(ctx: ApiAuthContext, scope: string): void {
  if (!ctx.scopes.has(scope)) {
    throw new Error(`Missing required scope: ${scope}`);
  }
}

export function hasScope(ctx: ApiAuthContext, scope: string): boolean {
  return ctx.scopes.has(scope);
}
