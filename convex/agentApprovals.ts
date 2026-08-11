/**
 * Agent approval cards — validated args, idempotent exactly-once execution
 * via Studio /api/v1 + short-lived capability. No false-success placeholders.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  authorizeTool,
  buildStudioRequest,
  catalogVersion,
  getTool,
} from "./lib/agentTools";

const approvalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
  v.literal("executing"),
  v.literal("completed"),
  v.literal("failed"),
);

const approvalReturn = v.object({
  _id: v.id("agentApprovals"),
  threadId: v.id("agentThreads"),
  runId: v.optional(v.id("agentRuns")),
  action: v.string(),
  toolName: v.optional(v.string()),
  title: v.string(),
  summary: v.string(),
  status: approvalStatus,
  estimatedCredits: v.optional(v.number()),
  resultJson: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listForThread = authedQuery({
  args: { threadId: v.id("agentThreads") },
  returns: v.array(approvalReturn),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("agentApprovals")
      .withIndex("by_thread_and_status", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows
      .filter((row) => row.ownerId === ctx.user._id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({
        _id: row._id,
        threadId: row.threadId,
        runId: row.runId,
        action: row.action,
        toolName: row.toolName,
        title: row.title,
        summary: row.summary,
        status: row.status,
        estimatedCredits: row.estimatedCredits,
        resultJson: row.resultJson,
        error: row.error,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const decide = authedMutation({
  args: {
    approvalId: v.id("agentApprovals"),
    decision: v.union(v.literal("approve"), v.literal("deny")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get("agentApprovals", args.approvalId);
    if (!approval || approval.ownerId !== ctx.user._id) {
      throw new Error("Approval request not found");
    }
    if (approval.status !== "pending") return null;
    const now = Date.now();
    if (args.decision === "deny") {
      await ctx.db.patch(approval._id, {
        status: "denied",
        decidedAt: now,
        updatedAt: now,
      });
      await ctx.runMutation(internal.agentRuns.settleApprovalToolCall, {
        runId: approval.runId,
        approvalId: approval._id,
        status: "cancelled",
        error: "Cancelled by user",
      });
      await finalizeApprovalReply(ctx, approval, {
        outcome: "cancelled",
        assistantText: cancelledReplyForApproval(approval),
      });
      return null;
    }
    await ctx.db.patch(approval._id, {
      status: "approved",
      decidedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.agentApprovalsNode.execute, {
      approvalId: approval._id,
    });
    return null;
  },
});

export const createPending = authedMutation({
  args: {
    threadId: v.id("agentThreads"),
    action: v.string(),
    title: v.string(),
    summary: v.string(),
    payloadJson: v.string(),
    estimatedCredits: v.optional(v.number()),
    toolName: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.id("agentApprovals"),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      throw new Error("Agent thread not found");
    }
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("agentApprovals")
        .withIndex("by_idempotency", (q) =>
          q.eq("ownerId", ctx.user._id).eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();
      if (existing) return existing._id;
    }
    const toolName = args.toolName?.trim();
    if (toolName) {
      const auth = authorizeTool(toolName, {
        surface: "agent",
        role: ctx.user.role,
        scopes: ["read", "write", "generate", "messages", "social", "marketplace"],
      });
      if (!auth.ok) throw new Error(auth.error || "Tool not allowed");
      // Validate payload can build a request when HTTP-backed
      try {
        const payload = JSON.parse(args.payloadJson || "{}") as Record<
          string,
          unknown
        >;
        buildStudioRequest(toolName, payload);
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Invalid tool arguments",
        );
      }
    }
    const now = Date.now();
    const approvalId = await ctx.db.insert("agentApprovals", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      runId: args.runId,
      action: args.action.trim(),
      toolName,
      title: args.title.trim() || "Approval required",
      summary: args.summary.trim(),
      payloadJson: args.payloadJson,
      catalogVersion: catalogVersion(),
      idempotencyKey: args.idempotencyKey,
      status: "pending",
      estimatedCredits: args.estimatedCredits,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agentMessages", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      role: "approval",
      content: args.summary.trim() || args.title,
      approvalId,
      status: "complete",
      createdAt: now,
    });
    await ctx.db.patch(thread._id, { updatedAt: now });
    return approvalId;
  },
});

export const createPendingInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    toolName: v.string(),
    title: v.string(),
    summary: v.string(),
    payloadJson: v.string(),
    estimatedCredits: v.optional(v.number()),
    idempotencyKey: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("admin"),
      v.literal("super_admin"),
    ),
  },
  returns: v.id("agentApprovals"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentApprovals")
      .withIndex("by_idempotency", (q) =>
        q.eq("ownerId", args.ownerId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return existing._id;

    const auth = authorizeTool(args.toolName, {
      surface: "agent",
      role: args.role,
      scopes: ["read", "write", "generate", "messages", "social", "marketplace"],
    });
    if (!auth.ok) throw new Error(auth.error || "Tool not allowed");

    const payload = JSON.parse(args.payloadJson || "{}") as Record<string, unknown>;
    buildStudioRequest(args.toolName, payload);

    const tool = getTool(args.toolName);
    const now = Date.now();
    const approvalId = await ctx.db.insert("agentApprovals", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      runId: args.runId,
      action: args.toolName,
      toolName: args.toolName,
      title: args.title.trim() || tool?.name || "Approval required",
      summary: args.summary.trim(),
      payloadJson: args.payloadJson,
      catalogVersion: catalogVersion(),
      idempotencyKey: args.idempotencyKey,
      status: "pending",
      estimatedCredits: args.estimatedCredits,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agentMessages", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      role: "approval",
      content: args.summary.trim() || args.title,
      approvalId,
      status: "complete",
      createdAt: now,
    });
    await ctx.db.patch(args.threadId, { updatedAt: now });
    if (args.runId) {
      await ctx.db.patch(args.runId, {
        status: "awaiting_approval",
        updatedAt: now,
      });
    }
    return approvalId;
  },
});

export const claimForExecute = internalMutation({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.union(
    v.null(),
    v.object({
      ownerId: v.id("users"),
      threadId: v.id("agentThreads"),
      runId: v.optional(v.id("agentRuns")),
      action: v.string(),
      toolName: v.optional(v.string()),
      payloadJson: v.string(),
      role: v.union(
        v.literal("user"),
        v.literal("admin"),
        v.literal("super_admin"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row) return null;
    // Exactly-once: only approved → executing transition wins
    if (row.status === "executing" || row.status === "completed") {
      return null;
    }
    if (row.status !== "approved") return null;
    const user = await ctx.db.get("users", row.ownerId);
    if (!user) return null;
    const thread = await ctx.db.get("agentThreads", row.threadId);
    if (!thread || thread.ownerId !== row.ownerId) {
      throw new Error("Thread ownership changed");
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "executing",
      executionStartedAt: now,
      updatedAt: now,
    });
    return {
      ownerId: row.ownerId,
      threadId: row.threadId,
      runId: row.runId,
      action: row.action,
      toolName: row.toolName,
      payloadJson: row.payloadJson,
      role: user.role,
    };
  },
});

export const markExecuting = internalMutation({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row || row.status !== "approved") return null;
    await ctx.db.patch(row._id, {
      status: "executing",
      executionStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const loadForExecute = internalMutation({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.union(
    v.null(),
    v.object({
      ownerId: v.id("users"),
      action: v.string(),
      payloadJson: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row || (row.status !== "executing" && row.status !== "approved")) {
      return null;
    }
    return {
      ownerId: row.ownerId,
      action: row.action,
      payloadJson: row.payloadJson,
    };
  },
});

export const markCompleted = internalMutation({
  args: {
    approvalId: v.id("agentApprovals"),
    resultJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row) return null;
    if (row.status === "completed") return null; // idempotent
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "completed",
      resultJson: args.resultJson,
      updatedAt: now,
    });
    await ctx.runMutation(internal.agentRuns.settleApprovalToolCall, {
      runId: row.runId,
      approvalId: row._id,
      status: "completed",
      resultJson: args.resultJson,
    });
    await finalizeApprovalReply(ctx, row, {
      outcome: "completed",
      assistantText: successReplyForApproval(row),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    approvalId: v.id("agentApprovals"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updatedAt: now,
    });
    await ctx.runMutation(internal.agentRuns.settleApprovalToolCall, {
      runId: row.runId,
      approvalId: row._id,
      status: "failed",
      error: args.error,
    });
    await finalizeApprovalReply(ctx, row, {
      outcome: "failed",
      assistantText: failedReplyForApproval(row, args.error),
    });
    return null;
  },
});

/** Kept for any legacy direct folder creates from older agent turns. */
export const runCreateFolder = internalMutation({
  args: {
    ownerId: v.id("users"),
    parentId: v.optional(v.id("folders")),
    name: v.string(),
  },
  returns: v.object({ ok: v.boolean(), folderId: v.optional(v.id("folders")) }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const parent = args.parentId
      ? await ctx.db.get("folders", args.parentId)
      : null;
    if (args.parentId && (!parent || parent.ownerId !== args.ownerId)) {
      throw new Error("Parent folder not found");
    }
    const folderId = await ctx.db.insert("folders", {
      ownerId: args.ownerId,
      parentId: args.parentId,
      name: args.name.trim() || "New folder",
      icon: "folder",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, folderId };
  },
});

async function appendAgentAssistantMessage(
  ctx: MutationCtx,
  args: {
    ownerId: Id<"users">;
    threadId: Id<"agentThreads">;
    content: string;
  },
) {
  const now = Date.now();
  await ctx.db.insert("agentMessages", {
    ownerId: args.ownerId,
    threadId: args.threadId,
    role: "assistant",
    content: args.content,
    status: "complete",
    createdAt: now,
  });
  await ctx.db.patch(args.threadId, { updatedAt: now });
}

async function finalizeApprovalReply(
  ctx: MutationCtx,
  approval: {
    _id: Id<"agentApprovals">;
    ownerId: Id<"users">;
    threadId: Id<"agentThreads">;
    runId?: Id<"agentRuns">;
  },
  args: {
    outcome: "completed" | "failed" | "cancelled";
    assistantText: string;
  },
) {
  await appendAgentAssistantMessage(ctx, {
    ownerId: approval.ownerId,
    threadId: approval.threadId,
    content: args.assistantText,
  });
  if (!approval.runId) return;
  if (args.outcome === "completed") {
    await ctx.runMutation(internal.agentRuns.completeRun, {
      runId: approval.runId,
      assistantText: args.assistantText,
    });
    return;
  }
  if (args.outcome === "cancelled") {
    await ctx.runMutation(internal.agentRuns.cancelRunWithAssistant, {
      runId: approval.runId,
      assistantText: args.assistantText,
    });
    return;
  }
  await ctx.runMutation(internal.agentRuns.failRun, {
    runId: approval.runId,
    error: args.assistantText,
  });
}

function humanActionName(toolName?: string | null, title?: string | null) {
  if (title && !/^studio_/i.test(title)) return title.trim();
  const raw = String(toolName || title || "Action").trim();
  if (!raw) return "Action";
  const cleaned = raw.replace(/^studio_/, "").replace(/_/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function successReplyForApproval(row: {
  toolName?: string;
  title: string;
}) {
  const toolName = String(row.toolName || "");
  if (toolName === "studio_share_asset_post") {
    return "Done. Your post is live now.";
  }
  if (toolName === "studio_send_message") {
    return "Done. Your message has been sent.";
  }
  if (toolName === "studio_trash") {
    return "Done. That was moved to trash.";
  }
  return `Done. ${humanActionName(row.toolName, row.title)} is complete.`;
}

function cancelledReplyForApproval(row: {
  toolName?: string;
  title: string;
}) {
  const toolName = String(row.toolName || "");
  if (toolName === "studio_share_asset_post") {
    return "Cancelled. I didn't post it.";
  }
  if (toolName === "studio_send_message") {
    return "Cancelled. I didn't send anything.";
  }
  return `Cancelled. I didn't go through with ${humanActionName(row.toolName, row.title).toLowerCase()}.`;
}

function failedReplyForApproval(
  row: {
    toolName?: string;
    title: string;
  },
  error: string,
) {
  const base = humanActionName(row.toolName, row.title).toLowerCase();
  const message = String(error || "").trim();
  return message
    ? `I couldn't finish ${base}. ${message}`
    : `I couldn't finish ${base}.`;
}
