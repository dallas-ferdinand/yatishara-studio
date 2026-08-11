#!/usr/bin/env node
/**
 * Studio Agent Pi worker (optional).
 *
 * Convex agentActions.sendTurn posts here when STUDIO_AGENT_URL is set.
 * Tools are Studio MCP HTTP only — no computer-use. Assist/Elements/style
 * tools are blocked (see AGENT_BLOCKED_TOOL_NAMES).
 *
 * Env:
 *   STUDIO_AGENT_PORT / PORT
 *   STUDIO_AGENT_WORKER_TOKEN
 *   STUDIO_MCP_HTTP_URL
 *   STUDIO_API_TOKEN
 *   STUDIO_MCP_AGENT_SURFACE=1  (recommended for MCP child processes)
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.STUDIO_AGENT_PORT || process.env.PORT || 8796);
const TOKEN = String(process.env.STUDIO_AGENT_WORKER_TOKEN || "").trim();
const MCP_URL = String(process.env.STUDIO_MCP_HTTP_URL || "").trim();
const API_TOKEN = String(process.env.STUDIO_API_TOKEN || "").trim();

export const AGENT_BLOCKED_TOOL_NAMES = new Set([
  "studio_generate_element_sheet",
  "studio_create_style_sheet",
  "studio_build_style_sheet",
  "studio_set_active_style_sheet",
  "studio_ensure_brief",
  "studio_edit_brief",
  "studio_approve_brief",
  "studio_reject_brief",
  "studio_generate_script",
]);

/** Per-user Pi session cache (userId+threadId → last activity). */
const sessions = new Map();

async function callStudioMcp(toolName, args, userToken) {
  if (AGENT_BLOCKED_TOOL_NAMES.has(toolName)) {
    return { ok: false, error: `Tool ${toolName} is retired from Agent Mode` };
  }
  if (!MCP_URL) {
    return { ok: false, error: "STUDIO_MCP_HTTP_URL not configured" };
  }
  const res = await fetch(`${MCP_URL.replace(/\/$/, "")}/tools/${toolName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(userToken || API_TOKEN
        ? { authorization: `Bearer ${userToken || API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: res.ok, raw: text.slice(0, 2000) };
  }
}

function authOk(req) {
  if (!TOKEN) return true;
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

function sessionKey(userId, threadId) {
  return `${userId}:${threadId}`;
}

async function runPiTurn({ message, history, userId, threadId, userToken }) {
  const key = sessionKey(userId || "anon", threadId || "default");
  sessions.set(key, { updatedAt: Date.now() });

  try {
    const mod = await import("@earendil-works/pi-coding-agent");
    const { createAgentSession, SessionManager } = mod;
    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      customTools: [
        {
          name: "studio_mcp",
          description:
            "Call an allowed Studio MCP tool by name with a JSON args object. Blocked: element sheets, style sheets, Assist briefs/script generate.",
          parameters: {
            type: "object",
            properties: {
              toolName: { type: "string" },
              args: { type: "object" },
            },
            required: ["toolName"],
          },
          execute: async ({ toolName, args }) =>
            callStudioMcp(String(toolName), args ?? {}, userToken),
        },
      ],
    });

    const prior = Array.isArray(history)
      ? history
          .slice(-12)
          .map((row) => `${row.role}: ${row.content}`)
          .join("\n")
      : "";
    const prompt = prior
      ? `Prior turns:\n${prior}\n\nUser:\n${message}`
      : message;
    const result = await session.prompt(prompt);
    return typeof result === "string"
      ? result
      : String(result?.text ?? result?.message ?? "Done.");
  } catch (error) {
    // Fallback: if `pi` binary exists, one-shot prompt (no tools).
    const piBin = process.env.PI_BIN || "pi";
    try {
      const text = await new Promise((resolve, reject) => {
        const child = spawn(piBin, ["-p", message], {
          env: { ...process.env, STUDIO_MCP_AGENT_SURFACE: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => {
          out += d;
        });
        child.stderr.on("data", (d) => {
          err += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(out.trim() || "Done.");
          else reject(new Error(err.trim() || `pi exited ${code}`));
        });
      });
      return text;
    } catch {
      return `Pi worker note: ${error instanceof Error ? error.message : String(error)}. Convex in-process Agent remains available when STUDIO_AGENT_URL is unset.`;
    }
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
          blockedTools: [...AGENT_BLOCKED_TOOL_NAMES],
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
      const body = await readJson(req);
      const message = String(body.message || "").trim();
      if (!message) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "message required" }));
        return;
      }
      const assistantText = await runPiTurn({
        message,
        history: body.history,
        userId: body.userId,
        threadId: body.threadId,
        userToken: body.userToken,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          assistantText,
          creditsSpent: 0,
          usedByok: Boolean(body.usedByok),
        }),
      );
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[studio-agent] Pi worker on http://127.0.0.1:${PORT}`);
});
