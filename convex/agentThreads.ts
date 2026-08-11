import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const listMine = authedQuery({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      _id: v.id("agentThreads"),
      title: v.string(),
      archivedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("agentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .order("desc")
      .take(120);
    const rows = args.includeArchived
      ? all
      : all.filter((row) => row.archivedAt == null);
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return rows.slice(0, 80).map((row) => ({
      _id: row._id,
      title: row.title,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});
export const listMessages = authedQuery({
  args: { threadId: v.id("agentThreads") },
  returns: v.array(
    v.object({
      _id: v.id("agentMessages"),
      role: v.string(),
      content: v.string(),
      attachmentsJson: v.optional(v.string()),
      toolName: v.optional(v.string()),
      approvalId: v.optional(v.id("agentApprovals")),
      status: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      role: row.role,
      content: row.content,
      attachmentsJson: row.attachmentsJson,
      toolName: row.toolName,
      approvalId: row.approvalId,
      status: row.status,
      createdAt: row.createdAt,
    }));
  },
});

export const create = authedMutation({
  args: { title: v.optional(v.string()) },
  returns: v.id("agentThreads"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentThreads", {
      ownerId: ctx.user._id,
      title: (args.title ?? "New agent chat").trim() || "New agent chat",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = authedMutation({
  args: { threadId: v.id("agentThreads"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      throw new Error("Agent thread not found");
    }
    await ctx.db.patch(thread._id, {
      title: args.title.trim() || thread.title,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const archive = authedMutation({
  args: { threadId: v.id("agentThreads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      throw new Error("Agent thread not found");
    }
    await ctx.db.patch(thread._id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});
