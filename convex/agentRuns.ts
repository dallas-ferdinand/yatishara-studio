import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const runStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("awaiting_question"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const toolStatus = v.union(
  v.literal("started"),
  v.literal("pending_approval"),
  v.literal("pending_question"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const createRun = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    userMessage: v.string(),
    catalogVersion: v.optional(v.string()),
    usedByok: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.id("agentRuns"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentRuns", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      status: "queued",
      userMessage: args.userMessage,
      catalogVersion: args.catalogVersion,
      usedByok: args.usedByok,
      model: args.model,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.status === "cancelled") return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "running",
      startedAt: row.startedAt ?? now,
      updatedAt: now,
    });
    return null;
  },
});

export const markAwaitingApproval = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.status === "cancelled") return null;
    await ctx.db.patch(row._id, {
      status: "awaiting_approval",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markAwaitingQuestion = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.status === "cancelled") return null;
    await ctx.db.patch(row._id, {
      status: "awaiting_question",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setPlanJson = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    planJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.status === "cancelled") return null;
    await ctx.db.patch(row._id, {
      planJson: args.planJson.slice(0, 8000),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setRunCredits = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    creditsSpent: v.number(),
    usedByok: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.status === "cancelled") return null;
    await ctx.db.patch(row._id, {
      creditsSpent: Math.max(0, Math.floor(args.creditsSpent)),
      usedByok: args.usedByok ?? row.usedByok,
      model: args.model ?? row.model,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    assistantText: v.string(),
    creditsSpent: v.optional(v.number()),
    usedByok: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row) return null;
    if (row.status === "cancelled") return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "completed",
      assistantText: args.assistantText,
      creditsSpent: args.creditsSpent,
      usedByok: args.usedByok ?? row.usedByok,
      model: args.model ?? row.model,
      finishedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const failRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row) return null;
    if (row.status === "cancelled") return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error.slice(0, 1000),
      finishedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const cancelRunWithAssistant = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    assistantText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row) return null;
    if (
      row.status === "completed" ||
      row.status === "failed" ||
      row.status === "cancelled"
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "cancelled",
      assistantText: args.assistantText,
      finishedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const requestCancel = authedMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row || row.ownerId !== ctx.user._id) {
      throw new Error("Run not found");
    }
    if (
      row.status === "completed" ||
      row.status === "failed" ||
      row.status === "cancelled"
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "cancelled",
      cancelRequestedAt: now,
      finishedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const getRunInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("agentRuns"),
      ownerId: v.id("users"),
      threadId: v.id("agentThreads"),
      status: runStatus,
      cancelRequestedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentRuns", args.runId);
    if (!row) return null;
    return {
      _id: row._id,
      ownerId: row.ownerId,
      threadId: row.threadId,
      status: row.status,
      cancelRequestedAt: row.cancelRequestedAt,
    };
  },
});

export const listForThread = authedQuery({
  args: { threadId: v.id("agentThreads"), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("agentRuns"),
      status: runStatus,
      userMessage: v.string(),
      assistantText: v.optional(v.string()),
      error: v.optional(v.string()),
      creditsSpent: v.optional(v.number()),
      usedByok: v.optional(v.boolean()),
      model: v.optional(v.string()),
      planJson: v.optional(v.string()),
      createdAt: v.number(),
      finishedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      _id: row._id,
      status: row.status,
      userMessage: row.userMessage,
      assistantText: row.assistantText,
      error: row.error,
      creditsSpent: row.creditsSpent,
      usedByok: row.usedByok,
      model: row.model,
      planJson: row.planJson,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    }));
  },
});

export const listToolCallsForRun = authedQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.array(
    v.object({
      _id: v.id("agentToolCalls"),
      toolName: v.string(),
      argsJson: v.string(),
      status: toolStatus,
      resultJson: v.optional(v.string()),
      error: v.optional(v.string()),
      approvalId: v.optional(v.id("agentApprovals")),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_and_started", (q) => q.eq("runId", args.runId))
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      toolName: row.toolName,
      argsJson: row.argsJson,
      status: row.status,
      resultJson: row.resultJson,
      error: row.error,
      approvalId: row.approvalId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    }));
  },
});

export const listToolCallsForThread = authedQuery({
  args: { threadId: v.id("agentThreads"), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("agentToolCalls"),
      runId: v.id("agentRuns"),
      toolName: v.string(),
      argsJson: v.string(),
      status: toolStatus,
      resultJson: v.optional(v.string()),
      error: v.optional(v.string()),
      approvalId: v.optional(v.id("agentApprovals")),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const rows = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_thread_and_started", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    return rows
      .slice()
      .reverse()
      .map((row) => ({
        _id: row._id,
        runId: row.runId,
        toolName: row.toolName,
        argsJson: row.argsJson,
        status: row.status,
        resultJson: row.resultJson,
        error: row.error,
        approvalId: row.approvalId,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
      }));
  },
});

export const recordToolStart = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.id("agentRuns"),
    toolName: v.string(),
    argsJson: v.string(),
  },
  returns: v.id("agentToolCalls"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentToolCalls", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      runId: args.runId,
      toolName: args.toolName,
      argsJson: args.argsJson.slice(0, 20000),
      status: "started",
      startedAt: now,
    });
  },
});

export const recordToolPendingApproval = internalMutation({
  args: {
    toolCallId: v.id("agentToolCalls"),
    approvalId: v.id("agentApprovals"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentToolCalls", args.toolCallId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: "pending_approval",
      approvalId: args.approvalId,
    });
    return null;
  },
});

export const recordToolResult = internalMutation({
  args: {
    toolCallId: v.id("agentToolCalls"),
    ok: v.boolean(),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentToolCalls", args.toolCallId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: args.ok ? "completed" : "failed",
      resultJson: args.resultJson?.slice(0, 50000),
      error: args.error?.slice(0, 1000),
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const settleApprovalToolCall = internalMutation({
  args: {
    runId: v.optional(v.id("agentRuns")),
    approvalId: v.id("agentApprovals"),
    status: toolStatus,
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.runId) return null;
    const runId = args.runId;
    const rows = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_and_started", (q) => q.eq("runId", runId))
      .collect();
    const row = rows.find((item) => item.approvalId === args.approvalId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: args.status,
      resultJson: args.resultJson?.slice(0, 50000),
      error: args.error?.slice(0, 1000),
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const appendToolMessage = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    toolName: v.string(),
    content: v.string(),
    toolCallId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("streaming"),
        v.literal("complete"),
        v.literal("error"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("agentMessages", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      role: "tool",
      content: args.content.slice(0, 8000),
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      status: args.status ?? "complete",
      createdAt: now,
    });
    await ctx.db.patch(args.threadId, { updatedAt: now });
    return null;
  },
});
