#!/usr/bin/env node
/**
 * Studio Agent Pi worker (canonical).
 *
 * Convex agentActions.sendTurn posts here when STUDIO_AGENT_URL is set.
 * Tools: typed studio_* + inspect/skills/ask; catalog/invoke for the long tail.
 * Studio /api/v1 with per-user capability token. No MCP on this path.
 *
 * Env:
 *   STUDIO_AGENT_PORT / PORT
 *   STUDIO_AGENT_WORKER_TOKEN (required — fail closed)
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStudioPiTools, createTrajectory, DIRECT_TOOL_NAMES } from "./piTools.mjs";
import { detectActionLane } from "./agentLanes.mjs";
import { skillPromptBlock, skillsToInject } from "./agentSkills.mjs";
import { normalizeAgentUsage } from "./usageBilling.mjs";
import {
  budgetPriorHistory,
  buildStructuredThreadSummary,
  formatTrajectoryCoach,
} from "./agentContextBudget.mjs";
import { pickAgentModel } from "./agentModelRoute.mjs";
import { invokeStudioTool } from "../../packages/studio-tools/src/http.js";

const PORT = Number(process.env.STUDIO_AGENT_PORT || process.env.PORT || 8796);
const TOKEN = String(process.env.STUDIO_AGENT_WORKER_TOKEN || "").trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(__dirname, ".pi-harness");
const PLATFORM_PROVIDER = String(
  process.env.STUDIO_AGENT_PROVIDER || "byteplus-ark",
).trim();
const PLATFORM_MODEL = String(
  process.env.STUDIO_AGENT_PLAN_MODEL_ID || "seed-2-0-pro-260328",
).trim();

if (!process.env.ARK_API_KEY?.trim()) {
  console.warn(
    "[studio-agent] ARK_API_KEY missing — platform Seed Pro turns will fail closed",
  );
}

/** @type {Map<string, { updatedAt: number, abort?: AbortController, session?: any, lastUsage?: object }>} */
const sessions = new Map();

function sessionKey(userId, threadId) {
  return `${userId}:${threadId}`;
}

function usageFromSessionEntry(entry) {
  if (!entry) return undefined;
  if (entry.lastUsage) return entry.lastUsage;
  const session = entry.session;
  if (!session || typeof session.getSessionStats !== "function") return undefined;
  try {
    const tokens = session.getSessionStats()?.tokens || {};
    return normalizeAgentUsage({
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
    });
  } catch {
    return undefined;
  }
}

