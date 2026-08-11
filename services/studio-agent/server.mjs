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
import { createStudioPiTools, createTrajectory } from "./piTools.mjs";
import { detectActionLane } from "./agentLanes.mjs";
import { skillPromptBlock } from "./agentSkills.mjs";
import { invokeStudioTool } from "../../packages/studio-tools/src/http.js";

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

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function expandAttachmentTokens(message, workingSet) {
  const items = Array.isArray(workingSet) ? workingSet : [];
  let index = 0;
  return String(message || "").replace(/\uFFFC/g, () => {
    const item = items[index++];
    if (!item) return "[missing attachment]";
    const kind = textValue(item.studioKind) || "item";
    const label = textValue(item.label) || textValue(item.studioId) || "item";
    const id = textValue(item.studioId) || "?";
    return `[${kind}:${label} id=${id}]`;
  });
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pickImageUrl(media) {
  const root = objectValue(media) ?? {};
  const data = objectValue(root.data) ?? root;
  return (
    textValue(data.thumbnailUrl) ||
    textValue(data.preferredViewUrl) ||
    textValue(data.url) ||
    ""
  );
}

function inferMimeType(url = "", fallback = "") {
  const hinted = textValue(fallback).split(";")[0].trim();
  if (hinted.startsWith("image/")) return hinted;
  const clean = String(url).split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".jpeg") || clean.endsWith(".jpg")) return "image/jpeg";
  return hinted || "image/jpeg";
}

