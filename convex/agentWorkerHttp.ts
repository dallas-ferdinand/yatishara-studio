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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Compact episode line for Prior — keep ids/titles, not raw checkmarks. */
function formatEpisodeToolContent(
  toolName: string,
  ok: boolean,
  result: unknown,
  error?: string,
): string {
  if (!ok) {
    return `✗ ${toolName}: ${String(error || "failed").slice(0, 180)}`;
  }
  const root = asRecord(result) ?? {};
  const data = asRecord(root.data) ?? root;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = data[key] ?? root[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return "";
  };
  const title = pick("title", "name", "label");
  const documentId = pick("documentId", "document_id");
  const assetId = pick("assetId", "asset_id");
  const elementId = pick("elementId", "element_id");
  const folderId = pick("folderId", "folder_id");
  const jobId = pick("id", "jobId", "_id");
  const stillRendering = Boolean(data.stillRendering);
  const parts: string[] = [`✓ ${toolName}`];
  if (title) parts.push(`"${title.slice(0, 80)}"`);
  if (documentId) parts.push(`documentId=${documentId}`);
  if (assetId) parts.push(`assetId=${assetId}`);
  if (elementId) parts.push(`elementId=${elementId}`);
  if (folderId) parts.push(`folderId=${folderId}`);
  if (
    /generate_(image|video|audio)/.test(toolName) &&
    jobId &&
    (stillRendering || !assetId)
  ) {
    parts.push(`jobId=${jobId}${stillRendering ? " (rendering)" : ""}`);
  }
  return parts.join(" ").slice(0, 480);
}

function scratchPatchFromToolResult(
  toolName: string,
  result: unknown,
): Record<string, unknown> | null {
  const root = asRecord(result) ?? {};
  const data = asRecord(root.data) ?? root;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = data[key] ?? root[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const patch: Record<string, unknown> = {};
  const documentId = pick("documentId");
  const assetId = pick("assetId");
  const elementId = pick("elementId");
  const folderId = pick("folderId");
  const jobId = pick("id", "jobId");
  if (documentId) patch.documentId = documentId;
  if (assetId) patch.assetId = assetId;
  if (elementId) patch.elementId = elementId;
  if (folderId) patch.cwdFolderId = folderId;
  if (/generate_(image|video|audio)/.test(toolName) && jobId) {
    patch.jobId = jobId;
  }
  return Object.keys(patch).length ? patch : null;
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
      const toolName = String(body.toolName || "");
      await ctx.runMutation(internal.agentRuns.appendToolMessage, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        toolName,
        content: formatEpisodeToolContent(
          toolName,
          Boolean(body.ok),
          body.result,
          body.error,
        ),
        toolCallId: String(body.toolCallId),
        status: body.ok ? "complete" : "error",
      });
      if (body.ok) {
        const patch = scratchPatchFromToolResult(toolName, body.result);
        if (patch) {
          await ctx.runMutation(internal.agentThreads.patchWorkingScratchInternal, {
            threadId: body.threadId as Id<"agentThreads">,
            patchJson: JSON.stringify(patch),
          });
        }
      }
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/approval")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId: string;
        runId?: string;
        toolCallId?: string;
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
      if (body.toolCallId) {
        await ctx.runMutation(internal.agentRuns.recordToolPendingApproval, {
          toolCallId: body.toolCallId as Id<"agentToolCalls">,
          approvalId,
        });
      }
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

    if (request.method === "POST" && path.endsWith("/agent-worker/memory-update")) {
      const body = await readJsonBody<{
        ownerId: string;
        memoryId: string;
        title?: string;
        body?: string;
        pinned?: boolean;
      }>(request);
      await ctx.runMutation(internal.agentMemory.updateMemoryInternal, {
        ownerId: body.ownerId as Id<"users">,
        memoryId: body.memoryId as Id<"agentMemories">,
        title: body.title,
        body: body.body,
        pinned: body.pinned,
      });
      return jsonResponse({ ok: true, memoryId: body.memoryId });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/memory-archive")) {
      const body = await readJsonBody<{
        ownerId: string;
        memoryId: string;
      }>(request);
      await ctx.runMutation(internal.agentMemory.archiveMemoryInternal, {
        ownerId: body.ownerId as Id<"users">,
        memoryId: body.memoryId as Id<"agentMemories">,
      });
      return jsonResponse({ ok: true, memoryId: body.memoryId });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/assistant-progress")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId: string;
        runId?: string;
        content: string;
      }>(request);
      const content = String(body.content || "").trim().slice(0, 4000);
      if (!content) {
        return jsonResponse({ ok: true, skipped: true });
      }
      const recent = await ctx.runQuery(internal.agentMessages.listRecentMessagesInternal, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        limit: 8,
      });
      const last = [...recent].reverse().find((row) => row.role === "assistant");
      if (
        last &&
        last.toolName === "progress" &&
        String(last.content || "").trim() === content
      ) {
        return jsonResponse({ ok: true, skipped: true, duplicate: true });
      }
      const messageId = await ctx.runMutation(internal.agentMessages.appendMessageInternal, {
        ownerId: body.ownerId as Id<"users">,
        threadId: body.threadId as Id<"agentThreads">,
        role: "assistant",
        content,
        toolName: "progress",
        status: "complete",
      });
      return jsonResponse({ ok: true, messageId });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/plan-sync")) {
      const body = await readJsonBody<{
        runId?: string;
        threadId?: string;
        planJson?: string;
        todosJson?: string;
      }>(request);
      const boardJson = String(body.todosJson || body.planJson || "{}");
      if (body.runId) {
        await ctx.runMutation(internal.agentRuns.setPlanJson, {
          runId: body.runId as Id<"agentRuns">,
          planJson: boardJson,
        });
      }
      if (body.threadId) {
        await ctx.runMutation(internal.agentThreads.setTodosInternal, {
          threadId: body.threadId as Id<"agentThreads">,
          todosJson: boardJson,
        });
      }
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/agent-worker/ask")) {
      const body = await readJsonBody<{
        ownerId: string;
        threadId: string;
        runId?: string;
        toolCallId?: string;
        intro?: string;
        questions?: unknown;
      }>(request);
      const questionId = await ctx.runMutation(
        internal.agentQuestions.createPendingInternal,
        {
          ownerId: body.ownerId as Id<"users">,
          threadId: body.threadId as Id<"agentThreads">,
          runId: body.runId
            ? (body.runId as Id<"agentRuns">)
            : undefined,
          intro: body.intro,
          questionsJson: JSON.stringify(body.questions ?? []),
        },
      );
      return jsonResponse({
        ok: true,
        pendingAsk: true,
        questionId,
        status: "pending",
      });
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
