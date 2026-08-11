"use node";

/**
 * Studio Agent Mode turn runner — Pi worker is canonical.
 * No silent AI-SDK fallback. Mint per-user capability; Pi invokes Studio /api/v1.
 */
import { createHash, randomBytes } from "crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptAgentApiKey, requireAgentKeySecret } from "./lib/agentCrypto";
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

const CAP_PREFIX = "ysa_cap_";
const CAP_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
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
    if (!message) throw new Error("Type a message first");
    if (message.length > 12000) throw new Error("Message too long");

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
          "You need a small credit balance to use Agent Mode. Top up to continue.",
        );
      }
    }

    await ctx.runMutation(api.agentMessages.appendMessage, {
      threadId: args.threadId,
      role: "user",
      content: message,
    });

    const history: Array<{ role: string; content: string }> = await ctx.runQuery(
      internal.agentMessages.listRecentMessagesInternal,
      { threadId: args.threadId, ownerId, limit: 20 },
    );

    const memories = await ctx.runQuery(internal.agentMemory.retrieveForRun, {
      ownerId,
      limit: 12,
    });

    const runId = await ctx.runMutation(internal.agentRuns.createRun, {
      ownerId,
      threadId: args.threadId,
      userMessage: message,
      catalogVersion: "2026-08-11.1",
      usedByok,
      model: usedByok && byokProvider ? `byok:${byokProvider}` : "platform",
    });

    const capabilityToken = mintCapabilityToken();
    const tokenHash = hashToken(capabilityToken);
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
          history,
          memories,
          role,
          scopes,
          capabilityToken,
          studioApiBase: apiBase,
          callbackBase,
          workerCallbackToken: workerToken(),
          provider: byokProvider,
          usedByok,
          byokKey:
            process.env.STUDIO_AGENT_FORWARD_BYOK === "1" ? byokPlain : undefined,
          byokFallbackNote,
          catalogVersion: "2026-08-11.1",
        }),
      });

      const bodyText = await res.text();
      let body: {
        assistantText?: string;
        creditsSpent?: number;
        usedByok?: boolean;
        error?: string;
        usage?: { inputTokens?: number; outputTokens?: number };
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

      // Always bill platform LLM usage (measured tokens; TT$0.01 floor).
      // BYOK: no LLM ledger charge. Paid tools still charge via Studio API.
      let creditsSpent = 0;
      if (!usedByok) {
        const inputTokens = Math.max(
          0,
          Math.floor(Number(body.usage?.inputTokens ?? 0)),
        );
        const outputTokens = Math.max(
          0,
          Math.floor(Number(body.usage?.outputTokens ?? 0)),
        );
        creditsSpent = textCreditCost({
          inputTokens,
          outputTokens,
          textModel: "pro",
        });
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

      await ctx.runMutation(internal.agentRuns.completeRun, {
        runId,
        assistantText,
        creditsSpent,
        usedByok: Boolean(body.usedByok) || usedByok,
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
