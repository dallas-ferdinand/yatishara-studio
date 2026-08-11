/**
 * Agent Mode clarifying questions — multi-choice + custom, sequential UI.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const questionStatus = v.union(
  v.literal("pending"),
  v.literal("answered"),
  v.literal("cancelled"),
);

const questionReturn = v.object({
  _id: v.id("agentQuestions"),
  threadId: v.id("agentThreads"),
  runId: v.optional(v.id("agentRuns")),
  intro: v.optional(v.string()),
  questionsJson: v.string(),
  answersJson: v.optional(v.string()),
  status: questionStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
  answeredAt: v.optional(v.number()),
});

function normalizeQuestions(raw: unknown): Array<{
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  allowCustom?: boolean;
}> {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim().slice(0, 40);
    const prompt = String(row.prompt || row.question || "").trim().slice(0, 280);
    if (!id || !prompt) continue;
    const optionsRaw = Array.isArray(row.options) ? row.options : [];
    const options = optionsRaw
      .slice(0, 6)
      .map((opt, index) => {
        if (typeof opt === "string") {
          const label = opt.trim().slice(0, 120);
          return label ? { id: `o${index + 1}`, label } : null;
        }
        if (!opt || typeof opt !== "object") return null;
        const o = opt as Record<string, unknown>;
        const oid = String(o.id || `o${index + 1}`).trim().slice(0, 40);
        const label = String(o.label || o.text || "").trim().slice(0, 120);
        return oid && label ? { id: oid, label } : null;
      })
      .filter(Boolean) as Array<{ id: string; label: string }>;
    if (options.length < 2 && !row.allowCustom) continue;
    out.push({
      id,
      prompt,
      options,
      allowCustom: row.allowCustom !== false,
    });
  }
  return out;
}

export const listForThread = authedQuery({
  args: { threadId: v.id("agentThreads") },
  returns: v.array(questionReturn),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("agentQuestions")
      .withIndex("by_thread_and_status", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows
      .filter((row) => row.ownerId === ctx.user._id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({
        _id: row._id,
        threadId: row.threadId,
        runId: row.runId,
        intro: row.intro,
        questionsJson: row.questionsJson,
        answersJson: row.answersJson,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        answeredAt: row.answeredAt,
      }));
  },
});

export const createPendingInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    intro: v.optional(v.string()),
    questionsJson: v.string(),
  },
  returns: v.id("agentQuestions"),
  handler: async (ctx, args) => {
    const questions = normalizeQuestions(JSON.parse(args.questionsJson));
    if (!questions.length) {
      throw new Error("ask requires at least one valid question with options");
    }
    const now = Date.now();
    const questionId = await ctx.db.insert("agentQuestions", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      runId: args.runId,
      intro: args.intro?.trim().slice(0, 240) || undefined,
      questionsJson: JSON.stringify(questions),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agentMessages", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      role: "question",
      content: args.intro?.trim() || "Quick question before I continue",
      questionId,
      status: "complete",
      createdAt: now,
    });
    if (args.runId) {
      await ctx.db.patch(args.runId, {
        status: "awaiting_question",
        updatedAt: now,
      });
    }
    return questionId;
  },
});

export const answer = authedMutation({
  args: {
    questionId: v.id("agentQuestions"),
    answers: v.array(
      v.object({
        questionId: v.string(),
        optionId: v.optional(v.string()),
        optionLabel: v.optional(v.string()),
        customText: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    ok: v.boolean(),
    continueMessage: v.string(),
    threadId: v.id("agentThreads"),
    planJson: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentQuestions", args.questionId);
    if (!row || row.ownerId !== ctx.user._id) {
      throw new Error("Question set not found");
    }
    if (row.status !== "pending") {
      return {
        ok: false,
        continueMessage: "",
        threadId: row.threadId,
        planJson: undefined,
      };
    }

    const questions = normalizeQuestions(JSON.parse(row.questionsJson));
    const byId = new Map(questions.map((q) => [q.id, q]));
    const cleaned = [];
    for (const ans of args.answers.slice(0, 6)) {
      const q = byId.get(String(ans.questionId || ""));
      if (!q) continue;
      const custom = String(ans.customText || "").trim().slice(0, 280);
      const optionId = String(ans.optionId || "").trim();
      const opt = q.options.find((o) => o.id === optionId);
      if (!opt && !custom) continue;
      cleaned.push({
        questionId: q.id,
        prompt: q.prompt,
        optionId: opt?.id,
        optionLabel: opt?.label || String(ans.optionLabel || "").trim() || undefined,
        customText: custom || undefined,
      });
    }
    if (cleaned.length < questions.length) {
      throw new Error("Answer every question before continuing");
    }

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "answered",
      answersJson: JSON.stringify(cleaned),
      answeredAt: now,
      updatedAt: now,
    });

    let planJson: string | undefined;
    if (row.runId) {
      const run = await ctx.db.get("agentRuns", row.runId);
      planJson = run?.planJson;
      if (run && run.status === "awaiting_question") {
        await ctx.db.patch(run._id, {
          status: "completed",
          updatedAt: now,
        });
      }
    }

    const answerLines = cleaned.map((a, i) => {
      const value = a.customText || a.optionLabel || a.optionId || "";
      return `${i + 1}. ${a.prompt} → ${value}`;
    });
    const continueMessage = planJson
      ? `Answers:\n${answerLines.join("\n")}\n\nContinue with the current TODO plan.`
      : `Answers:\n${answerLines.join("\n")}\n\nContinue.`;

    return {
      ok: true,
      continueMessage,
      threadId: row.threadId,
      planJson,
    };
  },
});

export const getInternal = internalQuery({
  args: { questionId: v.id("agentQuestions") },
  returns: v.union(questionReturn, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentQuestions", args.questionId);
    if (!row) return null;
    return {
      _id: row._id,
      threadId: row.threadId,
      runId: row.runId,
      intro: row.intro,
      questionsJson: row.questionsJson,
      answersJson: row.answersJson,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      answeredAt: row.answeredAt,
    };
  },
});

/** Format answers for Pi resume prompt */
export function formatAnswersForAgent(answersJson?: string | null): string {
  if (!answersJson) return "";
  try {
    const answers = JSON.parse(answersJson) as Array<{
      prompt?: string;
      optionLabel?: string;
      customText?: string;
    }>;
    if (!Array.isArray(answers) || !answers.length) return "";
    return answers
      .map((a, i) => {
        const value = a.customText || a.optionLabel || "";
        return `${i + 1}. ${a.prompt || "Q"} → ${value}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}
