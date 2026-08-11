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
            });
            await opts.onAfterInvoke?.({
              toolCallId: trackId,
              toolName,
              ok: true,
              result: approval,
            });
            return textResult(approval);
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

  return [catalog, describe, invoke, remember];
}
