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
import { normalizeAgentUsage } from "./usageBilling.mjs";
import { invokeStudioTool } from "../../packages/studio-tools/src/http.js";

const PORT = Number(process.env.STUDIO_AGENT_PORT || process.env.PORT || 8796);
const TOKEN = String(process.env.STUDIO_AGENT_WORKER_TOKEN || "").trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(__dirname, ".pi-harness");
const PLATFORM_PROVIDER = String(
  process.env.STUDIO_AGENT_PROVIDER || "byteplus-ark",
).trim();
const PLATFORM_MODEL = String(
  process.env.STUDIO_AGENT_MODEL_ID || "dola-seed-2-1-turbo-260628",
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
    seedPlanJson,
    seedTodosJson,
    currentFolderId,
    currentFolderPath,
    cwdFolderId,
    cwdFolderPath,
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
    if (cwdIdEarly) {
      try {
        const listed = await invokeStudioTool(
          studioApiBase,
          capabilityToken,
          "studio_folder_contents",
          { folderId: cwdIdEarly },
        );
        const raw = listed?.data && typeof listed.data === "object" ? listed.data : {};
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
            "CWD index (real ids — NEVER invent documentId/assetId; memories may be stale):",
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
        ? `Memories (already loaded for this turn — use them; do not claim you have no memory):\n${memories
            .slice(0, 10)
            .map((m) => {
              const pin = m.pinned ? " pinned" : "";
              const body = String(m.body ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
              return `- [${m.kind}${pin}] ${m.title}: ${body}`;
            })
            .join("\n")}`
        : "Memories: none loaded for this turn.";

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

    const cwdId = textValue(currentFolderId || cwdFolderId);
    const cwdPath = textValue(currentFolderPath || cwdFolderPath);
    const cwdBlock = cwdId
      ? `Current folder (CWD): id=${cwdId}${cwdPath ? ` path=${cwdPath}` : ""}. Default folderId for studio_create_document, studio_generate_*, studio_create_folder (as parent), uploads, and other saves — unless the user names another folder or attaches a different target.`
      : "Current folder (CWD): none open — if saving, ask once or use an attached folder id.";

    const system = [
      "Yatishara Studio Agent. Act with tools — don't advise how unless asked.",
      "Pi tools: catalog, describe, invoke, inspect, remember, skills, plan, ask.",
      "Studio actions: invoke {name:\"studio_*\", args:{...}}. Never call studio_* as a top-level tool.",
      "catalog: starter set by default; q= or category= to search. describe if args unclear.",
      skillPromptBlock(),
      "Before writing image/video prompts or choosing hypermotion vs cinematic, skills {id} for the matching prompt-* pack. Do not invent third-party brand names in prompts.",
      "Voiceover from video/edit: skills {id:\"prompt-voiceover\"}. Pull frames (VO cadence), write VO, studio_create_document titled \"VO script — …\", ALWAYS paste spoken-only ```text fence in chat for Copy, then ask once before ElevenLabs audio gen.",
      "Prompt craft: never ship lame short vibe lines. Load prompt-cinematic / prompt-hypermotion / prompt-image and write sealed production prompts (SCENE CONTEXT, first-frame occupancy, camera start→end, acting/voice, ⛔ failure locks, ✅ must-succeed locks). Length is not the enemy — thinning is.",
      "Prompt save: when they ask for a NEW prompt or script (write/craft/create from scratch) — skills first, then studio_create_document into CWD with NON-EMPTY contentMarkdown. Body must be plain markdown only: title + ```text fence + ## References with `- [Label](asset://{assetId})` links. INSIDE the sealed ```text``` prompt, tag each attached asset as @Label (exact same Label as the References link) so paste/Run shows chips, e.g. @flyer @hero in the prose. NEVER pipe-meta rows (`| kind: image | studio: id`) — those crash Script open. Never create an empty Script. After create, keep the returned documentId. Never stash the prompt body in remember/memory. Title like \"Prompt — <short>\" or \"Script — <short>\" (VO: \"VO script — <short>\"). Chat: for image/video prompts, only paste if they asked to see/copy; for voiceover, ALWAYS paste the spoken-only ```text fence.",
      "EDIT LAW (creators iterate — this is the default when a Script already exists): People say things like \"make it longer\", \"add X\", \"fix that line\", \"change the camera\", \"add prompts\". That is a surgical edit — NOT a rewrite. 1) studio_get_document with a real CWD id. 2) studio_patch_document with exact oldString→newString (or edits[]) touching ONLY what they asked. 3) Keep the ``` fence language, headings, shot structure, and clean ## References links unless they asked to change those. 4) Never studio_update_document with a full new body for a tweak. 5) Never create a second Script with the same title. Full update only if the file is empty or they explicitly say rewrite / from scratch / start over.",
      "Find before create: when they point at an existing file — use CWD index ids then patch/update. Never invent documentIds from memory. If recovery.recoveredDocumentId is present, reuse it.",
      "Prompt run: if they ask to generate from a saved prompt doc — studio_get_document, read References, pass referenceAssetIds / startFrameAssetId on generate. Default folderId=CWD.",
      "Elements are retired — use assets as references. Do not create or attach elements.",
      "Video models: only from studio_list_video_models (or known slugs seedance-2.5 / seedance-2.0). Talk about motion/light/res/length. Never invent caps, features, or legacy/pipeline marketing.",
      "Bias to action: for vague creative asks, assume strong defaults and DO the next useful tool step (usually estimate, then generate → approval). Do not offer a menu of options.",
      "Assumptions: pick model seedance-2.5, duration ~8s (clamp to model max), aspect from attached still or 16:9, cinematic unless they said hypermotion/chaos. Disclose assumptions in one short line after tools run.",
      "TODO: if the job needs 2+ tool steps, call plan {action:\"create\", title, steps:[...]} first (cancelActive true if replacing direction). Mark steps doing/done with update_step as you go. add_step/remove_step/set_list_status when needed. Latest board reinjects on every tool result.",
      "Before your final reply this turn: update the active todo list to match real progress (doing/done). If the user cancelled the direction, set_list_status cancelled and create a new list if still working.",
      "ask: only for material unknowns (aspect/subject/direction that would change the gen). 1–4 multi-choice questions, then stop. Never ask readiness menus.",
      "Clarify only for material unknowns. Prefer estimate first, then ask if needed — never a laundry list before acting.",
      "Never end with 'Would you like me to A, B, or C?' — pick the best next step and invoke it.",
      "plan: skip only for true one-shots (post/move/send one item).",
      "Attached chips are primary scope — use their ids. Tokens like [asset:Name id=…] are chips.",
      cwdBlock,
      cwdIndexBlock,
      "Orient: studio_workspace_tree {} or studio_search. folder_contents needs a real folderId.",
      "Ambiguity: if attached ids cover the action, invoke now. Ask only when a required arg is missing.",
      "Money: speak only dollars / TTD (e.g. $2.50 TTD). Never say \"credits\" to the user. Tool observations already use cost labels.",
      "Cost: for paid generate, estimate first when the user did not clearly confirm spend, then proceed to generate (approval card handles spend). Quote estimates as $ / TTD only.",
      "Paid/destructive/outbound/admin → approval card (stop; chat UI handles it).",
      "Done criteria: never claim success unless invoke ok (or pendingApproval / pendingAsk). Follow verifyHint / verified.",
      "Failures: on error → fix args or catalog/describe → retry once → then tell the user the error. Never invent 'tool unavailable'.",
      "inspect: only for pixels beyond attached vision; max 8; videos → pull frames first.",
      "Voice: warm, short, creator-friendly. Light emoji ok. Markdown bullets. No ids/JSON/debug talk.",
      "remember: ONLY short pointers — where a script/prompt lives (document title + folder path), durable prefs, decisions. NEVER store full prompts, shot lists, or script bodies in memory — those go in studio_create_document .md Scripts. Saying \"saved to memory\" for a prompt is wrong.",
      "Memories block above is auto-loaded each turn (you will also see a Recall memory step in chat). Prefer those facts when relevant; do not invent that you checked memory if the block says none.",
      seedBoard
        ? `Existing TODO board (continue/update):\n${typeof seedBoard === "string" ? seedBoard : JSON.stringify(seedBoard).slice(0, 2500)}`
        : "",
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
    // Pi splits prompt into input (non-cached) + cacheRead + cacheWrite.
    // Never fold cache into input — BytePlus bills hits cheaper, storage hourly.
    const usage = normalizeAgentUsage({
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
    });
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
            "ask",
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
