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
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStudioPiTools } from "./piTools.mjs";

const PORT = Number(process.env.STUDIO_AGENT_PORT || process.env.PORT || 8796);
const TOKEN = String(process.env.STUDIO_AGENT_WORKER_TOKEN || "").trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(__dirname, ".pi-harness");
const PLATFORM_PROVIDER = String(
  process.env.STUDIO_AGENT_PROVIDER || "byteplus-ark",
).trim();
const PLATFORM_MODEL = String(
  process.env.STUDIO_AGENT_MODEL_ID || "seed-2-0-pro-260328",
).trim();

if (!process.env.ARK_API_KEY?.trim()) {
  console.warn(
    "[studio-agent] ARK_API_KEY missing — platform Seed Pro turns will fail closed",
  );
}

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

    const tools = createStudioPiTools({
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
      onBeforeInvoke: async ({ toolName, args }) =>
        callback(callbackBase, workerCallbackToken, "tool-start", {
          ownerId: userId,
          threadId,
          runId,
          toolName,
          args,
        }),
      onAfterInvoke: async ({ toolCallId, toolName, ok, result, error }) => {
        if (!toolCallId) return;
        await callback(callbackBase, workerCallbackToken, "tool-result", {
          toolCallId,
          ownerId: userId,
          threadId,
          toolName,
          ok,
          result,
          error,
        });
      },
      onApprovalRequired: async ({ toolName, args, tool }) => {
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

    const { session } = await createAgentSession({
      cwd: AGENT_DIR,
      agentDir: AGENT_DIR,
      sessionManager: SessionManager.inMemory(),
      customTools: tools,
      // Studio tools only — no local bash/read/write on the VPS.
      noTools: "builtin",
    });

    if (!session.model) {
      throw new Error(
        `No platform model loaded (${PLATFORM_PROVIDER}/${PLATFORM_MODEL}). Check ARK_API_KEY + .pi-harness/models.json.`,
      );
    }

    const memoryBlock =
      Array.isArray(memories) && memories.length
        ? `Owner memories (do not mix users):\n${memories
            .map((m) => `- [${m.kind}] ${m.title}: ${String(m.body).slice(0, 240)}`)
            .join("\n")}`
        : "";

    const system = [
      "You are Yatishara Studio Agent — full access to Studio for this signed-in user.",
      "Pi tools (only these): catalog, describe, invoke, remember.",
      "Studio actions go through invoke: { name: \"studio_create_folder\", args: { name: \"...\" } }.",
      "Never call studio_* as a top-level tool — that yields Unknown tool.",
      "Paid/destructive/outbound/admin tools create approval cards — never claim they already ran.",
      "Admin tools only if this user is admin. Never access other users' data.",
      "Use remember for durable preferences/decisions.",
      "Never say Done unless a tool actually succeeded. If a tool fails, report the error.",
      byokFallbackNote || "",
      memoryBlock,
    ]
      .filter(Boolean)
      .join("\n");

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

    const lastAssistant = [...(session.messages || [])]
      .reverse()
      .find((m) => m?.role === "assistant");
    if (lastAssistant?.stopReason === "error") {
      const err =
        lastAssistant.errorMessage ||
        "Platform model error (no assistant reply)";
      throw new Error(err);
    }

    const stats =
      typeof session.getSessionStats === "function"
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
        : null) || "";
    if (!String(assistantText).trim()) {
      throw new Error(
        "Model returned no text (refusing fake Done). Check provider balance / ARK_API_KEY.",
      );
    }
    try {
      session.dispose?.();
    } catch {
      // ignore dispose errors
    }
    return {
      assistantText: String(assistantText),
      usage: { inputTokens, outputTokens },
      model: `${session.model?.provider || PLATFORM_PROVIDER}/${session.model?.id || PLATFORM_MODEL}`,
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
