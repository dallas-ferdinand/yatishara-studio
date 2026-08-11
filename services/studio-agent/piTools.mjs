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

  const catalog = defineTool({
    name: "catalog",
    label: "Catalog",
    description:
      "List available Studio tools for this user (name, category, risk, requiresApproval). Call this before invoke. Filter with optional category or q. Never invent studio_* tool names as Pi tools — only catalog/describe/invoke/remember exist here.",
    promptSnippet: "List Studio API tools (then invoke by name)",
    promptGuidelines: [
      "Only Pi tools are catalog, describe, invoke, remember.",
      "To create a folder: invoke name=studio_create_folder with args { name }.",
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
      let tools = listToolsForSurface("agent", { role }).map((t) => ({
        name: t.name,
        category: t.category,
        risk: t.risk,
        scope: t.scope,
        requiresApproval: t.requiresApproval,
        description: t.description.slice(0, 160),
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
      }
      const max = Math.min(Math.max(Number(params.limit) || 80, 1), 200);
      return textResult({
        catalogVersion: catalogVersion(),
        count: tools.length,
        tools: tools.slice(0, max),
      });
    },
  });

  const describe = defineTool({
    name: "describe",
    label: "Describe",
    description:
      "Describe one Studio tool by name: schema, HTTP mapping, risk, approval rule. Use before invoke when unsure of args.",
    promptSnippet: "Inspect one Studio tool schema",
    parameters: Type.Object({
      name: Type.String({ description: "Studio tool name, e.g. studio_create_folder" }),
    }),
    async execute(_toolCallId, params) {
      const info = describeTool(params.name);
      if (!info) {
        return textResult({ ok: false, error: `Unknown Studio tool: ${params.name}` });
      }
      const auth = authorizeTool(params.name, { surface: "agent", role, scopes });
      return textResult({
        ok: auth.ok,
        ...(auth.ok ? {} : { error: auth.error }),
        tool: info,
      });
    },
  });

  const invoke = defineTool({
    name: "invoke",
    label: "Invoke",
    description:
      "Invoke a Studio tool by name with a JSON args object. Example: { name: \"studio_create_folder\", args: { name: \"My Folder\" } }. Reads/safe writes run immediately. Paid/destructive/outbound/admin tools create an approval card instead of executing.",
    promptSnippet: "Run a Studio tool via name + args",
    promptGuidelines: [
      "Always pass the Studio tool name in invoke.name (e.g. studio_create_folder).",
      "Pass arguments in invoke.args as a JSON object.",
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
    }),
    async execute(toolCallId, params, _signal, onUpdate) {
      const toolName = String(params.name || "").trim();
      const toolArgs =
        params.args && typeof params.args === "object" && !Array.isArray(params.args)
          ? params.args
          : {};
      if (!toolName) {
        return textResult({
          ok: false,
          error:
            "invoke requires name (Studio tool id). Example: { name: \"studio_create_folder\", args: { name: \"X\" } }",
        });
      }

      onUpdate?.({
        content: [{ type: "text", text: `Calling ${toolName}…` }],
        details: { toolName, phase: "start" },
      });

      const started = opts.onBeforeInvoke
        ? await opts.onBeforeInvoke({ toolName, args: toolArgs })
        : null;
      const trackId = started?.toolCallId;

      try {
        const auth = authorizeTool(toolName, { surface: "agent", role, scopes });
        if (!auth.ok) {
          const fail = { ok: false, error: auth.error, code: auth.code, toolName };
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
              args: toolArgs,
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
              return textResult(approval);
            }
          }
          const fail = {
            ok: false,
            pendingApproval: true,
            toolName,
            error: "Approval required but no approval handler configured",
          };
          await opts.onAfterInvoke?.({
            toolCallId: trackId,
            toolName,
            ok: false,
            error: fail.error,
          });
          return textResult(fail);
        }

        let result;
        if (localHandlers[toolName]) {
          const data = await localHandlers[toolName](toolArgs);
          result = { ok: true, toolName, data };
        } else {
          const token = await opts.getBearerToken();
          result = await invokeStudioTool(
            opts.apiBase,
            token,
            toolName,
            toolArgs,
          );
        }

        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName,
          ok: Boolean(result?.ok !== false),
          result,
          error: result?.error,
        });
        return textResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await opts.onAfterInvoke?.({
          toolCallId: trackId,
          toolName,
          ok: false,
          error: message,
        });
        return textResult({ ok: false, toolName, error: message });
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

  return [catalog, describe, invoke, inspect, remember];
}
