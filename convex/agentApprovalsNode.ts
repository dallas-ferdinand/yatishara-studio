"use node";

/**
 * Exactly-once approval execution against Studio /api/v1.
 */
import { createHash, randomBytes } from "crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeTool, buildStudioRequest } from "./lib/agentTools";

function studioApiBase(): string {
  return (
    process.env.STUDIO_API_URL?.trim() ||
    process.env.CONVEX_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const execute = internalAction({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.agentApprovals.claimForExecute, {
      approvalId: args.approvalId,
    });
    if (!claimed) return null;

    try {
      const toolName = claimed.toolName || claimed.action;
      const payload = JSON.parse(claimed.payloadJson || "{}") as Record<
        string,
        unknown
      >;

      // Revalidate ownership / tool / args before execution
      const auth = authorizeTool(toolName, {
        surface: "agent",
        role: claimed.role,
        scopes: ["read", "write", "generate", "messages", "social", "marketplace"],
      });
      if (!auth.ok) throw new Error(auth.error || "Tool no longer allowed");
      buildStudioRequest(toolName, payload);

      const apiBase = studioApiBase();
      if (!apiBase) throw new Error("STUDIO_API_URL / CONVEX_SITE_URL missing");

      const capabilityToken = `ysa_cap_${randomBytes(24).toString("hex")}`;
      const tokenHash = hashToken(capabilityToken);
      await ctx.runMutation(internal.agentCapabilities.mint, {
        ownerId: claimed.ownerId,
        threadId: claimed.threadId,
        runId: claimed.runId,
        tokenHash,
        scopes: [
          "read",
          "write",
          "generate",
          "messages",
          "social",
          "marketplace",
        ],
        role: claimed.role,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const req = buildStudioRequest(toolName, payload);
      if (req.local) {
        throw new Error(
          `Tool ${toolName} is local-only and cannot be executed via approval yet`,
        );
      }

      const url = `${apiBase}/api/v1${req.path}`;
      const res = await fetch(url, {
        method: req.method!,
        headers: {
          authorization: `Bearer ${capabilityToken}`,
          "content-type": "application/json",
        },
        body: req.method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
      });
      const text = await res.text();
      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 4000) };
      }
      if (!res.ok) {
        const err =
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : `HTTP ${res.status}`;
        throw new Error(err);
      }

      await ctx.runMutation(internal.agentApprovals.markCompleted, {
        approvalId: args.approvalId,
        resultJson: JSON.stringify({ ok: true, data }),
      });
    } catch (error) {
      await ctx.runMutation(internal.agentApprovals.markFailed, {
        approvalId: args.approvalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  },
});


