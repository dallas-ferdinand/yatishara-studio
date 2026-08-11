/**
 * Pi SDK-shaped Studio tools (defineTool + TypeBox + AgentToolResult).
 * Catalog/describe/invoke stay thin; Studio HTTP lives in @yatishara/studio-tools.
 */
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  catalogVersion,
  describeTool,
  listToolsForSurface,
} from "../../packages/studio-tools/src/catalog.js";
import { authorizeTool } from "../../packages/studio-tools/src/policy.js";
import {
  invokeStudioTool,
  resolveStudioToolAlias,
} from "../../packages/studio-tools/src/http.js";
import {
  STARTER_TOOL_NAMES,
  DESCRIBE_EXAMPLES,
  agentDescription,
} from "./agentLanes.mjs";
import { compactObservation, observationByteBudget } from "./agentCompact.mjs";
import { validateHotToolArgs, HOT_SCHEMAS } from "./agentSchemas.mjs";
import {
  listSkills,
  getSkill,
  matchSkills,
  skillPromptBlock,
} from "./agentSkills.mjs";
import {
  verifyHintFor,
  autoVerifyTool,
  autoVerifyArgs,
  salvageGenerationResult,
} from "./agentVerify.mjs";
import { createPlanStore } from "./agentPlan.mjs";
import { createTrajectory } from "./agentTrajectory.mjs";

function textResult(payload) {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    details: typeof payload === "object" && payload ? payload : { text },
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function inferImageMimeType(url = "", fallback = "") {
  const hinted = textValue(fallback).split(";")[0].trim();
  if (hinted.startsWith("image/")) return hinted;
  const clean = String(url).split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".jpeg") || clean.endsWith(".jpg")) return "image/jpeg";
  return hinted || "image/jpeg";
}

function pickImageUrl(media, prefer = "thumb") {
  const root = objectValue(media) ?? {};
  const data = objectValue(root.data) ?? root;
  const candidates =
    prefer === "full"
      ? [
          textValue(data.preferredViewUrl),
          textValue(data.thumbnailUrl),
          textValue(data.url),
        ]
      : [
          textValue(data.thumbnailUrl),
          textValue(data.preferredViewUrl),
          textValue(data.url),
        ];
  return candidates.find(Boolean) || "";
}

