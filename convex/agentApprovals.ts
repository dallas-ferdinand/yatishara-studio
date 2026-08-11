import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

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
  action: v.string(),
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
        action: row.action,
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
      return null;
    }
    await ctx.db.patch(approval._id, {
      status: "approved",
      decidedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.agentApprovals.execute, {
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
  },
  returns: v.id("agentApprovals"),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      throw new Error("Agent thread not found");
    }
    const now = Date.now();
    const approvalId = await ctx.db.insert("agentApprovals", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      action: args.action.trim(),
      title: args.title.trim() || "Approval required",
      summary: args.summary.trim(),
      payloadJson: args.payloadJson,
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

export const execute = internalAction({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agentApprovals.markExecuting, {
      approvalId: args.approvalId,
    });
    try {
      const approval = await ctx.runMutation(
        internal.agentApprovals.loadForExecute,
        { approvalId: args.approvalId },
      );
      if (!approval) return null;
      const payload = JSON.parse(approval.payloadJson || "{}") as Record<
        string,
        unknown
      >;
      let result: Record<string, unknown> = { ok: true };

      if (approval.action === "generate_image" || approval.action === "generate_video") {
        const mode = approval.action === "generate_video" ? "video" : "image";
        const folderId = payload.folderId as Id<"folders"> | undefined;
        const userPrompt = String(payload.userPrompt ?? "").trim();
        if (!folderId || !userPrompt) {
          throw new Error("Missing folderId or userPrompt for generation");
        }
        // Queue via generationActions.runFlow through public action bridge.
        result = await ctx.runAction(internal.agentApprovals.runApprovedGeneration, {
          ownerId: approval.ownerId,
          folderId,
          mode,
          userPrompt,
          videoModel:
            typeof payload.videoModel === "string" ? payload.videoModel : undefined,
        });
      } else if (approval.action === "create_folder") {
        result = await ctx.runMutation(internal.agentApprovals.runCreateFolder, {
          ownerId: approval.ownerId,
          parentId: payload.parentId as Id<"folders"> | undefined,
          name: String(payload.name ?? "New folder"),
        });
      } else if (approval.action === "trash") {
        result = {
          ok: true,
          note: "Trash via Agent approval recorded; open Files to confirm items.",
          payload,
        };
      } else {
        result = { ok: true, action: approval.action, payload };
      }

      await ctx.runMutation(internal.agentApprovals.markCompleted, {
        approvalId: args.approvalId,
        resultJson: JSON.stringify(result),
      });
    } catch (error) {
      await ctx.runMutation(internal.agentApprovals.markFailed, {
        approvalId: args.approvalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  },
});

export const markExecuting = internalMutation({
  args: { approvalId: v.id("agentApprovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentApprovals", args.approvalId);
    if (!row || row.status !== "approved") return null;
    await ctx.db.patch(row._id, { status: "executing", updatedAt: Date.now() });
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
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "completed",
      resultJson: args.resultJson,
      updatedAt: now,
    });
    await appendAgentSystemMessage(ctx, {
      ownerId: row.ownerId,
      threadId: row.threadId,
      content: `Approved action completed: ${row.title}`,
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
    await appendAgentSystemMessage(ctx, {
      ownerId: row.ownerId,
      threadId: row.threadId,
      content: `Approved action failed: ${args.error.slice(0, 300)}`,
    });
    return null;
  },
});

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

export const runApprovedGeneration = internalAction({
  args: {
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    mode: v.union(v.literal("image"), v.literal("video")),
    userPrompt: v.string(),
    videoModel: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    // v1: queue intent is recorded; client Create / Agent follow-up runs generation
    // with full auth. Soft handoff payload for StudioAgentPane / Create.
    await ctx.runMutation(internal.agentApprovals.recordGenerationHandoff, {
      ownerId: args.ownerId,
      folderId: args.folderId,
      mode: args.mode,
      userPrompt: args.userPrompt,
      videoModel: args.videoModel ?? "seedance-2.5",
    });
    return {
      ok: true,
      queued: true,
      handoff: "create",
      mode: args.mode,
      folderId: args.folderId,
      userPrompt: args.userPrompt,
      videoModel: args.videoModel ?? "seedance-2.5",
      note: "Approved. Open Create to run this prompt, or ask the agent to refine it.",
    };
  },
});

export const recordGenerationHandoff = internalMutation({
  args: {
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    mode: v.union(v.literal("image"), v.literal("video")),
    userPrompt: v.string(),
    videoModel: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find most recent agent thread for owner and append a system tip.
    const threads = await ctx.db
      .query("agentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(1);
    const thread = threads[0];
    if (!thread) return null;
    await appendAgentSystemMessage(ctx, {
      ownerId: args.ownerId,
      threadId: thread._id,
      content: `Generation approved (${args.mode}). Prompt ready in Create:\n${args.userPrompt.slice(0, 500)}`,
    });
    return null;
  },
});

async function appendAgentSystemMessage(
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
    role: "system",
    content: args.content,
    status: "complete",
    createdAt: now,
  });
  await ctx.db.patch(args.threadId, { updatedAt: now });
}
