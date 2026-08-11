"use node";

/**
 * Studio Agent Mode turn runner.
 * Pi-shaped tool loop hosted in Convex (Node). Optional STUDIO_AGENT_URL
 * forwards to the dedicated Pi worker when configured.
 */
import { generateText, tool, jsonSchema, stepCountIs } from "ai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ARK_MODEL_IDS,
  arkLanguageModel,
  resolveArkModelId,
} from "./lib/byteplusArk";
import { decryptAgentApiKey } from "./lib/agentCrypto";
import {
  byokLanguageModel,
  type AgentByokProvider,
} from "./lib/agentByokModel";
import { textCreditCost } from "./lib/generationPricing";
import { makeFunctionReference } from "convex/server";

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    inputTokens: number;
    outputTokens: number;
    textModel?: "pro" | "lite" | "mini";
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const SYSTEM = [
  "You are Yatishara Studio Agent — a coding-agent-style operator for Studio.",
  "You have Studio tools only (no computer use / shell). Prefer bootstrap-style planning, then tools.",
  "For paid generation (image/video), trash, outbound posts, or destructive work: call request_approval — never claim you already ran them.",
  "Elements mode and style sheets are retired; do not steer users there.",
  "Be concise. After tools, summarize what you did and what needs approval.",
].join(" ");

/** Tools excluded from user Agent allowlist (Assist / Elements / style). */
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

function platformModelId(): string {
  return resolveArkModelId(
    process.env.GATEWAY_AGENT_MODEL_ID?.trim() || ARK_MODEL_IDS.text,
  );
}

type SendTurnResult = {
  ok: boolean;
  assistantText: string;
  creditsSpent: number;
  usedByok: boolean;
};

