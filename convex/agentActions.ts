"use node";

/**
 * Studio Agent Mode turn runner — Pi worker is canonical.
 * No silent AI-SDK fallback. Mint per-user capability; Pi invokes Studio /api/v1.
 */
import { randomBytes } from "crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptAgentApiKey, requireAgentKeySecret } from "./lib/agentCrypto";
import { measuredTextUsageFromGateway, textCreditCost } from "./lib/generationPricing";
import { hashApiKey } from "./lib/studioApi/crypto";
import { makeFunctionReference } from "convex/server";

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    textModel?: "pro" | "lite" | "mini";
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const CAP_PREFIX = "ysa_cap_";
const CAP_TTL_MS = 15 * 60 * 1000;

function mintCapabilityToken(): string {
  return `${CAP_PREFIX}${randomBytes(24).toString("hex")}`;
}

function studioApiBase(): string {
  const base =
    process.env.STUDIO_API_URL?.trim() ||
    process.env.CONVEX_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "";
  return base.replace(/\/$/, "");
}

function workerUrl(): string {
  return (process.env.STUDIO_AGENT_URL ?? "").trim().replace(/\/$/, "");
}

function workerToken(): string {
  return (process.env.STUDIO_AGENT_WORKER_TOKEN ?? "").trim();
}

type SendTurnResult = {
  ok: boolean;
  assistantText: string;
  creditsSpent: number;
  usedByok: boolean;
  runId?: string;
  error?: string;
  pendingApproval?: boolean;
  pendingAsk?: boolean;
};

type AgentTurnAttachment = {
  studioKind: string;
  studioId: string;
  kind?: string;
  label?: string;
  path?: string;
};

