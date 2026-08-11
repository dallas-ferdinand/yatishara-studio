/**
 * Authenticated callbacks from the Studio Agent Pi worker into Convex.
 * Bearer: STUDIO_AGENT_WORKER_TOKEN (same as worker auth — not user capability).
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseBearerToken,
  readJsonBody,
} from "./lib/studioApi/httpHelpers";

function workerAuthOk(request: Request): boolean {
  const expected = (process.env.STUDIO_AGENT_WORKER_TOKEN ?? "").trim();
  if (!expected) return false;
  const token = parseBearerToken(request);
  return Boolean(token && token === expected);
}

export const agentWorkerCallback = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!workerAuthOk(request)) {
    return errorResponse("unauthorized", 401);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (request.method === "POST" && path.endsWith("/agent-worker/tool-start")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId: string;
        runId: string;
        toolName: string;
        args?: Record<string, unknown>;
      }>(request);
      const toolCallId = await ctx.runMutation(internal.agentRuns.recordToolStart, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        runId: body.runId as Id<"agentRuns">,
        toolName: String(body.toolName || ""),
        argsJson: JSON.stringify(body.args ?? {}),
      });
      await ctx.runMutation(internal.agentRuns.appendToolMessage, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        toolName: String(body.toolName || ""),
        content: `Calling ${body.toolName}…`,
        toolCallId: String(toolCallId),
        status: "streaming",
      });
      return jsonResponse({ ok: true, toolCallId });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/tool-result")) {
      const body = await readJsonBody<{
        toolCallId: string;
        ownerId: string;
        threadId: string;
        toolName: string;
        ok: boolean;
        result?: unknown;
        error?: string;
      }>(request);
      await ctx.runMutation(internal.agentRuns.recordToolResult, {
        toolCallId: body.toolCallId as Id<"agentToolCalls">,
        ok: Boolean(body.ok),
        resultJson: body.result != null ? JSON.stringify(body.result) : undefined,
        error: body.error,
      });
      await ctx.runMutation(internal.agentRuns.appendToolMessage, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        toolName: String(body.toolName || ""),
        content: body.ok
          ? `✓ ${body.toolName}`
          : `✗ ${body.toolName}: ${body.error || "failed"}`,
        toolCallId: String(body.toolCallId),
        status: body.ok ? "complete" : "error",
      });
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/approval")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId: string;
        runId?: string;
        toolName: string;
        title?: string;
        summary?: string;
        args?: Record<string, unknown>;
        estimatedCredits?: number;
        idempotencyKey: string;
        role?: "user" | "admin" | "super_admin";
      }>(request);
      const approvalId = await ctx.runMutation(
        internal.agentApprovals.createPendingInternal,
        {
          ownerId: body.ownerId as Id<"users">,
          threadId: body.threadId as Id<"agentThreads">,
          runId: body.runId
            ? (body.runId as Id<"agentRuns">)
            : undefined,
          toolName: String(body.toolName),
          title: body.title || String(body.toolName),
          summary:
            body.summary ||
            `Approve ${body.toolName} with provided arguments`,
          payloadJson: JSON.stringify(body.args ?? {}),
          estimatedCredits: body.estimatedCredits,
          idempotencyKey: String(body.idempotencyKey),
          role: body.role ?? "user",
        },
      );
      return jsonResponse({
        ok: true,
        pendingApproval: true,
        approvalId,
        status: "pending",
      });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/remember")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId?: string;
        title: string;
        body: string;
        kind?: "note" | "preference" | "decision" | "summary";
        projectFolderId?: string;
      }>(request);
      const memoryId = await ctx.runMutation(internal.agentMemory.rememberInternal, {
        ownerId: body.ownerId as Id<"users">,
        title: body.title,
        body: body.body,
        kind: body.kind,
        projectFolderId: body.projectFolderId
          ? (body.projectFolderId as Id<"folders">)
          : undefined,
        sourceThreadId: body.threadId
          ? (body.threadId as Id<"agentThreads">)
          : undefined,
      });
      return jsonResponse({ ok: true, memoryId });
    }

    if (request.method === "GET" && path.endsWith("/agent-worker/run-status")) {
      const runId = url.searchParams.get("runId");
      if (!runId) return errorResponse("runId required", 400);
      const run = await ctx.runQuery(internal.agentRuns.getRunInternal, {
        runId: runId as Id<"agentRuns">,
      });
      return jsonResponse({ ok: true, run });
    }

    return errorResponse("not found", 404);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      500,
    );
  }
});

export const agentWorkerCallbackOptions = httpAction(async () => optionsResponse());
