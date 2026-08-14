"use node";

/**
 * Exactly-once approval execution against Studio /api/v1.
 * Generations queue with wait:false then poll so Pi chat turns are not held open.
 */
import { randomBytes } from "crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeTool, buildStudioRequest } from "./lib/agentTools";
import { hashApiKey } from "./lib/studioApi/crypto";

function studioApiBase(): string {
  return (
    process.env.STUDIO_API_URL?.trim() ||
    process.env.CONVEX_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

const GENERATION_MODE_BY_TOOL: Record<string, string> = {
  studio_generate_image: "image",
  studio_generate_video: "video",
  studio_generate_audio: "audio",
};

function normalizeGenerationPayload(
  toolName: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  const mode = GENERATION_MODE_BY_TOOL[toolName];
  if (mode) {
    next.mode = mode;
    next.wait = false;
  }
  if (toolName === "studio_generate_batch") {
    next.wait = false;
  }
  return next;
}

function generationJobId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  const id = row.id || row.jobId || row._id;
  return typeof id === "string" && id.trim() ? id.trim() : "";
}

async function pollGenerationJob(
  apiBase: string,
  bearerToken: string,
  jobId: string,
  timeoutMs = 540_000,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const started = Date.now();
  let last: Record<string, unknown> | null = null;
  while (Date.now() - started < timeoutMs) {
    const url = `${apiBase}/api/v1/generations/${encodeURIComponent(jobId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${bearerToken}` },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
        data,
      };
    }
    last = data;
    const status = String(data.status || "").toLowerCase();
    if (status === "done") return { ok: true, data };
    if (status === "failed") {
      return {
        ok: false,
        error:
          typeof data.error === "string" && data.error
            ? data.error
            : "Generation failed",
        data,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return {
    ok: true,
    data: {
      ...(last || { id: jobId }),
      id: generationJobId(last) || jobId,
      status: String(last?.status || "queued"),
      stillRendering: true,
      message:
        "Generation still rendering in Files — approval finished without blocking forever.",
    },
  };
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
      const rawPayload = JSON.parse(claimed.payloadJson || "{}") as Record<
        string,
        unknown
      >;
      const payload = normalizeGenerationPayload(toolName, rawPayload);

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
      const tokenHash = await hashApiKey(capabilityToken);
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

      let finalData = data;
      const jobId = generationJobId(data);
      const status = String(
        data && typeof data === "object"
          ? (data as { status?: string }).status || ""
          : "",
      ).toLowerCase();
      if (
        jobId &&
        /^studio_generate_(image|video|audio)$/.test(toolName) &&
        (res.status === 202 ||
          status === "queued" ||
          status === "running" ||
          status === "pending")
      ) {
        const polled = await pollGenerationJob(
          apiBase,
          capabilityToken,
          jobId,
          540_000,
        );
        if (!polled.ok) {
          throw new Error(polled.error || "Generation failed");
        }
        finalData = polled.data;
      }

      await ctx.runMutation(internal.agentApprovals.markCompleted, {
        approvalId: args.approvalId,
        resultJson: JSON.stringify({ ok: true, data: finalData }),
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