function safeText(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeAttachmentJson(input: AgentTurnAttachment[]): string | undefined {
  const cleaned = input
    .map((item) => ({
      studioKind: safeText(item?.studioKind, 40),
      studioId: safeText(item?.studioId, 80),
      kind: safeText(item?.kind, 40) || undefined,
      label: safeText(item?.label, 120) || undefined,
      path: safeText(item?.path, 240) || undefined,
    }))
    .filter((item) => item.studioKind && item.studioId);
  return cleaned.length ? JSON.stringify(cleaned) : undefined;
}

export const sendTurn = action({
  args: {
    threadId: v.id("agentThreads"),
    message: v.string(),
    autoApprove: v.optional(v.boolean()),
    seedPlanJson: v.optional(v.string()),
    /** Files pane folder open while chatting — agent defaults saves here. */
    currentFolderId: v.optional(v.id("folders")),
    attachments: v.optional(
      v.array(
        v.object({
          studioKind: v.string(),
          studioId: v.string(),
          kind: v.optional(v.string()),
          label: v.optional(v.string()),
          path: v.optional(v.string()),
        }),
      ),
    ),
  },
  returns: v.object({
    ok: v.boolean(),
    assistantText: v.string(),
    creditsSpent: v.number(),
    usedByok: v.boolean(),
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
    pendingApproval: v.optional(v.boolean()),
    pendingAsk: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<SendTurnResult> => {
    const me = await ctx.runQuery(api.users.current, {});
    const ownerId = me.userId;
    const role =
      me.role === "admin" || me.role === "super_admin" ? me.role : "user";

    const thread = await ctx.runQuery(internal.agentMessages.getThreadOwned, {
      threadId: args.threadId,
      ownerId,
    });
    if (!thread) throw new Error("Agent thread not found");

    const message = args.message.trim();
    const attachments = Array.isArray(args.attachments) ? args.attachments.slice(0, 12) : [];
    if (!message && attachments.length === 0) throw new Error("Type a message or attach something first");
    if (message.length > 12000) throw new Error("Message too long");
    const attachmentsJson = safeAttachmentJson(attachments);

    const piBase = workerUrl();
    if (!piBase) {
      const err =
        "Studio Agent worker is not configured (STUDIO_AGENT_URL). Pi is required — no silent fallback.";
      await ctx.runMutation(api.agentMessages.appendMessage, {
        threadId: args.threadId,
        role: "system",
        content: err,
      });
      return {
        ok: false,
        assistantText: err,
        creditsSpent: 0,
        usedByok: false,
        error: err,
      };
    }
    if (!workerToken()) {
      const err =
        "Studio Agent worker auth is not configured (STUDIO_AGENT_WORKER_TOKEN). Refusing fail-open.";
      await ctx.runMutation(api.agentMessages.appendMessage, {
        threadId: args.threadId,
        role: "system",
        content: err,
      });
      return {
        ok: false,
        assistantText: err,
        creditsSpent: 0,
        usedByok: false,
        error: err,
      };
    }

    const apiBase = studioApiBase();
    if (!apiBase) {
      const err =
        "STUDIO_API_URL / CONVEX_SITE_URL missing — cannot mint Studio capability for Pi.";
      return {
        ok: false,
        assistantText: err,
        creditsSpent: 0,
        usedByok: false,
        error: err,
      };
    }

    let usedByok = false;
    let byokProvider: string | null = null;
    let byokPlain: string | null = null;
    let byokFallbackNote: string | null = null;

    const byok = await ctx.runQuery(
      internal.userAgentKeysInternal.getEncryptedForOwner,
      { ownerId },
    );

    if (byok) {
      try {
        requireAgentKeySecret();
        byokPlain = decryptAgentApiKey(byok.encryptedKey, byok.iv);
        byokProvider = byok.provider;
        usedByok = true;
      } catch (error) {
        usedByok = false;
        byokPlain = null;
        byokProvider = null;
        byokFallbackNote = `BYOK unavailable (${error instanceof Error ? error.message : String(error)}). Using platform model explicitly.`;
      }
    }

    // Platform LLM turns require a credit floor before we spend provider tokens.
    // BYOK skips this (user's key); Studio tool invokes still bill via /api/v1.
    if (!usedByok) {
      const affordability = await ctx.runQuery(
        api.generation.assertTextGenerationAffordable,
        {},
      );
      if (!affordability.ok) {
        throw new Error(
          "You need a small Studio balance to use Agent Mode. Top up to continue.",
        );
      }
    }

    await ctx.runMutation(api.agentMessages.appendMessage, {
      threadId: args.threadId,
      role: "user",
      content: message,
      attachmentsJson,
    });

    const history: Array<{ role: string; content: string }> = await ctx.runQuery(
      internal.agentMessages.listRecentMessagesInternal,
      { threadId: args.threadId, ownerId, limit: 20 },
    );

    const memories = await ctx.runQuery(internal.agentMemory.retrieveForRun, {
      ownerId,
      limit: 12,
    });

    const folderRows = await ctx.runQuery(internal.agentMessages.listFoldersForOwner, {
      ownerId,
    });
    const folderById = new Map(folderRows.map((row) => [String(row._id), row]));
    const folderPathFor = (folderId?: string | null): string | undefined => {
      if (!folderId) return undefined;
      const visited = new Set<string>();
      const names: string[] = [];
      let cursor = folderId;
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const row = folderById.get(cursor);
        if (!row) break;
        names.unshift(row.name);
        cursor = row.parentId ? String(row.parentId) : "";
      }
      return names.length ? `/${names.join("/")}` : undefined;
    };

    const workingSet = [];
    for (const item of attachments) {
      const studioKind = safeText(item.studioKind, 40);
      const rawId = safeText(item.studioId, 80);
      if (!studioKind || !rawId) continue;
      try {
        if (studioKind === "asset") {
          const asset = await ctx.runQuery(internal.assistanceWorkspace.getAssetForAgent, {
            ownerId,
            assetId: rawId as Id<"assets">,
            expiresUnix: Math.floor(Date.now() / 1000) + 60 * 60,
          });
          if (asset) {
            workingSet.push({
              studioKind,
              studioId: rawId,
              kind: asset.kind,
              label: asset.name,
              mimeType: asset.mimeType,
              folderId: String(asset.folderId),
              folderPath: folderPathFor(String(asset.folderId)),
            });
          }
          continue;
        }
        if (studioKind === "folder") {
          const folder = await ctx.runQuery(internal.assistanceWorkspace.getFolderForAgent, {
            ownerId,
            folderId: rawId as Id<"folders">,
          });
          const contents = await ctx.runQuery(
            internal.assistanceWorkspace.getFolderContentsForAgent,
            {
              ownerId,
              folderId: rawId as Id<"folders">,
              expiresUnix: Math.floor(Date.now() / 1000) + 60 * 60,
            },
          );
          if (folder) {
            workingSet.push({
              studioKind,
              studioId: rawId,
              kind: "context",
              label: folder.name,
              path: folderPathFor(rawId),
              preview: {
                folders: contents.folders.slice(0, 20).map((row) => row.name),
                assets: contents.assets.slice(0, 20).map((row) => ({
                  id: String(row.id),
                  name: row.name,
                  kind: row.kind,
                })),
                documents: contents.documents.slice(0, 20).map((row) => row.title),
                elements: contents.elements.slice(0, 20).map((row) => row.name),
              },
            });
          }
          continue;
        }
        if (studioKind === "document") {
          const document = await ctx.runQuery(internal.assistanceWorkspace.getDocumentForAgent, {
            ownerId,
            documentId: rawId as Id<"documents">,
          });
          if (document) {
            workingSet.push({
              studioKind,
              studioId: rawId,
              kind: "file",
              label: document.title,
              folderId: String(document.folderId),
              folderPath: folderPathFor(String(document.folderId)),
              excerpt: document.contentMarkdown.slice(0, 1200),
            });
          }
          continue;
        }
        if (studioKind === "element") {
          const element = await ctx.runQuery(internal.assistanceWorkspace.getElementForAgent, {
            ownerId,
            elementId: rawId as Id<"elements">,
            expiresUnix: Math.floor(Date.now() / 1000) + 60 * 60,
          });
          if (element) {
            workingSet.push({
              studioKind,
              studioId: rawId,
              kind: "context",
              label: element.name,
              elementType: element.type,
              folderId: element.folderId ? String(element.folderId) : undefined,
              folderPath: element.folderId ? folderPathFor(String(element.folderId)) : undefined,
              description: element.description?.slice(0, 1200),
            });
          }
        }
      } catch {
        // best-effort hydration; skip missing or stale attachments
      }
    }

    const runId = await ctx.runMutation(internal.agentRuns.createRun, {
      ownerId,
      threadId: args.threadId,
      userMessage: message,
      catalogVersion: "2026-08-11.3",
      usedByok,
      model: usedByok && byokProvider ? `byok:${byokProvider}` : "platform",
    });

    const threadRow = await ctx.runQuery(api.agentThreads.get, {
      threadId: args.threadId,
    });
    const seedTodosJson =
      args.seedPlanJson || threadRow?.todosJson || undefined;

    const capabilityToken = mintCapabilityToken();
    const tokenHash = await hashApiKey(capabilityToken);
    const scopes = [
      "read",
      "write",
      "generate",
      "messages",
      "social",
      "marketplace",
    ];
    await ctx.runMutation(internal.agentCapabilities.mint, {
      ownerId,
      threadId: args.threadId,
      runId,
      tokenHash,
      scopes,
      role,
      expiresAt: Date.now() + CAP_TTL_MS,
    });

    await ctx.runMutation(internal.agentRuns.markRunning, { runId });

    const callbackBase = apiBase;
    const controller = new AbortController();
    const timeoutMs = Number(process.env.STUDIO_AGENT_TURN_TIMEOUT_MS || 180000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${piBase}/v1/turn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${workerToken()}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          userId: ownerId,
          threadId: args.threadId,
          runId,
          message,
          attachments,
          workingSet,
          history,
          memories,
          role,
          scopes,
          autoApprove: Boolean(args.autoApprove),
          capabilityToken,
          studioApiBase: apiBase,
          callbackBase,
          workerCallbackToken: workerToken(),
          provider: byokProvider,
          usedByok,
          byokKey:
            process.env.STUDIO_AGENT_FORWARD_BYOK === "1" ? byokPlain : undefined,
          byokFallbackNote,
          catalogVersion: "2026-08-11.3",
          seedPlanJson: args.seedPlanJson,
          seedTodosJson,
          currentFolderId: args.currentFolderId
            ? String(args.currentFolderId)
            : undefined,
          currentFolderPath: args.currentFolderId
            ? folderPathFor(String(args.currentFolderId))
            : undefined,
        }),
      });

      const bodyText = await res.text();
      let body: {
        assistantText?: string;
        creditsSpent?: number;
        usedByok?: boolean;
        error?: string;
        pendingApproval?: boolean;
        pendingAsk?: boolean;
        model?: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
          promptTokens?: number;
        };
      } = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        body = { error: bodyText.slice(0, 500) };
      }

      if (!res.ok) {
        const err =
          body.error ||
          `Pi worker HTTP ${res.status}: Agent run failed (no silent fallback).`;
        await ctx.runMutation(internal.agentRuns.failRun, {
          runId,
          error: err,
        });
        await ctx.runMutation(api.agentMessages.appendMessage, {
          threadId: args.threadId,
          role: "assistant",
          content: err,
        });
        await ctx.runMutation(internal.agentCapabilities.revokeForRun, { runId });
        return {
          ok: false,
          assistantText: err,
          creditsSpent: 0,
          usedByok,
          runId: String(runId),
          error: err,
        };
      }

      if (body.pendingApproval || body.pendingAsk) {
        // LLM already ran to reach this pause — always bill measured usage.
        let creditsSpent = 0;
        let usageJson: string | undefined;
        if (!usedByok) {
          const usage = measuredTextUsageFromGateway(body.usage ?? {});
          creditsSpent = textCreditCost({
            ...usage,
            textModel: "pro",
          });
          usageJson = JSON.stringify({ ...usage, textModel: "pro", credits: creditsSpent });
          const folderId = await ctx.runMutation(
            api.folders.ensureMessagesFolderForMe,
            {},
          );
          await ctx.runMutation(chargeTextGenerationRef, {
            folderId,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            textModel: "pro",
          });
        }
        await ctx.runMutation(internal.agentRuns.setRunCredits, {
          runId,
          creditsSpent,
          usedByok,
          model: body.model,
          usageJson,
        });
        if (body.pendingAsk) {
          await ctx.runMutation(internal.agentRuns.markAwaitingQuestion, {
            runId,
          });
        } else if (body.pendingApproval) {
          await ctx.runMutation(internal.agentRuns.markAwaitingApproval, {
            runId,
          });
        }
        await ctx.runMutation(internal.agentCapabilities.revokeForRun, { runId });
        return {
          ok: true,
          assistantText: "",
          creditsSpent,
          usedByok,
          runId: String(runId),
          pendingApproval: Boolean(body.pendingApproval),
          pendingAsk: Boolean(body.pendingAsk),
        };
      }

      const assistantText =
        String(body.assistantText ?? "").trim() ||
        (byokFallbackNote
          ? `${byokFallbackNote}\n\nDone.`
          : "Done.");

      await ctx.runMutation(api.agentMessages.appendMessage, {
        threadId: args.threadId,
        role: "assistant",
        content: assistantText,
      });

      // Always bill platform LLM usage (measured tokens; exact BytePlus COGS ×2).
      // BYOK: no LLM ledger charge. Paid tools still charge via Studio API.
      let creditsSpent = 0;
      let usageJson: string | undefined;
      if (!usedByok) {
        const usage = measuredTextUsageFromGateway(body.usage ?? {});
        creditsSpent = textCreditCost({
          ...usage,
          textModel: "pro",
        });
        usageJson = JSON.stringify({ ...usage, textModel: "pro", credits: creditsSpent });
        const folderId = await ctx.runMutation(
          api.folders.ensureMessagesFolderForMe,
          {},
        );
        await ctx.runMutation(chargeTextGenerationRef, {
          folderId,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          textModel: "pro",
        });
      }

      await ctx.runMutation(internal.agentRuns.completeRun, {
        runId,
        assistantText,
        creditsSpent,
        usedByok: Boolean(body.usedByok) || usedByok,
        usageJson,
      });
      await ctx.runMutation(internal.agentCapabilities.revokeForRun, { runId });

      // Compact long threads into durable summary occasionally
      if (history.length >= 18) {
        await ctx.runMutation(internal.agentMemory.saveThreadSummary, {
          ownerId,
          threadId: args.threadId,
          summary: `Recent focus: ${message.slice(0, 240)}\nLast reply: ${assistantText.slice(0, 500)}`,
        });
      }

      return {
        ok: true,
        assistantText,
        creditsSpent,
        usedByok: Boolean(body.usedByok) || usedByok,
        runId: String(runId),
      };
    } catch (error) {
      const err =
        error instanceof Error && error.name === "AbortError"
          ? `Pi worker timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      await ctx.runMutation(internal.agentRuns.failRun, { runId, error: err });
      await ctx.runMutation(api.agentMessages.appendMessage, {
        threadId: args.threadId,
        role: "assistant",
        content: `Agent run failed: ${err}`,
      });
      await ctx.runMutation(internal.agentCapabilities.revokeForRun, { runId });
      return {
        ok: false,
        assistantText: `Agent run failed: ${err}`,
        creditsSpent: 0,
        usedByok,
        runId: String(runId),
        error: err,
      };
    } finally {
      clearTimeout(timer);
    }
  },
});

export const retryRun = action({
  args: { runId: v.id("agentRuns") },
  returns: v.object({
    ok: v.boolean(),
    assistantText: v.string(),
    creditsSpent: v.number(),
    usedByok: v.boolean(),
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SendTurnResult> => {
    const me = await ctx.runQuery(api.users.current, {});
    const run = await ctx.runQuery(internal.agentRuns.getRunInternal, {
      runId: args.runId,
    });
    if (!run || run.ownerId !== me.userId) {
      throw new Error("Run not found");
    }
    const full = await ctx.runQuery(api.agentRuns.listForThread, {
      threadId: run.threadId,
      limit: 50,
    });
    const match = full.find((row: { _id: Id<"agentRuns">; userMessage?: string }) => row._id === args.runId);
    const message = match?.userMessage?.trim();
    if (!message) throw new Error("Original run message missing");
    return await ctx.runAction(api.agentActions.sendTurn, {
      threadId: run.threadId,
      message: `Retry previous request:\n${message}`,
    });
  },
});
