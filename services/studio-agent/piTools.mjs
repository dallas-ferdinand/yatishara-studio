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
import { invokeStudioTool } from "../../packages/studio-tools/src/http.js";
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
 *   onPlanChange?: (snap: object) => void,
 *   onAskRequired?: (info: object) => Promise<any>,
 * }} opts
 */
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
  const planStore = createPlanStore();
  if (opts.seedPlan?.steps?.length) {
    planStore.set(opts.seedPlan.goal || "", opts.seedPlan.steps);
  }
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
      const toolName = String(params.name || "").trim();
      const toolArgs =
        params.args && typeof params.args === "object" && !Array.isArray(params.args)
          ? params.args
          : {};
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

      onUpdate?.({
        content: [{ type: "text", text: `Calling ${toolName}…` }],
        details: { toolName, phase: "start" },
      });

      const started = opts.onBeforeInvoke
        ? await opts.onBeforeInvoke({ toolName, args: validated.args })
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
              args: validated.args,
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
                  : verifyHintFor(toolName, validated.args, approval) || undefined,
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
          const data = await localHandlers[toolName](validated.args);
          result = { ok: true, toolName, data };
        } else {
          const token = await opts.getBearerToken();
          result = await invokeStudioTool(
            opts.apiBase,
            token,
            toolName,
            validated.args,
          );
        }
        result = salvageGenerationResult(toolName, result);

        const ok = Boolean(result?.ok !== false);
        let verified;
        const autoName = ok ? autoVerifyTool(toolName) : null;
        if (autoName && !result?.pendingApproval) {
          const vArgs = autoVerifyArgs(autoName, validated.args, result);
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
          verifyHint: verifyHintFor(toolName, validated.args, result) || undefined,
          ...(verified ? { verified } : {}),
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
      "Store an owner-scoped durable memory for future Agent turns (never cross-user).",
    promptSnippet: "Save a durable owner memory",
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
      "Required checklist when a job needs 2+ tool steps. Actions: get | set | update | clear. set at start; update to doing/done as you go. Latest TODO reinjects into later tool results.",
    promptSnippet: "Maintain a short todo plan for multi-step work",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("get"),
        Type.Literal("set"),
        Type.Literal("update"),
        Type.Literal("clear"),
      ]),
      goal: Type.Optional(Type.String()),
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
      status: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const action = params.action;
      if (action === "get") {
        return textResultWithTodo({ ok: true, plan: planStore.get() });
      }
      if (action === "clear") {
        return textResultWithTodo(planStore.clear());
      }
      if (action === "set") {
        const steps = params.steps || [];
        if (steps.length < 2) {
          return textResultWithTodo({
            ok: false,
            error: "plan set needs 2+ steps (skip plan for one-shot actions)",
          });
        }
        return textResultWithTodo({
          ok: true,
          plan: planStore.set(params.goal || "", steps),
        });
      }
      if (action === "update") {
        return textResultWithTodo(
          planStore.update(String(params.id || ""), String(params.status || "")),
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
