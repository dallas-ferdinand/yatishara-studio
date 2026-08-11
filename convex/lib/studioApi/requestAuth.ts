/**
 * Shared Studio HTTP auth: API keys (`ysk_live_…`) or Agent capability
 * sessions (`ysa_cap_…`). Capability tokens are short-lived, hashed, and
 * bound to owner/thread/run/scopes/role.
 */
import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { hashApiKeyCandidates } from "./crypto";
import { errorResponse, parseBearerToken } from "./httpHelpers";

export const AGENT_CAPABILITY_PREFIX = "ysa_cap_";

export type StudioHttpAuth = {
  userId: Id<"users">;
  apiKeyId: Id<"apiKeys">;
  capabilitySessionId?: Id<"agentCapabilitySessions">;
  scopes: Set<string>;
  role: "user" | "admin" | "super_admin";
  authKind: "api_key" | "agent_capability";
  threadId?: Id<"agentThreads">;
  runId?: Id<"agentRuns">;
};

type HttpCtx = Parameters<Parameters<typeof httpAction>[0]>[0];

export function isAgentCapabilityToken(token: string): boolean {
  return token.startsWith(AGENT_CAPABILITY_PREFIX);
}

export async function authenticateStudioRequest(
  ctx: HttpCtx,
  request: Request,
  requiredScope?: string,
): Promise<StudioHttpAuth | Response> {
  const token = parseBearerToken(request);
  if (!token) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }

  // Modern + legacy hash (padStart "0" vs broken "hex") so mint/auth agree.
  const keyHashes = await hashApiKeyCandidates(token);

  if (isAgentCapabilityToken(token)) {
    let cap: {
      sessionId: Id<"agentCapabilitySessions">;
      ownerId: Id<"users">;
      threadId: Id<"agentThreads">;
      runId?: Id<"agentRuns">;
      scopes: string[];
      role: "user" | "admin" | "super_admin";
      expiresAt: number;
    } | null = null;
    let keyHash = keyHashes[0]!;
    for (const candidate of keyHashes) {
      cap = await ctx.runQuery(internal.agentCapabilities.authenticate, {
        tokenHash: candidate,
      });
      if (cap) {
        keyHash = candidate;
        break;
      }
    }
    if (!cap) {
      return errorResponse("Invalid or expired agent capability", 401);
    }
    const scopes = new Set<string>(cap.scopes);
    if (requiredScope && !scopes.has(requiredScope)) {
      return errorResponse(`Missing required scope: ${requiredScope}`, 403);
    }
    const apiKeyId = await ctx.runMutation(
      internal.agentCapabilities.ensureAttributionApiKey,
      {
        ownerId: cap.ownerId,
        tokenHash: keyHash,
        scopes: cap.scopes,
      },
    );
    await ctx.runMutation(internal.agentCapabilities.touch, {
      sessionId: cap.sessionId,
    });
    return {
      userId: cap.ownerId,
      apiKeyId,
      capabilitySessionId: cap.sessionId,
      scopes,
      role: cap.role,
      authKind: "agent_capability",
      threadId: cap.threadId,
      runId: cap.runId,
    };
  }

  let auth: {
    userId: Id<"users">;
    apiKeyId: Id<"apiKeys">;
    scopes: string[];
  } | null = null;
  for (const keyHash of keyHashes) {
    auth = await ctx.runQuery(internal.studioApiInternal.authenticateApiKey, {
      keyHash,
    });
    if (auth) break;
  }
  if (!auth) {
    return errorResponse("Invalid or revoked API key", 401);
  }
  const scopes = new Set<string>(auth.scopes);
  if (requiredScope && !scopes.has(requiredScope)) {
    return errorResponse(`Missing required scope: ${requiredScope}`, 403);
  }
  await ctx.runMutation(internal.studioApiInternal.touchApiKeyLastUsed, {
    apiKeyId: auth.apiKeyId,
  });
  const user = await ctx.runQuery(internal.agentCapabilities.getUserRole, {
    userId: auth.userId,
  });
  return {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes,
    role: user?.role ?? "user",
    authKind: "api_key",
  };
}

export async function resolveSandboxFolder(
  ctx: HttpCtx,
  auth: StudioHttpAuth,
): Promise<Id<"folders">> {
  if (auth.authKind === "api_key") {
    return await ctx.runMutation(internal.studioApiInternal.resolveSandboxForApiKey, {
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
    });
  }
  return await ctx.runMutation(internal.agentCapabilities.resolveOwnerRootFolder, {
    ownerId: auth.userId,
  });
}