async function fetchImageBlock(url, fallbackMimeType = "") {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image fetch failed (${res.status})`);
  }
  const mimeType = inferImageMimeType(
    url,
    res.headers.get("content-type") || fallbackMimeType,
  );
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Expected image, got ${mimeType}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    type: "image",
    data: buf.toString("base64"),
    mimeType,
  };
}

/**
 * @param {{
 *   apiBase: string,
 *   getBearerToken: () => string|Promise<string>,
 *   role?: string,
 *   scopes?: string[],
 *   onApprovalRequired?: (info: object) => Promise<any>,
 *   localHandlers?: Record<string, (args: Record<string, unknown>) => Promise<any>>,
 *   onBeforeInvoke?: (info: { toolName: string, args: Record<string, unknown> }) => Promise<{ toolCallId?: string }|void>,
 *   onAfterInvoke?: (info: { toolCallId?: string, toolName: string, ok: boolean, result?: any, error?: string }) => Promise<void>,
 *   trajectory?: ReturnType<typeof createTrajectory>,
 *   seedPlan?: { goal?: string, steps?: unknown[] }|null,
 *   seedBoard?: object|string|null,
 *   onPlanChange?: (snap: object) => void,
 *   onAskRequired?: (info: object) => Promise<any>,
 *   cwdFolderId?: string|null,
 *   cwdIndex?: {
 *     documents?: Array<{ documentId: string, title?: string, updatedAt?: number }>,
 *     assets?: Array<{ assetId: string, name?: string, updatedAt?: number }>,
 *   }|null,
 * }} opts
 */
/** Document tools whose "not found" should list real candidates instead of a blind re-create. */
const DOC_TOOLS = new Set([
  "studio_get_document",
  "studio_update_document",
  "studio_patch_document",
]);

const ASSET_TOOLS = new Set([
  "studio_get_asset",
  "studio_view_media",
  "studio_update_asset",
]);

/**
 * Pick a real CWD document id when the model invented/staled one.
 * @param {Array<{ documentId: string, title?: string, updatedAt?: number }>} docs
 * @param {Record<string, unknown>} args
 */
export function pickRecoveredDocumentId(docs, args) {
  if (!Array.isArray(docs) || !docs.length) return null;
  const failedId = String(args?.documentId || args?.id || "").trim();
  const pool = docs.filter((doc) => doc.documentId && doc.documentId !== failedId);
  if (!pool.length) return null;

  const titleHint = String(args?.title || args?.name || "")
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "");
  if (titleHint) {
    const hit = pool.find((doc) => {
      const title = String(doc.title || "")
        .trim()
        .toLowerCase()
        .replace(/\.md$/i, "");
      return (
        title === titleHint ||
        title.includes(titleHint) ||
        titleHint.includes(title)
      );
    });
    if (hit) return hit.documentId;
  }

  const prompts = pool.filter((doc) => /prompt|script/i.test(String(doc.title || "")));
  const ranked = (prompts.length ? prompts : pool).slice().sort((a, b) => {
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
  if (ranked.length === 1) return ranked[0].documentId;
  // Multiple scripts: still prefer latest Prompt/Script over inventing a new one.
  if (prompts.length >= 1) return ranked[0].documentId;
  if (pool.length === 1) return pool[0].documentId;
  return null;
}

/**
 * @param {Array<{ assetId: string, name?: string, updatedAt?: number }>} assets
 * @param {Record<string, unknown>} args
 */
export function pickRecoveredAssetId(assets, args) {
  if (!Array.isArray(assets) || !assets.length) return null;
  const failedId = String(args?.assetId || args?.id || "").trim();
  const pool = assets.filter((row) => row.assetId && row.assetId !== failedId);
  if (!pool.length) return null;
  const nameHint = String(args?.name || "")
    .trim()
    .toLowerCase();
  if (nameHint) {
    const hit = pool.find((row) =>
      String(row.name || "")
        .toLowerCase()
        .includes(nameHint),
    );
    if (hit) return hit.assetId;
  }
  if (pool.length === 1) return pool[0].assetId;
  return pool
    .slice()
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
    ?.assetId;
}

/**
 * Rewrite invented/stale ids using a prefetched CWD index so the first HTTP
 * call never returns not-found (and the chat never shows that failure chip).
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {{ documents?: Array<{ documentId: string, title?: string, updatedAt?: number }>, assets?: Array<{ assetId: string, name?: string, updatedAt?: number }> }|null|undefined} cwdIndex
 */
export function rewriteStaleIdsWithCwdIndex(toolName, args, cwdIndex) {
  if (!args || !cwdIndex) return { args, rewritten: false };
  const next = { ...args };

  if (DOC_TOOLS.has(toolName) && Array.isArray(cwdIndex.documents) && cwdIndex.documents.length) {
    const id = textValue(next.documentId || next.id);
    const known = new Set(
      cwdIndex.documents.map((doc) => textValue(doc.documentId)).filter(Boolean),
    );
    if (id && !known.has(id)) {
      const recovered = pickRecoveredDocumentId(cwdIndex.documents, next);
      if (recovered) {
        next.documentId = recovered;
        next.id = recovered;
        return { args: next, rewritten: true, recoveredId: recovered };
      }
    }
  }

  if (ASSET_TOOLS.has(toolName) && Array.isArray(cwdIndex.assets) && cwdIndex.assets.length) {
    const id = textValue(next.assetId || next.id);
    const known = new Set(
      cwdIndex.assets.map((row) => textValue(row.assetId)).filter(Boolean),
    );
    if (id && !known.has(id)) {
      const recovered = pickRecoveredAssetId(cwdIndex.assets, next);
      if (recovered) {
        next.assetId = recovered;
        next.id = recovered;
        return { args: next, rewritten: true, recoveredId: recovered };
      }
    }
  }

  return { args: next, rewritten: false };
}

export function createStudioPiTools(opts) {
  const role = opts.role ?? "user";
  const scopes =
    opts.scopes ?? [
      "read",
      "write",
      "generate",
      "messages",
      "social",
      "marketplace",
    ];
  const localHandlers = opts.localHandlers ?? {};
  const planStore = createPlanStore(opts.seedBoard || opts.seedPlan || null);
  if (typeof opts.onPlanChange === "function") {
    planStore.setOnChange(opts.onPlanChange);
  }
  const trajectory = opts.trajectory || createTrajectory();

  function attachTodo(payload) {
    const todo = planStore.formatBlock();
    if (!todo) return payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ...payload, todo };
    }
    return { result: payload, todo };
  }

  function textResultWithTodo(payload) {
    return textResult(attachTodo(payload));
  }

  const catalog = defineTool({
    name: "catalog",
    label: "Catalog",
    description:
      "List Studio tools (lean). Default = high-use starter set. Pass q or category to search. Then describe/invoke by name. Never invent studio_* as top-level Pi tools.",
    promptSnippet: "List Studio API tools (then invoke by name)",
    promptGuidelines: [
      "Only Pi tools are catalog, describe, invoke, inspect, remember, skills, plan, ask.",
      "Prefer catalog with q= (e.g. q=post, q=generate, q=move) — avoid dumping everything.",
      "Load a skill pack with skills before multi-step work.",
      "For 2+ step jobs: plan set first, update statuses as you go (todo reinjects automatically).",
      "Never call studio_* as a top-level tool name.",
    ],
    parameters: Type.Object({
      category: Type.Optional(Type.String()),
      q: Type.Optional(
        Type.String({ description: "Substring filter on name/description" }),
      ),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params) {
      const filtered = Boolean(params.category || params.q);
      let tools = listToolsForSurface("agent", { role }).map((t) => ({
        name: t.name,
        category: t.category,
        risk: t.risk,
        scope: t.scope,
        requiresApproval: t.requiresApproval,
        description: agentDescription(t),
      }));
      if (params.category) {
        tools = tools.filter((t) => t.category === params.category);
      }
      if (params.q) {
        const needle = String(params.q).toLowerCase();
        tools = tools.filter(
          (t) =>
            t.name.includes(needle) ||
            t.description.toLowerCase().includes(needle),
        );
      } else if (!params.category) {
        const starter = new Set(STARTER_TOOL_NAMES);
        tools = tools.filter((t) => starter.has(t.name));
      }
      const max = Math.min(Math.max(Number(params.limit) || 24, 1), 60);
      return textResult({
        catalogVersion: catalogVersion(),
        count: tools.length,
        filtered,
        hint: filtered
          ? undefined
          : "Starter set only. Re-call with q= or category= for more tools.",
        tools: tools.slice(0, max),
      });
    },
  });

  const describe = defineTool({
    name: "describe",
    label: "Describe",
    description:
      "Describe one Studio tool: short intent, example args, risk, approval. Use before invoke when unsure of args.",
    promptSnippet: "Inspect one Studio tool schema",
    parameters: Type.Object({
      name: Type.String({ description: "Studio tool name, e.g. studio_create_folder" }),
    }),
    async execute(_toolCallId, params) {
      const info = describeTool(params.name);
      if (!info) {
        return textResult({
          ok: false,
          error: `Unknown Studio tool: ${params.name}. Call catalog with q= to find the right name.`,
        });
      }
      const auth = authorizeTool(params.name, { surface: "agent", role, scopes });
      const example = DESCRIBE_EXAMPLES[params.name];
      const hot = HOT_SCHEMAS[params.name];
      return textResult({
        ok: auth.ok,
        ...(auth.ok ? {} : { error: auth.error }),
        tool: {
          name: info.name,
          description: agentDescription(info),
          category: info.category,
          risk: info.risk,
          scope: info.scope,
          requiresApproval: info.requiresApproval,
          inputSchema: info.inputSchema,
          ...(example ? { exampleArgs: example } : {}),
          ...(hot
            ? {
                requiredArgs: hot.required,
                ...(hot.enums ? { enums: hot.enums } : {}),
                ...(hot.oneOfGroups ? { oneOfGroups: hot.oneOfGroups } : {}),
              }
            : {}),
        },
      });
    },
  });

  const invoke = defineTool({
    name: "invoke",
    label: "Invoke",
    description:
      "Run a Studio tool: { name:\"studio_*\", args:{...} }. Results are compacted. Paid/destructive/outbound/admin → approval card (YOLO may auto-run). Pass verbose:true only if you need more fields.",
    promptSnippet: "Run a Studio tool via name + args",
    promptGuidelines: [
      "Always pass the Studio tool name in invoke.name (e.g. studio_create_folder).",
      "Pass arguments in invoke.args as a JSON object.",
      "Do the action — don't explain how unless the user asked how.",
      "Follow verifyHint in the result before claiming success.",
    ],
    parameters: Type.Object({
      name: Type.String({
        description: "Studio tool name from catalog (e.g. studio_create_folder)",
      }),
      args: Type.Optional(
        Type.Record(Type.String(), Type.Any(), {
          description: "Arguments object for that Studio tool",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, return a larger (still slimmed) observation",
        }),
      ),
    }),
    async execute(toolCallId, params, _signal, onUpdate) {
      const rawName = String(params.name || "").trim();
      const rawArgs =
        params.args && typeof params.args === "object" && !Array.isArray(params.args)
          ? params.args
          : {};
      const aliased = resolveStudioToolAlias(rawName, rawArgs);
      const toolName = aliased.toolName;
      const toolArgs = aliased.args;
      const verbose = Boolean(params.verbose);
      if (!toolName) {
        return textResult({
          ok: false,
          error:
            "invoke requires name (Studio tool id). Example: { name: \"studio_create_folder\", args: { name: \"X\" } }",
        });
      }

      const validated = validateHotToolArgs(toolName, toolArgs);
      if (!validated.ok) {
        trajectory.recordTool({
          toolName,
          ok: false,
          error: validated.error,
        });
        return textResult({
          ok: false,
          toolName,
          error: validated.error,
          example: validated.example,
          hint: "Fix args (see example) or call describe for the tool.",
        });
      }

      // Prefetched CWD index: fix invented/stale ids before tool-start hits the UI.
      let invokeArgs = validated.args;
      let preRewroteId = null;
      if (DOC_TOOLS.has(toolName) || ASSET_TOOLS.has(toolName)) {
        const fixed = rewriteStaleIdsWithCwdIndex(
          toolName,
          validated.args,
          opts.cwdIndex,
        );
        if (fixed.rewritten) {
          invokeArgs = fixed.args;
          preRewroteId = fixed.recoveredId || null;
        }
      }

      onUpdate?.({
        content: [{ type: "text", text: `Calling ${toolName}…` }],
        details: { toolName, phase: "start" },
      });

      const started = opts.onBeforeInvoke
        ? await opts.onBeforeInvoke({ toolName, args: invokeArgs })
        : null;
      const trackId = started?.toolCallId;

      try {
        const auth = authorizeTool(toolName, { surface: "agent", role, scopes });
        if (!auth.ok) {
          const fail = {
            ok: false,
            error: auth.error,
            code: auth.code,
            toolName,
            hint:
              auth.code === "unknown_tool" || /unknown/i.test(String(auth.error || ""))
                ? `Call catalog with q=${toolName.replace(/^studio_/, "").slice(0, 24)} then describe the match before retrying invoke.`
                : undefined,
          };
          trajectory.recordTool({ toolName, ok: false, error: auth.error });
          await opts.onAfterInvoke?.({
            toolCallId: trackId,
            toolName,
            ok: false,
            error: auth.error,
          });
          return textResult(fail);
        }

        if (auth.requiresApproval) {
          if (typeof opts.onApprovalRequired === "function") {
            const approval = await opts.onApprovalRequired({
              toolName,
              args: invokeArgs,
              tool: auth.tool,
              toolCallId: trackId,
            });
            if (approval != null) {
              if (!approval?.pendingApproval) {
                await opts.onAfterInvoke?.({
                  toolCallId: trackId,
                  toolName,
                  ok: true,
                  result: approval,
                });
              }
              const compact = compactObservation(toolName, approval, {
                verifyHint: approval?.pendingApproval
                  ? "Approval pending in chat — stop and wait."
                  : verifyHintFor(toolName, invokeArgs, approval) || undefined,
              });
              trajectory.recordTool({
                toolName,
                ok: true,
                pendingApproval: Boolean(approval?.pendingApproval),
                bytes: observationByteBudget(compact),
              });
              return textResultWithTodo(compact);
            }
          } else {
            const fail = {
              ok: false,
              pendingApproval: true,
              toolName,
              error: "Approval required but no approval handler configured",
            };
            trajectory.recordTool({ toolName, ok: false, error: fail.error });
            await opts.onAfterInvoke?.({
              toolCallId: trackId,
              toolName,
              ok: false,
              error: fail.error,
            });
            return textResultWithTodo(fail);
          }
        }

        let result;
        if (localHandlers[toolName]) {
          const data = await localHandlers[toolName](invokeArgs);
          result = { ok: true, toolName, data };
        } else {
          const token = await opts.getBearerToken();
          result = await invokeStudioTool(
            opts.apiBase,
            token,
            toolName,
            invokeArgs,
          );
        }
        result = salvageGenerationResult(toolName, result);

        // Stale/invented id → list CWD and auto-retry with a real id before the
        // failed step hits the chat UI ("Couldn't open script — not found").
        let recovery;
        let recoveredId = preRewroteId;
        if (preRewroteId) {
          recovery = {
            folderId: textValue(invokeArgs?.folderId || opts.cwdFolderId) || undefined,
            ...(DOC_TOOLS.has(toolName)
              ? { recoveredDocumentId: preRewroteId }
              : { recoveredAssetId: preRewroteId }),
            hint: `Auto-resolved stale id → ${preRewroteId} (CWD index). Keep using this id.`,
          };
        }
        if (
          result?.ok === false &&
          (DOC_TOOLS.has(toolName) || ASSET_TOOLS.has(toolName)) &&
          /not found/i.test(String(result?.error ?? ""))
        ) {
          const folderId = textValue(invokeArgs?.folderId || opts.cwdFolderId);
          if (folderId) {
            try {
              const token = await opts.getBearerToken();
              const listed = await invokeStudioTool(
                opts.apiBase,
                token,
                "studio_folder_contents",
                { folderId },
              );
              const raw = listed?.data && typeof listed.data === "object" ? listed.data : {};

              if (DOC_TOOLS.has(toolName)) {
                const docs = Array.isArray(raw.documents)
                  ? raw.documents
                      .map((doc) => ({
                        documentId: doc?.id ?? doc?._id,
                        title: doc?.title ?? doc?.name,
                        updatedAt: doc?.updatedAt,
                      }))
                      .filter((doc) => doc.documentId)
                  : [];
                recoveredId = pickRecoveredDocumentId(docs, invokeArgs);
                if (recoveredId) {
                  const retryArgs = {
                    ...invokeArgs,
                    documentId: recoveredId,
                    id: recoveredId,
                  };
                  result = await invokeStudioTool(
                    opts.apiBase,
                    token,
                    toolName,
                    retryArgs,
                  );
                  result = salvageGenerationResult(toolName, result);
                  if (result?.ok !== false) {
                    recovery = {
                      folderId,
                      recoveredDocumentId: recoveredId,
                      hint: `Auto-resolved stale documentId → ${recoveredId}. Keep using this id.`,
                    };
                    invokeArgs = retryArgs;
                  } else {
                    recovery = {
                      folderId,
                      documents: docs.slice(0, 10),
                      hint: "That documentId does not exist. Reuse one of these ids — do NOT create a new Script.",
                    };
                  }
                } else if (docs.length) {
                  recovery = {
                    folderId,
                    documents: docs.slice(0, 10),
                    hint: "That documentId does not exist. Reuse one of these ids with studio_update_document / studio_patch_document — do NOT create a new Script.",
                  };
                }
              }

              if (ASSET_TOOLS.has(toolName) && result?.ok === false) {
                const assets = Array.isArray(raw.assets)
                  ? raw.assets
                      .map((asset) => ({
                        assetId: asset?.id ?? asset?._id ?? asset?.assetId,
                        name: asset?.name,
                        updatedAt: asset?.updatedAt,
                      }))
                      .filter((asset) => asset.assetId)
                  : [];
                recoveredId = pickRecoveredAssetId(assets, invokeArgs);
                if (recoveredId) {
                  const retryArgs = {
                    ...invokeArgs,
                    assetId: recoveredId,
                    id: recoveredId,
                  };
                  result = await invokeStudioTool(
                    opts.apiBase,
                    token,
                    toolName,
                    retryArgs,
                  );
                  result = salvageGenerationResult(toolName, result);
                  if (result?.ok !== false) {
                    recovery = {
                      folderId,
                      recoveredAssetId: recoveredId,
                      hint: `Auto-resolved stale assetId → ${recoveredId}. Keep using this id.`,
                    };
                    invokeArgs = retryArgs;
                  }
                }
              }
            } catch {
              /* recovery is best-effort */
            }
          }
        }

        const ok = Boolean(result?.ok !== false);
        let verified;
        const autoName = ok ? autoVerifyTool(toolName) : null;
        if (autoName && !result?.pendingApproval) {
          const vArgs = autoVerifyArgs(autoName, invokeArgs, result);
          if (vArgs) {
            try {
              const token = await opts.getBearerToken();
              const vRes = await invokeStudioTool(
                opts.apiBase,
                token,
                autoName,
                vArgs,
              );
              verified = compactObservation(autoName, vRes);
            } catch (error) {
              verified = {
                ok: false,
                toolName: autoName,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }
        }

        const compact = compactObservation(toolName, result, {
          verbose,
          verifyHint: verifyHintFor(toolName, invokeArgs, result) || undefined,
          ...(verified ? { verified } : {}),
          ...(recovery ? { recovery } : {}),
        });

        trajectory.recordTool({
          toolName,
          ok,
          error: result?.error,
          bytes: observationByteBudget(compact),
        });
        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName,
          ok,
          result: compact,
          error: result?.error,
        });
        return textResultWithTodo(compact);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        trajectory.recordTool({ toolName, ok: false, error: message });
        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName,
          ok: false,
          error: message,
        });
        return textResultWithTodo({ ok: false, toolName, error: message });
      }
    },
  });

  const inspect = defineTool({
    name: "inspect",
    label: "Inspect",
    description:
      "Inspect owned Studio media with the multimodal model. Pass up to 8 assetIds; images are fetched as inline vision inputs. For videos, first use studio_pull_frames then inspect those frame assets.",
    promptSnippet: "Inspect Studio media visually",
    promptGuidelines: [
      "Use this when the task depends on what an image actually shows, not just its filename.",
      "Pass up to 8 assetIds at a time.",
      "For videos, pull frames first, then inspect the frame assets.",
    ],
    parameters: Type.Object({
      assetIds: Type.Array(Type.String(), {
        description: "Up to 8 Studio asset ids to inspect visually",
      }),
      prefer: Type.Optional(
        Type.Union([Type.Literal("thumb"), Type.Literal("full")], {
          description: "Prefer lightweight thumbnails by default",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate) {
      const assetIds = Array.isArray(params.assetIds)
        ? params.assetIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
      const prefer = params.prefer === "full" ? "full" : "thumb";
      if (!assetIds.length) {
        return textResult({
          ok: false,
          error: "inspect requires assetIds (1-8 Studio asset ids)",
        });
      }

      onUpdate?.({
        content: [{ type: "text", text: `Inspecting ${assetIds.length} asset(s)…` }],
        details: { toolName: "inspect", phase: "start", count: assetIds.length },
      });

      const started = opts.onBeforeInvoke
        ? await opts.onBeforeInvoke({ toolName: "inspect", args: { assetIds, prefer } })
        : null;
      const trackId = started?.toolCallId;

      try {
        const token = await opts.getBearerToken();
        const content = [];
        const inspected = [];
        const skipped = [];

        for (const assetId of assetIds) {
          const assetRes = await invokeStudioTool(
            opts.apiBase,
            token,
            "studio_get_asset",
            { assetId },
          );
          if (assetRes?.ok === false) {
            skipped.push({ assetId, reason: assetRes.error || "asset_lookup_failed" });
            continue;
          }

          const asset = objectValue(assetRes?.data) ?? objectValue(assetRes) ?? {};
          const kind = textValue(asset.kind) || "unknown";
          const name = textValue(asset.name) || assetId;
          const mimeType = textValue(asset.mimeType);

          if (kind === "video") {
            skipped.push({
              assetId,
              name,
              reason: "video_needs_frames",
            });
            content.push({
              type: "text",
              text: `${name} (${assetId}) is a video. Use studio_pull_frames first, then inspect the returned frame assets.`,
            });
            continue;
          }
          if (kind !== "image") {
            skipped.push({
              assetId,
              name,
              reason: kind === "audio" ? "audio_not_supported_in_v1" : "non_image_asset",
            });
            content.push({
              type: "text",
              text: `${name} (${assetId}) is ${kind || "not an image"}; inspect currently supports images only.`,
            });
            continue;
          }

          const mediaRes = await invokeStudioTool(
            opts.apiBase,
            token,
            "studio_view_media",
            { assetId },
          );
          if (mediaRes?.ok === false) {
            skipped.push({
              assetId,
              name,
              reason: mediaRes.error || "media_lookup_failed",
            });
            continue;
          }

          const media = objectValue(mediaRes?.data) ?? objectValue(mediaRes) ?? {};
          const imageUrl = pickImageUrl(media, prefer);
          if (!imageUrl) {
            skipped.push({ assetId, name, reason: "image_url_missing" });
            continue;
          }

          content.push({
            type: "text",
            text: `Asset ${name} (${assetId})\nkind: image\nmime: ${mimeType || inferImageMimeType(imageUrl)}`,
          });
          content.push(await fetchImageBlock(imageUrl, mimeType));
          inspected.push({ assetId, name, mimeType: mimeType || inferImageMimeType(imageUrl) });
        }

        if (!content.length) {
          const fail = {
            ok: false,
            toolName: "inspect",
            error: "No inspectable images found for the requested assetIds",
            inspectedCount: 0,
            skipped,
          };
          await opts.onAfterInvoke?.({
            toolCallId: trackId,
            toolName: "inspect",
            ok: false,
            result: fail,
            error: fail.error,
          });
          return textResult(fail);
        }

        const details = {
          ok: true,
          toolName: "inspect",
          inspectedCount: inspected.length,
          inspected,
          skipped,
          prefer,
        };
        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName: "inspect",
          ok: true,
          result: details,
        });
        return {
          content,
          details,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName: "inspect",
          ok: false,
          error: message,
        });
        return textResult({ ok: false, toolName: "inspect", error: message });
      }
    },
  });

  const remember = defineTool({
    name: "remember",
    label: "Remember",
    description:
      "Store a short owner-scoped pointer/pref for future turns (never cross-user). Use for WHERE a script lives (title + folder), prefs, decisions — NEVER full prompts, shot lists, or script bodies (those go in studio_create_document .md Scripts).",
    promptSnippet: "Save a short location/pref pointer — not script bodies",
    parameters: Type.Object({
      title: Type.String(),
      body: Type.String(),
      kind: Type.Optional(
        Type.Union([
          Type.Literal("note"),
          Type.Literal("preference"),
          Type.Literal("decision"),
          Type.Literal("summary"),
        ]),
      ),
      projectFolderId: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      if (typeof localHandlers.studio_agent_remember === "function") {
        const data = await localHandlers.studio_agent_remember(params);
        return textResult(data);
      }
      return textResult({
        ok: false,
        error: "remember handler not configured",
      });
    },
  });

  const skills = defineTool({
    name: "skills",
    label: "Skills",
    description:
      "List or load a Studio skill pack (ops + prompt craft). Use before multi-step or when writing image/cinematic/hypermotion prompts. Pass id for full body; omit to list; q= to filter.",
    promptSnippet: "Load a Studio skill pack",
    parameters: Type.Object({
      id: Type.Optional(
        Type.String({
          description:
            "Skill id, e.g. prompt-hypermotion, prompt-image, project-plan. Omit to list.",
        }),
      ),
      q: Type.Optional(Type.String({ description: "Filter skills by keyword" })),
      category: Type.Optional(
        Type.String({ description: "ops | prompt | workflow" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const id = textValue(params.id);
      if (id) {
        const skill = getSkill(id);
        if (!skill) {
          return textResult({
            ok: false,
            error: `Unknown skill: ${id}`,
            available: listSkills().map((s) => s.id),
          });
        }
        return textResult({ ok: true, skill });
      }
      if (params.category) {
        return textResult({
          ok: true,
          skills: listSkills(String(params.category)),
          hint: skillPromptBlock(),
        });
      }
      return textResult({
        ok: true,
        skills: matchSkills(params.q),
        hint: skillPromptBlock(),
      });
    },
  });

  const plan = defineTool({
    name: "plan",
    label: "Plan",
    description:
      "Multi todo-list board for 2+ step jobs. Actions: get | create | set (legacy create) | update_step | add_step | remove_step | set_list_status | rename_list | clear. Keep the active list updated (doing/done). Create a new list + cancelActive when direction fully changes.",
    promptSnippet: "Maintain todo lists for multi-step work",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("get"),
        Type.Literal("create"),
        Type.Literal("set"),
        Type.Literal("update"),
        Type.Literal("update_step"),
        Type.Literal("add_step"),
        Type.Literal("remove_step"),
        Type.Literal("set_list_status"),
        Type.Literal("rename_list"),
        Type.Literal("clear"),
      ]),
      goal: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      steps: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({
              id: Type.Optional(Type.String()),
              text: Type.Optional(Type.String()),
              title: Type.Optional(Type.String()),
              status: Type.Optional(Type.String()),
            }),
          ]),
        ),
      ),
      id: Type.Optional(Type.String()),
      listId: Type.Optional(Type.String()),
      stepId: Type.Optional(Type.String()),
      text: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      cancelActive: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params) {
      const action = params.action;
      if (action === "get") {
        return textResultWithTodo({
          ok: true,
          board: planStore.snapshot(),
          plan: planStore.get(),
        });
      }
      if (action === "clear") {
        return textResultWithTodo(planStore.clear());
      }
      if (action === "create" || action === "set") {
        return textResultWithTodo(
          planStore.create({
            title: params.title || params.goal || "To-do",
            steps: params.steps || [],
            cancelActive: params.cancelActive !== false,
          }),
        );
      }
      if (action === "update" || action === "update_step") {
        return textResultWithTodo(
          planStore.updateStep(
            params.listId || null,
            String(params.stepId || params.id || ""),
            String(params.status || ""),
          ),
        );
      }
      if (action === "add_step") {
        return textResultWithTodo(
          planStore.addStep(params.listId || null, params.text || ""),
        );
      }
      if (action === "remove_step") {
        return textResultWithTodo(
          planStore.removeStep(
            params.listId || null,
            String(params.stepId || params.id || ""),
          ),
        );
      }
      if (action === "set_list_status") {
        return textResultWithTodo(
          planStore.setListStatus(
            String(params.listId || params.id || ""),
            String(params.status || ""),
          ),
        );
      }
      if (action === "rename_list") {
        return textResultWithTodo(
          planStore.renameList(
            String(params.listId || params.id || ""),
            params.title || params.goal || "",
          ),
        );
      }
      return textResultWithTodo({ ok: false, error: "unknown plan action" });
    },
  });

  const ask = defineTool({
    name: "ask",
    label: "Ask",
    description:
      "Ask the user 1–4 structured questions (multi-choice + optional custom). Use only for material unknowns (aspect, subject, direction). Ends the turn until they answer in chat. Prefer assuming + estimate for noncritical gaps.",
    promptSnippet: "Ask clarifying multiple-choice questions",
    parameters: Type.Object({
      intro: Type.Optional(
        Type.String({ description: "One short line above the questions" }),
      ),
      questions: Type.Array(
        Type.Object({
          id: Type.String(),
          prompt: Type.String(),
          options: Type.Array(
            Type.Union([
              Type.String(),
              Type.Object({
                id: Type.Optional(Type.String()),
                label: Type.String(),
              }),
            ]),
          ),
          allowCustom: Type.Optional(Type.Boolean()),
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      if (typeof opts.onAskRequired !== "function") {
        return textResultWithTodo({
          ok: false,
          error: "ask UI not configured",
        });
      }
      const questions = Array.isArray(params.questions) ? params.questions : [];
      if (!questions.length) {
        return textResultWithTodo({
          ok: false,
          error: "ask requires questions[]",
        });
      }
      const result = await opts.onAskRequired({
        intro: params.intro,
        questions,
      });
      trajectory.recordTool({
        toolName: "ask",
        ok: true,
        pendingApproval: false,
        bytes: observationByteBudget(result),
      });
      return textResultWithTodo({
        ok: true,
        pendingAsk: true,
        questionId: result?.questionId,
        message: "Waiting for answers in chat — stop this turn.",
        todo: planStore.formatBlock() || undefined,
      });
    },
  });

  return [catalog, describe, invoke, inspect, remember, skills, plan, ask];
}

export { createTrajectory };