export const sendTurn = action({
  args: {
    threadId: v.id("agentThreads"),
    message: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    assistantText: v.string(),
    creditsSpent: v.number(),
    usedByok: v.boolean(),
  }),
  handler: async (ctx, args): Promise<SendTurnResult> => {
    const me = await ctx.runQuery(api.users.current, {});
    const ownerId = me.userId;

    const thread = await ctx.runQuery(internal.agentMessages.getThreadOwned, {
      threadId: args.threadId,
      ownerId,
    });
    if (!thread) throw new Error("Agent thread not found");

    const message = args.message.trim();
    if (!message) throw new Error("Type a message first");
    if (message.length > 12000) throw new Error("Message too long");

    await ctx.runMutation(api.agentMessages.appendMessage, {
      threadId: args.threadId,
      role: "user",
      content: message,
    });

    const history: Array<{ role: string; content: string }> = await ctx.runQuery(
      internal.agentMessages.listRecentMessagesInternal,
      { threadId: args.threadId, ownerId, limit: 20 },
    );

    const byok = await ctx.runQuery(
      internal.userAgentKeysInternal.getEncryptedForOwner,
      { ownerId },
    );

    let usedByok = false;
    let model = arkLanguageModel(platformModelId());
    let byokProvider: AgentByokProvider | null = null;
    let byokPlain: string | null = null;

    if (byok) {
      try {
        byokPlain = decryptAgentApiKey(byok.encryptedKey, byok.iv);
        byokProvider = byok.provider as AgentByokProvider;
        model = byokLanguageModel(byokProvider, byokPlain);
        usedByok = true;
      } catch (error) {
        usedByok = false;
        byokPlain = null;
        byokProvider = null;
        model = arkLanguageModel(platformModelId());
        if (byok.provider === "anthropic") {
          // Keep turn alive on platform when Anthropic compat isn't configured.
          console.warn(
            "[agent] BYOK anthropic unavailable, using platform model:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    const workerUrl = process.env.STUDIO_AGENT_URL?.trim();
    if (workerUrl) {
      try {
        const res = await fetch(`${workerUrl.replace(/\/$/, "")}/v1/turn`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.STUDIO_AGENT_WORKER_TOKEN ?? ""}`,
          },
          body: JSON.stringify({
            userId: ownerId,
            threadId: args.threadId,
            message,
            history,
            provider: byokProvider,
            usedByok,
            // Never send plaintext key to worker unless same-host trusted.
            byokKey: process.env.STUDIO_AGENT_FORWARD_BYOK === "1" ? byokPlain : undefined,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            assistantText?: string;
            creditsSpent?: number;
            usedByok?: boolean;
          };
          const assistantText =
            String(body.assistantText ?? "").trim() || "Done.";
          await ctx.runMutation(api.agentMessages.appendMessage, {
            threadId: args.threadId,
            role: "assistant",
            content: assistantText,
          });
          return {
            ok: true,
            assistantText,
            creditsSpent: body.creditsSpent ?? 0,
            usedByok: Boolean(body.usedByok) || usedByok,
          };
        }
      } catch {
        // Fall through to in-process loop.
      }
    }

    const tools = {
      list_folders: tool({
        description: "List the user's Studio folders (workspace).",
        inputSchema: jsonSchema<object>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async (): Promise<{ folders: Array<{ _id: string; name: string }> }> => {
          const folders = await ctx.runQuery(
            internal.agentMessages.listFoldersForOwner,
            { ownerId },
          );
          return { folders };
        },
      }),
      request_approval: tool({
        description:
          "Submit an approval card in chat for paid/destructive/outbound work. Required before generate_image, generate_video, trash, posts.",
        inputSchema: jsonSchema<{
          action: string;
          title: string;
          summary: string;
          payloadJson?: string;
          estimatedCredits?: number;
        }>({
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "generate_image",
                "generate_video",
                "create_folder",
                "trash",
                "post",
                "other",
              ],
            },
            title: { type: "string" },
            summary: { type: "string" },
            payloadJson: { type: "string" },
            estimatedCredits: { type: "number" },
          },
          required: ["action", "title", "summary"],
          additionalProperties: false,
        }),
        execute: async (input: {
          action: string;
          title: string;
          summary: string;
          payloadJson?: string;
          estimatedCredits?: number;
        }): Promise<{ approvalId: string; status: string }> => {
          const approvalId = await ctx.runMutation(
            api.agentApprovals.createPending,
            {
              threadId: args.threadId,
              action: input.action,
              title: input.title,
              summary: input.summary,
              payloadJson: input.payloadJson ?? "{}",
              estimatedCredits: input.estimatedCredits,
            },
          );
          return { approvalId: String(approvalId), status: "pending" };
        },
      }),
      create_folder_direct: tool({
        description:
          "Create a folder immediately (safe). Prefer for simple project scaffolding. For paid media, use request_approval instead.",
        inputSchema: jsonSchema<{ name: string; parentId?: string }>({
          type: "object",
          properties: {
            name: { type: "string" },
            parentId: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        }),
        execute: async (input: {
          name: string;
          parentId?: string;
        }): Promise<{ ok: boolean; folderId?: string }> => {
          return await ctx.runMutation(internal.agentApprovals.runCreateFolder, {
            ownerId,
            parentId: input.parentId
              ? (input.parentId as Id<"folders">)
              : undefined,
            name: input.name,
          });
        },
      }),
    };

    const result: {
      text: string;
      totalUsage?: { inputTokens?: number; outputTokens?: number };
      usage?: { inputTokens?: number; outputTokens?: number };
    } = await generateText({
      model,
      system: SYSTEM,
      messages: history.map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      })),
      tools,
      stopWhen: stepCountIs(8),
    });

    const assistantText: string = result.text.trim() || "Done.";
    await ctx.runMutation(api.agentMessages.appendMessage, {
      threadId: args.threadId,
      role: "assistant",
      content: assistantText,
    });

    let creditsSpent = 0;
    if (!usedByok) {
      const usage = result.totalUsage ?? result.usage;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      creditsSpent = textCreditCost({
        inputTokens,
        outputTokens,
        textModel: "pro",
      });
      if (creditsSpent > 0) {
        const folderId = await ctx.runMutation(
          api.folders.ensureMessagesFolderForMe,
          {},
        );
        await ctx.runMutation(chargeTextGenerationRef, {
          folderId,
          inputTokens,
          outputTokens,
          textModel: "pro",
        });
      }
    }

    return {
      ok: true,
      assistantText,
      creditsSpent,
      usedByok,
    };
  },
});