async function fetchImageContent(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const mimeType = inferMimeType(url, res.headers.get("content-type") || "");
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Expected image content, got ${mimeType}`);
  }
  return {
    type: "image",
    source: {
      type: "base64",
      mediaType: mimeType,
      data: Buffer.from(await res.arrayBuffer()).toString("base64"),
    },
  };
}

async function runPiTurn(body, abortSignal) {
  const {
    message,
    attachments,
    workingSet,
    history,
    memories,
    userId,
    threadId,
    runId,
    role = "user",
    scopes,
    autoApprove = false,
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
    let approvalCreated = false;
    const mod = await import("@earendil-works/pi-coding-agent");
    const { createAgentSession, SessionManager } = mod;

    const laneEarly = detectActionLane(
      expandAttachmentTokens(message, workingSet).trim() || message,
      workingSet,
    );
    const trajectory = createTrajectory({
      lane: laneEarly,
      message: String(message || ""),
    });

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
      trajectory,
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
      onApprovalRequired: async ({ toolName, args, tool, toolCallId }) => {
        if (autoApprove) {
          return null;
        }
        approvalCreated = true;
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
            toolCallId,
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
          message: "Waiting for confirmation in chat.",
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
        ? `Memories:\n${memories
            .slice(0, 8)
            .map((m) => `- [${m.kind}] ${m.title}: ${String(m.body).slice(0, 120)}`)
            .join("\n")}`
        : "";

    const attachmentBlock = Array.isArray(workingSet) && workingSet.length
      ? `Attached (use these ids):\n${workingSet
          .map((item, index) => {
            const parts = [
              `${index + 1}. ${textValue(item.label) || textValue(item.studioId)}`,
              textValue(item.studioKind) ? `kind=${textValue(item.studioKind)}` : "",
              textValue(item.studioId) ? `id=${textValue(item.studioId)}` : "",
              textValue(item.elementType) ? `type=${textValue(item.elementType)}` : "",
              textValue(item.folderPath || item.path) ? `path=${textValue(item.folderPath || item.path)}` : "",
            ].filter(Boolean);
            const lines = [parts.join(" | ")];
            if (item.preview?.folders?.length) {
              lines.push(`folders: ${item.preview.folders.slice(0, 8).join(", ")}`);
            }
            if (item.preview?.assets?.length) {
              lines.push(
                `assets: ${item.preview.assets
                  .slice(0, 8)
                  .map((asset) => `${asset.name} (${asset.kind})`)
                  .join(", ")}`,
              );
            }
            if (textValue(item.excerpt)) lines.push(`excerpt: ${textValue(item.excerpt).slice(0, 280)}`);
            if (textValue(item.description)) lines.push(`notes: ${textValue(item.description).slice(0, 200)}`);
            return lines.join("\n");
          })
          .join("\n\n")}`
      : "Attached: none";

    const userMessage =
      expandAttachmentTokens(message, workingSet).trim() || "(attachments only)";
    const lane = laneEarly || detectActionLane(userMessage, workingSet);

    const system = [
      "Yatishara Studio Agent. Act with tools — don't advise how unless asked.",
      "Pi tools: catalog, describe, invoke, inspect, remember, skills, plan.",
      "Studio actions: invoke {name:\"studio_*\", args:{...}}. Never call studio_* as a top-level tool.",
      "catalog: starter set by default; q= or category= to search. describe if args unclear.",
      skillPromptBlock(),
      "Before writing image/video prompts or choosing hypermotion vs cinematic, skills {id} for the matching prompt-* pack. Do not invent third-party brand names in prompts.",
      "plan: only for 3+ step jobs (set/update/get). Skip for one-shot post/move/send.",
      "Attached chips are primary scope — use their ids. Tokens like [asset:Name id=…] are chips.",
      "Orient: studio_workspace_tree {} or studio_search. folder_contents needs a real folderId.",
      "Ambiguity: if attached ids cover the action, invoke now. Ask only when a required arg is missing.",
      "Cost: for paid generate, estimate first when the user did not clearly confirm spend.",
      "Paid/destructive/outbound/admin → approval card (stop; chat UI handles it).",
      "Done criteria: never claim success unless invoke ok (or pendingApproval). Follow verifyHint / verified.",
      "Failures: on error → fix args or catalog/describe → retry once → then tell the user the error. Never invent 'tool unavailable'.",
      "inspect: only for pixels beyond attached vision; max 8; videos → pull frames first.",
      "Voice: warm, short, creator-friendly. Light emoji ok. Markdown bullets. No ids/JSON/debug talk.",
      "remember for durable prefs. Admin only if admin. Never touch other users' data.",
      lane,
      byokFallbackNote || "",
      memoryBlock,
    ]
      .filter(Boolean)
      .join("\n");

    const prior = Array.isArray(history)
      ? history
          .slice(-8)
          .map((row) => `${row.role}: ${String(row.content || "").slice(0, 600)}`)
          .join("\n")
      : "";
    const prompt = [
      system,
      prior ? `Prior:\n${prior}` : "",
      attachmentBlock,
      `User:\n${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (abortSignal?.aborted) {
      throw new Error("cancelled");
    }

    const images = [];
    const attachedAssets = Array.isArray(attachments) ? attachments.slice(0, 12) : [];
    for (const item of attachedAssets) {
      if (images.length >= 8) break;
      if (textValue(item?.studioKind) !== "asset") continue;
      const studioId = textValue(item?.studioId);
      const kind = textValue(item?.kind);
      if (!studioId || kind !== "image") continue;
      try {
        const media = await invokeStudioTool(
          studioApiBase,
          capabilityToken,
          "studio_view_media",
          { assetId: studioId },
        );
        if (media?.ok === false) continue;
        const imageUrl = pickImageUrl(media?.data ?? media);
        if (!imageUrl) continue;
        images.push(await fetchImageContent(imageUrl));
      } catch {
        // best-effort multimodal attach; text working-set remains
      }
    }

    // prompt() resolves void — text + usage come from session after idle.
    await session.prompt(prompt, images.length ? { images } : undefined);

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
    if (approvalCreated) {
      try {
        session.dispose?.();
      } catch {
        // ignore dispose errors
      }
      const traj = trajectory.snapshot();
      console.log("[studio-agent] trajectory", JSON.stringify(traj));
      return {
        pendingApproval: true,
        usage: { inputTokens, outputTokens },
        model: `${session.model?.provider || PLATFORM_PROVIDER}/${session.model?.id || PLATFORM_MODEL}`,
        trajectory: traj,
      };
    }
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
    const traj = trajectory.snapshot();
    console.log("[studio-agent] trajectory", JSON.stringify(traj));
    return {
      assistantText: String(assistantText),
      usage: { inputTokens, outputTokens },
      model: `${session.model?.provider || PLATFORM_PROVIDER}/${session.model?.id || PLATFORM_MODEL}`,
      trajectory: traj,
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
          version: "harness-2026-08-11",
          sessions: sessions.size,
          authRequired: true,
          catalog: "studio-tools",
          tools: [
            "catalog",
            "describe",
            "invoke",
            "inspect",
            "remember",
            "skills",
            "plan",
          ],
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
            pendingApproval: Boolean(turn.pendingApproval),
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