async function abortSessionEntry(entry) {
  if (!entry) return;
  // Capture usage before abort tears the session down.
  try {
    entry.lastUsage = usageFromSessionEntry(entry) || entry.lastUsage;
  } catch {
    // ignore
  }
  try {
    entry.abort?.abort();
  } catch {
    // ignore
  }
  try {
    await entry.session?.abort?.();
  } catch {
    // ignore
  }
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

/** Files UI never says "Studio" — show Files / parent / name. */
function filesDisplayPath(path, name) {
  const parts = String(path || "")
    .split(/[/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index) => !(index === 0 && /^studio$/i.test(part)));
  if (parts.length) return `Files / ${parts.join(" / ")}`;
  const leaf = textValue(name);
  return leaf ? `Files / ${leaf}` : "";
}

function leafFolderName(path, name) {
  if (textValue(name)) return textValue(name);
  const parts = String(path || "")
    .split(/[/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "";
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
    autoApprove: _autoApprove = true,
    capabilityToken,
    studioApiBase,
    callbackBase,
    workerCallbackToken,
    byokFallbackNote,
    usedByok = false,
    seedPlanJson,
    seedTodosJson,
    currentFolderId,
    currentFolderPath,
    currentFolderName,
    cwdFolderId,
    cwdFolderPath,
    threadSummary,
    workingScratchJson,
  } = body;

  if (!capabilityToken) {
    throw new Error("capabilityToken required — no global STUDIO_API_TOKEN fallback");
  }
  if (!studioApiBase) {
    throw new Error("studioApiBase required");
  }

  const key = sessionKey(userId || "anon", threadId || "default");
  const sessionEntry = sessions.get(key) || { updatedAt: Date.now() };
  sessionEntry.updatedAt = Date.now();
  sessions.set(key, sessionEntry);

  let cancelNotified = false;

  const requestAbort = async (reason = "cancelled") => {
    if (cancelNotified) return;
    cancelNotified = true;
    console.log("[studio-agent] cancel", reason, { runId, threadId });
    await abortSessionEntry(sessionEntry);
    if (abortSignal && !abortSignal.aborted) {
      try {
        // Parent AbortController may already be this entry.abort
        abortSignal.dispatchEvent?.(new Event("abort"));
      } catch {
        // ignore
      }
    }
  };

  // Cancellation poll — call session.abort() (AbortController alone does not stop Pi).
  const cancelPoll = setInterval(() => {
    void (async () => {
      try {
        const status = await callback(
          callbackBase,
          workerCallbackToken,
          "run-status",
          { runId },
          "GET",
        );
        if (status?.run?.status === "cancelled" || status?.run?.cancelRequestedAt) {
          await requestAbort("run-status");
        }
      } catch {
        // ignore poll errors
      }
    })();
  }, 500);

  try {
    let approvalCreated = false;
    let askCreated = false;
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

    // Model routing: plan-strong / execute-cheap (BYOK unchanged).
    const modelChoice = pickAgentModel({
      message: String(message || ""),
      lane: laneEarly,
      execModelId: PLATFORM_MODEL,
      planModelId: process.env.STUDIO_AGENT_PLAN_MODEL_ID || undefined,
    });
    const usePlanModel = modelChoice.tier === "plan" && !usedByok;
    if (usePlanModel) {
      console.log("[studio-agent] plan-model", modelChoice.modelId, { reason: modelChoice.reason, runId, threadId });
    }

    let seedBoard = null;
    const boardRaw = seedTodosJson || seedPlanJson;
    if (boardRaw) {
      try {
        seedBoard = typeof boardRaw === "string" ? JSON.parse(boardRaw) : boardRaw;
      } catch {
        seedBoard = boardRaw;
      }
    }

    const cwdIdEarly = textValue(currentFolderId || cwdFolderId);
    /** @type {{ documents: Array<{ documentId: string, title?: string, updatedAt?: number }>, assets: Array<{ assetId: string, name?: string, updatedAt?: number }> }|null} */
    let cwdIndex = null;
    let cwdIndexBlock = "";
    let listedFolderName = textValue(currentFolderName);
    let listedFolderPath = textValue(currentFolderPath || cwdFolderPath);
    if (cwdIdEarly) {
      try {
        const listed = await invokeStudioTool(
          studioApiBase,
          capabilityToken,
          "studio_folder_contents",
          { folderId: cwdIdEarly },
        );
        const raw = listed?.data && typeof listed.data === "object" ? listed.data : {};
        const folderMeta = raw.folder && typeof raw.folder === "object" ? raw.folder : null;
        if (textValue(folderMeta?.name)) listedFolderName = textValue(folderMeta.name);
        const crumbs = Array.isArray(raw.breadcrumb) ? raw.breadcrumb : [];
        if (crumbs.length) {
          listedFolderPath = `/${crumbs
            .map((crumb) => textValue(crumb?.name))
            .filter(Boolean)
            .join("/")}`;
          if (!listedFolderName) {
            listedFolderName = textValue(crumbs[crumbs.length - 1]?.name);
          }
        }
        const documents = Array.isArray(raw.documents)
          ? raw.documents
              .map((doc) => ({
                documentId: String(doc?.id ?? doc?._id ?? "").trim(),
                title: doc?.title ?? doc?.name,
                updatedAt: doc?.updatedAt,
              }))
              .filter((doc) => doc.documentId)
          : [];
        const assets = Array.isArray(raw.assets)
          ? raw.assets
              .map((asset) => ({
                assetId: String(asset?.id ?? asset?._id ?? asset?.assetId ?? "").trim(),
                name: asset?.name,
                updatedAt: asset?.updatedAt,
              }))
              .filter((asset) => asset.assetId)
          : [];
        if (documents.length || assets.length) {
          cwdIndex = { documents, assets };
          const lines = [
            listedFolderName
              ? `Open folder "${listedFolderName}" contents (real ids — NEVER invent documentId/assetId; never show ids to the user):`
              : "Open folder contents (real ids — NEVER invent documentId/assetId; never show ids to the user):",
            ...documents
              .slice(0, 12)
              .map(
                (doc) =>
                  `- document id=${doc.documentId} title=${String(doc.title || "").slice(0, 80)}`,
              ),
            ...assets
              .slice(0, 8)
              .map(
                (asset) =>
                  `- asset id=${asset.assetId} name=${String(asset.name || "").slice(0, 80)}`,
              ),
          ];
          cwdIndexBlock = lines.join("\n");
        }
      } catch {
        /* best-effort — post-fail recovery still applies */
      }
    }

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
      seedBoard,
      cwdFolderId: currentFolderId || cwdFolderId || null,
      cwdIndex,
      abortSignal,
      generationPollTimeoutMs: 90_000,
      getBearerToken: async () => capabilityToken,
      onPlanChange: (snap) => {
        if (!callbackBase) return;
        void callback(callbackBase, workerCallbackToken, "plan-sync", {
          runId,
          threadId,
          todosJson: JSON.stringify(snap),
          planJson: JSON.stringify(snap),
        });
      },
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
      onAskRequired: async ({ intro, questions }) => {
        askCreated = true;
        const ask = await callback(callbackBase, workerCallbackToken, "ask", {
          ownerId: userId,
          threadId,
          runId,
          intro,
          questions,
        });
        return ask;
      },
      onApprovalRequired: async () => null,
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
            projectFolderId:
              args.projectFolderId || currentFolderId || cwdFolderId || undefined,
          }),
        studio_agent_update_memory: async (args) =>
          callback(callbackBase, workerCallbackToken, "memory-update", {
            ownerId: userId,
            memoryId: args.memoryId,
            title: args.title,
            body: args.body,
            pinned: args.pinned,
          }),
        studio_agent_archive_memory: async (args) =>
          callback(callbackBase, workerCallbackToken, "memory-archive", {
            ownerId: userId,
            memoryId: args.memoryId,
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
      ...(usePlanModel ? {} : {}), // explicit model passed below via setModel
    });
    sessionEntry.session = session;
    sessions.set(key, sessionEntry);

    // Mid-turn chat updates: when the model narrates before tool calls, show it live.
    const extractAssistantText = (message) => {
      if (!message || typeof message !== "object") return "";
      if (typeof message.content === "string") return message.content.trim();
      if (!Array.isArray(message.content)) return "";
      return message.content
        .filter((part) => part && part.type === "text" && typeof part.text === "string")
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
    };
    const assistantHasToolCalls = (message) => {
      if (!message || !Array.isArray(message.content)) return false;
      return message.content.some(
        (part) => part && (part.type === "toolCall" || part.type === "tool_use"),
      );
    };
    const unsubProgress =
      typeof session.subscribe === "function"
        ? session.subscribe((event) => {
            if (!event || event.type !== "message_end") return;
            const msg = event.message;
            if (!msg || msg.role !== "assistant") return;
            const text = extractAssistantText(msg);
            if (!text || text.length < 8) return;
            // Only stream interim narration that precedes tools — final reply is saved at turn end.
            if (!assistantHasToolCalls(msg)) return;
            void callback(callbackBase, workerCallbackToken, "assistant-progress", {
              ownerId: userId,
              threadId,
              runId,
              content: text.slice(0, 4000),
            }).catch(() => undefined);
          })
        : null;

    // Switch to plan model if lane/message demand it (platform-only; BYOK unchanged).
    if (usePlanModel && typeof session.setModel === "function") {
      try {
        const modByok = await import("@earendil-works/pi-coding-agent");
        const getModelFunc = modByok.getModel;
        const ModelRuntimeClass = modByok.ModelRuntime;

        let planModel = null;
        // Prefer ModelRuntime async catalog to find custom models from models.json.
        if (ModelRuntimeClass && typeof ModelRuntimeClass.create === "function") {
          const mr = await ModelRuntimeClass.create({
            agentDir: AGENT_DIR,
            cwd: AGENT_DIR,
          });
          planModel = mr.getModel(PLATFORM_PROVIDER, modelChoice.modelId);
        }
        // Fallback: synchronous compat getModel (built-in models).
        if (!planModel && getModelFunc && typeof getModelFunc === "function") {
          planModel = getModelFunc(PLATFORM_PROVIDER, modelChoice.modelId);
        }
        if (planModel) {
          session.setModel(planModel);
          console.log("[studio-agent] setModel plan", modelChoice.modelId);
        } else {
          console.warn(
            "[studio-agent] plan model not found; using default",
            modelChoice.modelId,
          );
        }
      } catch (err) {
        console.warn("[studio-agent] setModel plan failed", err.message || err);
      }
    }

    if (abortSignal?.aborted || cancelNotified) {
      await requestAbort("pre-prompt");
      throw new Error("cancelled");
    }

    if (!session.model) {
      throw new Error(
        `No platform model loaded (${PLATFORM_PROVIDER}/${
          usePlanModel ? modelChoice.modelId : PLATFORM_MODEL
        }). Check ARK_API_KEY + .pi-harness/models.json.`,
      );
    }

    const attachmentBlock = Array.isArray(workingSet) && workingSet.length
      ? `Attached (use these ids):\n${workingSet
          .map((item, index) => {
            const parts = [
              `${index + 1}. ${textValue(item.label) || textValue(item.studioId)}`,
              textValue(item.studioKind) ? `kind=${textValue(item.studioKind)}` : "",
              textValue(item.studioId) ? `id=${textValue(item.studioId)}` : "",
              textValue(item.elementType) ? `type=${textValue(item.elementType)}` : "",
              textValue(item.folderPath || item.path)
                ? `path=${textValue(item.folderPath || item.path)}`
                : "",
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
            if (textValue(item.excerpt)) {
              lines.push(`excerpt: ${textValue(item.excerpt).slice(0, 280)}`);
            }
            if (textValue(item.description)) {
              lines.push(`notes: ${textValue(item.description).slice(0, 200)}`);
            }
            return lines.join("\n");
          })
          .join("\n\n")}`
      : "Attached: none";

    const userMessage =
      expandAttachmentTokens(message, workingSet).trim() || "(attachments only)";
    const lane = laneEarly || detectActionLane(userMessage, workingSet);

    const cwdId = textValue(currentFolderId || cwdFolderId);
    const cwdName = leafFolderName(listedFolderPath, listedFolderName);
    const cwdShown = filesDisplayPath(listedFolderPath, cwdName);
    const cwdBlock = cwdId
      ? `Open Files folder: ${cwdName || "the folder they have open"}${cwdShown ? ` (${cwdShown})` : ""}. This is the project they are in — default folderId for studio_create_document, studio_generate_*, studio_create_folder (as parent), uploads, and other saves unless they name another folder. Tool folderId=${cwdId}. NEVER say CWD, folderId, or ids to the user — say the folder name.`
      : "No Files folder is open. If saving, ask once which folder, or use an attached folder. NEVER say CWD to the user.";

    const memoryBlock =
      Array.isArray(memories) && memories.length
        ? `Memories (high-signal only — already loaded; do not tool-call recall):\n${memories
            .slice(0, 6)
            .map((m) => {
              const pin = m.pinned ? " pinned" : "";
              const body = String(m.body ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
              return `- [${m.kind}${pin}] ${m.title}: ${body}`;
            })
            .join("\n")}`
        : "Memories: none relevant for this turn (do not invent recall).";

    const summaryBlock = textValue(threadSummary)
      ? `Thread summary (durable continuity):\n${String(threadSummary).slice(0, 1200)}`
      : "";

    let workingBlock = "";
    if (textValue(workingScratchJson)) {
      try {
        const scratch = JSON.parse(String(workingScratchJson));
        const lines = ["Working state (reuse these ids — verify with open-folder contents if unsure):"];
        if (scratch.cwdFolderId) {
          lines.push(
            `- open folder${scratch.cwdFolderName ? ` "${scratch.cwdFolderName}"` : ""}${scratch.cwdFolderPath ? ` path=${scratch.cwdFolderPath}` : ""} folderId=${scratch.cwdFolderId}`,
          );
        }
        if (Array.isArray(scratch.lastDocumentIds) && scratch.lastDocumentIds.length) {
          lines.push(`- recent documents: ${scratch.lastDocumentIds.slice(0, 6).join(", ")}`);
        }
        if (Array.isArray(scratch.lastAssetIds) && scratch.lastAssetIds.length) {
          lines.push(`- recent assets: ${scratch.lastAssetIds.slice(0, 6).join(", ")}`);
        }
        if (Array.isArray(scratch.lastElementIds) && scratch.lastElementIds.length) {
          lines.push(`- recent elements: ${scratch.lastElementIds.slice(0, 6).join(", ")}`);
        }
        if (
          Array.isArray(scratch.lastGenerationJobIds) &&
          scratch.lastGenerationJobIds.length
        ) {
          lines.push(
            `- recent generation jobs: ${scratch.lastGenerationJobIds.slice(0, 4).join(", ")}`,
          );
        }
        if (lines.length > 1) workingBlock = lines.join("\n");
      } catch {
        workingBlock = "";
      }
    }

    const isContinue = /^\s*continue\.?\s*$/i.test(String(userMessage || ""));

    // Real context budget: snip tool noise, keep episode ids.
    const prior = budgetPriorHistory(history, {
      maxChars: 14_000,
      keepRecent: 10,
      currentUser: userMessage,
    });

    // Trajectory coach from last turn (stored in Convex workingScratchJson.lastTrajectory).
    let lastTrajectoryBlock = "";
    let lastTrajectory = null;
    if (workingScratchJson) {
      try {
        const scratch =
          typeof workingScratchJson === "string"
            ? JSON.parse(workingScratchJson)
            : workingScratchJson;
        lastTrajectory =
          scratch?.lastTrajectory && typeof scratch.lastTrajectory === "object"
            ? scratch.lastTrajectory
            : null;
      } catch {
        lastTrajectory = null;
      }
    }
    if (lastTrajectory) {
      const coach = formatTrajectoryCoach(lastTrajectory);
      if (coach) {
        lastTrajectoryBlock = `${coach}\n`;
      }
    }

    const injectedSkills = skillsToInject(userMessage, lane);
    const injectedSkillBlock = injectedSkills.length
      ? injectedSkills
          .map(
            (pack) =>
              `SKILL ${pack.id} (loaded for this turn — follow it):\n${String(pack.body || "").slice(0, 6000)}`,
          )
          .join("\n\n")
      : "";

    const system = [
      lastTrajectoryBlock ? `${lastTrajectoryBlock}` : "",
      injectedSkillBlock,
      "Yatishara Studio Agent. Act with tools — don't advise how unless asked.",
      "CONTINUITY: Prior + Thread summary + TODO board ARE this chat. Resume unfinished work; do not restart from scratch unless asked. \"Continue.\" means pick up the next unfinished step from Prior/TODO.",
      "Call studio_* tools directly — they are typed top-level tools (generate, documents, elements, folders, trash, send, …). inspect to see images. ask if a material unknown would change the work. catalog/describe/invoke only for rare tools not already in your list.",
      "Do not call remember for ephemeral tool chatter. Memories are auto-injected when relevant — never invent a recall tool step.",
      skillPromptBlock(),
      "Matching skill packs are already injected when relevant. Call skills {id} only if you need another pack. Do not invent third-party brand names in prompts.",
      "Voiceover from video/edit: skills {id:\"prompt-voiceover\"}. Pull frames (VO cadence), write VO, studio_create_document titled \"VO script — …\", ALWAYS paste spoken-only ```text fence in chat for Copy, then ask once before ElevenLabs audio gen.",
      "Prompt craft: never ship lame short vibe lines. Load prompt-cinematic / prompt-hypermotion / prompt-image and write sealed production prompts (SCENE CONTEXT, first-frame occupancy, camera start→end, acting/voice, ⛔ failure locks, ✅ must-succeed locks). Length is not the enemy — thinning is.",
      "Prompt save: when they ask for a NEW prompt or script (write/craft/create from scratch) — skills first; if attached stills are identity locks (product/character/prop/location), ELEMENT FLOW first (list → create .element → use element://). Then studio_create_document into CWD with NON-EMPTY contentMarkdown. Body must be plain markdown only: title + ```text fence + ## References with `- [Label](element://{elementId})` for those locks (asset:// only for style/mood or when no element exists yet). INSIDE the sealed ```text``` prompt, tag each as @Label (exact same Label as the References link). NEVER pipe-meta rows (`| kind: image | studio: id`) — those crash Script open. Never create an empty Script. After create, keep the returned documentId. Never stash the prompt body in remember/memory. Title like \"Prompt — <short>\" or \"Script — <short>\" (VO: \"VO script — <short>\"). Chat: for image/video prompts, only paste if they asked to see/copy; for voiceover, ALWAYS paste the spoken-only ```text fence.",
      "EDIT LAW (creators iterate — this is the default when a Script already exists): People say things like \"make it longer\", \"add X\", \"fix that line\", \"change the camera\", \"add prompts\". That is a surgical edit — NOT a rewrite. 1) studio_get_document with a real CWD id. 2) studio_patch_document with exact oldString→newString (or edits[]) touching ONLY what they asked. 3) Keep the ``` fence language, headings, shot structure, and clean ## References links unless they asked to change those. 4) Never studio_update_document with a full new body for a tweak. 5) Never create a second Script with the same title. Full update only if the file is empty or they explicitly say rewrite / from scratch / start over.",
      "Find before create: when they point at an existing file — use CWD index ids then patch/update. Never invent documentIds from memory. If recovery.recoveredDocumentId is present, reuse it.",
      "Prompt run: if they ask to generate from a saved prompt doc — studio_get_document, read References, pass referenceAssetIds / referenceElementIds / startFrameAssetId on generate. Default folderId=CWD.",
      "ELEMENT FLOW (understand why — do not only react to the words \"create element\"): WHY — a .element is a reusable Seedance/Create identity lock (product, character, prop, location). Bare asset:// refs are one-shot; @name + element:// hydrates chips on paste/Run and keeps the same lock across prompts/gens. WHEN — (1) they ask to create/lock/elementize media, OR (2) they attach product/character/prop/location stills and want a prompt/ad/script that must keep that identity, OR (3) they will generate with those locks. Style/mood-only refs may stay asset://. HOW — studio_list_elements in CWD (reuse live matches) → else studio_upload_asset if needed → studio_create_element {type:character|prop|location,name,folderId:CWD,description?,referenceAssetIds} with unique @name (no spaces) → tag @name inside sealed ```text``` → `- [name](element://{elementId})` under ## References → generate with referenceElementIds. studio_update_element to swap media. Sheet-build tools only if asked. NEVER claim Elements are retired, removed, unavailable, or skip create because asset:// \"is enough\" when identity lock is the job.",
      "Video models: only from studio_list_video_models (or known slugs seedance-2.5 / seedance-2.0). Talk about motion/light/res/length. Never invent caps, features, or legacy/pipeline marketing.",
      "Bias to action: for vague creative asks, assume strong defaults and DO the next useful tool step (usually estimate, then generate). Do not offer a menu of options.",
      "Between tool batches, write a short plain update to the user (1–2 sentences) BEFORE more tools — like Cursor status lines. Example: \"Making the product sheet folder next.\" Never dump ids/JSON. Do this when the next step takes noticeable time (generate, element, archive).",
      "Assumptions: pick model seedance-2.5, duration ~8s (clamp to model max), aspect from attached still or 16:9, cinematic unless they said hypermotion/chaos. Disclose assumptions in one short line after tools run.",
      "Generate returns: if stillRendering/queued, tell the user it's rendering in Files and STOP — do not spin/poll forever inside the turn.",
      "TODO: if the job needs 2+ tool steps, call plan {action:\"create\", title, steps:[...]} first (cancelActive true if replacing direction). Mark steps doing/done with update_step as you go. add_step/remove_step/set_list_status when needed. Latest board reinjects on every tool result.",
      "Before your final reply this turn: update the active todo list to match real progress (doing/done). If the user cancelled the direction, set_list_status cancelled and create a new list if still working.",
      "ask: only for material unknowns (aspect/subject/direction that would change the gen). 1–4 multi-choice questions, then stop. Never ask readiness menus.",
      "Clarify only for material unknowns. Prefer estimate first, then ask if needed — never a laundry list before acting.",
      "Never end with 'Would you like me to A, B, or C?' — pick the best next step and run the tool.",
      "plan: skip only for true one-shots (post/move/send one item).",
      "Attached chips are primary scope — use their ids. Tokens like [asset:Name id=…] are chips.",
      cwdBlock,
      cwdIndexBlock,
      "Orient: studio_workspace_tree {} or studio_search. folder_contents needs a real folderId.",
      "Ambiguity: if attached ids cover the action, run the tool now. Ask only when a required arg is missing or the user did not clearly want generate/send/trash/post.",
      "Money: speak only dollars / TTD (e.g. $2.50 TTD). Never say \"credits\" to the user. Tool observations already use cost labels.",
      "Cost: for paid generate, estimate first when spend is not obvious, then generate. No approval cards — just run. Quote estimates as $ / TTD only.",
      "If they did not clearly ask to generate, send, trash, or post — ask first. Otherwise just run it.",
      "Done criteria: never claim success unless the tool ok (or pendingAsk). Follow verifyHint / verified.",
      "Failures: on error → fix args → retry ONCE → then tell the user the real error and stop. Never invent 'tool unavailable'. Never thrash the same broken call.",
      "See images: attached stills are already in vision. For other folder images, inspect { assetIds }. Videos → pull_frames first, then inspect those frames.",
      "Voice: warm, short, creator-friendly. Light emoji ok. Markdown bullets. No ids/JSON/debug talk. Never say CWD — name the Files folder they have open.",
      "remember: ONLY short pointers for THIS project — where a script/prompt lives (document title + folder path), durable prefs, decisions. ALWAYS pass projectFolderId=the open Files folder when remembering project facts. NEVER store full prompts, shot lists, or script bodies in memory — those go in studio_create_document .md Scripts. Saying \"saved to memory\" for a prompt is wrong. Use remember_update / remember_forget to fix stale memories; do not pile duplicates.",
      "Memories already injected above are the only ones relevant — ignore unrelated past projects. If nothing relevant loaded, do not invent recall.",
      summaryBlock,
      workingBlock,
      seedBoard
        ? `Existing TODO board (continue/update):\n${typeof seedBoard === "string" ? seedBoard : JSON.stringify(seedBoard).slice(0, 2500)}`
        : "",
      isContinue
        ? "LANE: CONTINUE — read Prior + TODO. Finish the next incomplete step. Do not re-ask; do not replay the original request verbatim."
        : lane,
      byokFallbackNote || "",
      memoryBlock,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = [
      system,
      prior ? `Prior conversation (this thread):\n${prior}` : "",
      attachmentBlock,
      `User:\n${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (abortSignal?.aborted || cancelNotified) {
      await requestAbort("pre-prompt-images");
      throw new Error("cancelled");
    }

    const images = [];
    const seenAssetIds = new Set();
    const attachedAssets = [
      ...(Array.isArray(attachments) ? attachments : []),
      ...(Array.isArray(workingSet) ? workingSet : []),
    ].slice(0, 16);
    for (const item of attachedAssets) {
      if (abortSignal?.aborted || cancelNotified) {
        await requestAbort("attach-images");
        throw new Error("cancelled");
      }
      if (images.length >= 8) break;
      if (textValue(item?.studioKind) !== "asset") continue;
      const studioId = textValue(item?.studioId);
      const kind = textValue(item?.kind);
      if (!studioId || seenAssetIds.has(studioId)) continue;
      if (kind && kind !== "image") continue;
      seenAssetIds.add(studioId);
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
    // Cancel path must call session.abort() (wired via cancel poll /v1/cancel).
    const onAbort = () => {
      void requestAbort("abort-signal");
    };
    abortSignal?.addEventListener?.("abort", onAbort, { once: true });
    try {
      await session.prompt(prompt, images.length ? { images } : undefined);
    } finally {
      abortSignal?.removeEventListener?.("abort", onAbort);
      try {
        unsubProgress?.();
      } catch {
        // ignore
      }
    }

    if (abortSignal?.aborted || cancelNotified) {
      throw new Error("cancelled");
    }

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
    // Pi splits prompt into input (non-cached) + cacheRead + cacheWrite.
    // Never fold cache into input — BytePlus bills hits cheaper, storage hourly.
    const usage = normalizeAgentUsage({
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
    });
    sessionEntry.lastUsage = usage;
    console.log("[studio-agent] usage", JSON.stringify(usage));
    const assistantText =
      (typeof session.getLastAssistantText === "function"
        ? session.getLastAssistantText()
        : null) || "";
    if (approvalCreated || askCreated) {
      try {
        session.dispose?.();
      } catch {
        // ignore dispose errors
      }
      const traj = trajectory.snapshot();
      console.log("[studio-agent] trajectory", JSON.stringify(traj));
      return {
        pendingApproval: approvalCreated || undefined,
        pendingAsk: askCreated || undefined,
        usage,
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
      usage,
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
          version: "harness-2026-08-15",
          sessions: sessions.size,
          authRequired: true,
          catalog: "studio-tools",
          tools: [
            ...DIRECT_TOOL_NAMES,
            "inspect",
            "remember",
            "remember_update",
            "remember_forget",
            "skills",
            "plan",
            "ask",
            "catalog",
            "describe",
            "invoke",
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
            pendingAsk: Boolean(turn.pendingAsk),
            usage: turn.usage,
            model: turn.model,
            trajectory: turn.trajectory,
            // Ledger charge is Convex-owned (measured usage → textCreditCost).
            usedByok: Boolean(body.usedByok),
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cancelled = /cancelled/i.test(message);
        const usage = usageFromSessionEntry(sessions.get(key));
        res.writeHead(cancelled ? 200 : 500, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            cancelled
              ? { cancelled: true, assistantText: "Stopped.", usage }
              : { error: message, usage },
          ),
        );
      }
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/v1/usage")) {
      if (!authOk(req)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const url = new URL(req.url, "http://localhost");
      const key = sessionKey(
        url.searchParams.get("userId") || "anon",
        url.searchParams.get("threadId") || "default",
      );
      const usage = usageFromSessionEntry(sessions.get(key));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, usage: usage || null }));
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
      const entry = sessions.get(key);
      await abortSessionEntry(entry);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, aborted: Boolean(entry) }));
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
