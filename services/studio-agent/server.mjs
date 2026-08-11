#!/usr/bin/env node
/**
 * Studio Agent Pi worker (canonical).
 *
 * Convex agentActions.sendTurn posts here when STUDIO_AGENT_URL is set.
 * Tools: dynamic catalog/describe/invoke → Studio /api/v1 with per-user
 * capability token. No MCP bridge. No global STUDIO_API_TOKEN identity.
 *
 * Env:
 *   STUDIO_AGENT_PORT / PORT
 *   STUDIO_AGENT_WORKER_TOKEN (required — fail closed)
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPiStudioTools } from "../../packages/studio-tools/src/piAdapter.js";
import { authorizeTool } from "../../packages/studio-tools/src/policy.js";
import { invokeStudioTool } from "../../packages/studio-tools/src/http.js";

const PORT = Number(process.env.STUDIO_AGENT_PORT || process.env.PORT || 8796);
const TOKEN = String(process.env.STUDIO_AGENT_WORKER_TOKEN || "").trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, { updatedAt: number, abort?: AbortController }>} */
const sessions = new Map();

function sessionKey(userId, threadId) {
  return `${userId}:${threadId}`;
}

function authOk(req) {
  if (!TOKEN) return false;
  const header = String(req.headers.authorization || "");
  return header === `Bearer ${TOKEN}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function callback(callbackBase, workerCallbackToken, route, body, method = "POST") {
  if (!callbackBase || !workerCallbackToken) return null;
  const url =
    method === "GET"
      ? `${callbackBase.replace(/\/$/, "")}/api/agent-worker/${route}?${new URLSearchParams(body).toString()}`
      : `${callbackBase.replace(/\/$/, "")}/api/agent-worker/${route}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${workerCallbackToken}`,
      "content-type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: res.ok, raw: text.slice(0, 2000) };
  }
}

async function runPiTurn(body, abortSignal) {
  const {
    message,
    history,
    memories,
    userId,
    threadId,
    runId,
    role = "user",
    scopes,
    capabilityToken,
    studioApiBase,
    callbackBase,
    workerCallbackToken,
    byokFallbackNote,
  } = body;

  if (!capabilityToken) {
    throw new Error("capabilityToken required — no global STUDIO_API_TOKEN fallback");
  }
  if (!studioApiBase) {
    throw new Error("studioApiBase required");
  }

  const key = sessionKey(userId || "anon", threadId || "default");
  sessions.set(key, { updatedAt: Date.now() });

  // Cancellation poll
  const cancelPoll = setInterval(async () => {
    try {
      const status = await callback(
        callbackBase,
        workerCallbackToken,
        "run-status",
        { runId },
        "GET",
      );
      if (status?.run?.status === "cancelled" || status?.run?.cancelRequestedAt) {
        abortSignal?.abort?.();
      }
    } catch {
      // ignore poll errors
    }
  }, 2500);

  try {
    const mod = await import("@earendil-works/pi-coding-agent");
    const { createAgentSession, SessionManager } = mod;

    const studioTools = createPiStudioTools({
      apiBase: studioApiBase,
      role,
      scopes:
        scopes || [
          "read",
          "write",
          "generate",
          "messages",
          "social",
          "marketplace",
        ],
      getBearerToken: async () => capabilityToken,
      onApprovalRequired: async ({ toolName, args, tool }) => {
        const start = await callback(callbackBase, workerCallbackToken, "tool-start", {
          ownerId: userId,
          threadId,
          runId,
          toolName,
          args,
        });
        const idempotencyKey = createHash("sha256")
          .update(
            `${runId || ""}:${toolName}:${JSON.stringify(args || {})}`,
            "utf8",
          )
          .digest("hex")
          .slice(0, 40);
        const approval = await callback(
          callbackBase,
          workerCallbackToken,
          "approval",
          {
            ownerId: userId,
            threadId,
            runId,
            toolName,
            title: tool?.name || toolName,
            summary: `Approve ${toolName} (${tool?.risk || "risk"})`,
            args,
            idempotencyKey,
            role,
          },
        );
        if (start?.toolCallId) {
          await callback(callbackBase, workerCallbackToken, "tool-result", {
            toolCallId: start.toolCallId,
            ownerId: userId,
            threadId,
            toolName,
            ok: true,
            result: approval,
          });
        }
        return {
          ok: true,
          pendingApproval: true,
          approvalId: approval?.approvalId,
          message:
            "Approval card created in Studio. Wait for the user to approve before claiming success.",
        };
      },
      localHandlers: {
        studio_list_text_presets: async () => ({
          ok: true,
          note: "Use Studio Edit UI text presets; list endpoint is local in MCP.",
        }),
        studio_validate_production_gates: async () => ({
          ok: true,
          canProceed: true,
          warnings: ["Gate file optional for Agent Mode"],
        }),
        studio_agent_remember: async (args) =>
          callback(callbackBase, workerCallbackToken, "remember", {
            ownerId: userId,
            threadId,
            title: String(args.title || "Memory"),
            body: String(args.body || ""),
            kind: args.kind,
            projectFolderId: args.projectFolderId,
          }),
      },
    });

    // Wrap invoke to emit tool events for direct (non-approval) calls
    const tools = studioTools.map((tool) => {
      if (tool.name !== "invoke") return tool;
      return {
        ...tool,
        execute: async (input) => {
          const toolName = String(input?.name || "");
          const args = input?.args && typeof input.args === "object" ? input.args : {};
          const auth = authorizeTool(toolName, {
            surface: "agent",
            role,
            scopes:
              scopes || [
                "read",
                "write",
                "generate",
                "messages",
                "social",
                "marketplace",
              ],
          });
          const start = await callback(
            callbackBase,
            workerCallbackToken,
            "tool-start",
            {
              ownerId: userId,
              threadId,
              runId,
              toolName,
              args,
            },
          );
          try {
            if (auth.ok && auth.requiresApproval) {
              return tool.execute(input);
            }
            const result = await tool.execute(input);
            if (start?.toolCallId) {
              await callback(callbackBase, workerCallbackToken, "tool-result", {
                toolCallId: start.toolCallId,
                ownerId: userId,
                threadId,
                toolName,
                ok: Boolean(result?.ok !== false),
                result,
                error: result?.error,
              });
            }
            return result;
          } catch (error) {
            if (start?.toolCallId) {
              await callback(callbackBase, workerCallbackToken, "tool-result", {
                toolCallId: start.toolCallId,
                ownerId: userId,
                threadId,
                toolName,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            throw error;
          }
        },
      };
    });

    tools.push({
      name: "remember",
      description:
        "Store an owner-scoped durable memory for future Agent turns (never cross-user).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          kind: {
            type: "string",
            enum: ["note", "preference", "decision", "summary"],
          },
          projectFolderId: { type: "string" },
        },
        required: ["title", "body"],
      },
      execute: async (args) =>
        callback(callbackBase, workerCallbackToken, "remember", {
          ownerId: userId,
          threadId,
          title: String(args.title || "Memory"),
          body: String(args.body || ""),
          kind: args.kind,
          projectFolderId: args.projectFolderId,
        }),
    });

    const memoryBlock =
      Array.isArray(memories) && memories.length
        ? `Owner memories (do not mix users):\n${memories
            .map((m) => `- [${m.kind}] ${m.title}: ${String(m.body).slice(0, 240)}`)
            .join("\n")}`
        : "";

    const system = [
      "You are Yatishara Studio Agent — full access to current non-retired Studio tools for this signed-in user.",
      "Discover tools with catalog, inspect with describe, run with invoke.",
      "Paid/destructive/outbound/admin tools create approval cards — never claim they already ran.",
      "Admin tools only if this user is admin. Never access other users' data.",
      "Use remember for durable preferences/decisions.",
      byokFallbackNote || "",
      memoryBlock,
    ]
      .filter(Boolean)
      .join("\n");

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      customTools: tools,
      // Some pi versions accept systemPrompt; ignore if unsupported.
      systemPrompt: system,
    });

    const prior = Array.isArray(history)
      ? history
          .slice(-16)
          .map((row) => `${row.role}: ${row.content}`)
          .join("\n")
      : "";
    const prompt = [
      system,
      prior ? `Prior turns:\n${prior}` : "",
      `User:\n${message}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (abortSignal?.aborted) {
      throw new Error("cancelled");
    }

    // prompt() resolves void — text + usage come from session after idle.
    await session.prompt(prompt);
    const stats = typeof session.getSessionStats === "function"
      ? session.getSessionStats()
      : null;
    const tokens = stats?.tokens || {};
    const inputTokens = Math.max(
      0,
      Math.floor(
        Number(tokens.input || 0) +
          Number(tokens.cacheRead || 0) +
          Number(tokens.cacheWrite || 0),
      ),
    );
    const outputTokens = Math.max(0, Math.floor(Number(tokens.output || 0)));
    const assistantText =
      (typeof session.getLastAssistantText === "function"
        ? session.getLastAssistantText()
        : null) || "Done.";
    try {
      session.dispose?.();
    } catch {
      // ignore dispose errors
    }
    return {
      assistantText: String(assistantText),
      usage: { inputTokens, outputTokens },
    };
  } finally {
    clearInterval(cancelPoll);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          harness: "pi",
          sessions: sessions.size,
          authRequired: true,
          catalog: "studio-tools",
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/v1/turn") {
      if (!authOk(req)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (!TOKEN) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "STUDIO_AGENT_WORKER_TOKEN required (fail-closed)",
          }),
        );
        return;
      }
      const body = await readJson(req);
      const message = String(body.message || "").trim();
      if (!message) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "message required" }));
        return;
      }
      const abort = new AbortController();
      const key = sessionKey(body.userId || "anon", body.threadId || "default");
      sessions.set(key, { updatedAt: Date.now(), abort });
      try {
        const turn = await runPiTurn(body, abort.signal);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            assistantText: turn.assistantText,
            usage: turn.usage,
            // Ledger charge is Convex-owned (measured usage → textCreditCost).
            usedByok: Boolean(body.usedByok),
          }),
        );
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return;
    }
    if (req.method === "POST" && req.url === "/v1/cancel") {
      if (!authOk(req)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const body = await readJson(req);
      const key = sessionKey(body.userId || "anon", body.threadId || "default");
      const session = sessions.get(key);
      session?.abort?.abort();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

const HOST = String(process.env.STUDIO_AGENT_HOST || "0.0.0.0").trim() || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(
    `[studio-agent] Pi worker on http://${HOST}:${PORT} (auth ${TOKEN ? "required" : "MISSING"})`,
  );
});
