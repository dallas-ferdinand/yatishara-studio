import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authedMutation } from "./lib/customFunctions";

export const appendMessage = authedMutation({
  args: {
    threadId: v.id("agentThreads"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("tool"),
      v.literal("system"),
    ),
    content: v.string(),
    attachmentsJson: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("streaming"),
        v.literal("complete"),
        v.literal("error"),
      ),
    ),
  },
  returns: v.id("agentMessages"),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      throw new Error("Agent thread not found");
    }
    const now = Date.now();
    const id = await ctx.db.insert("agentMessages", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      attachmentsJson: args.attachmentsJson,
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      status: args.status ?? "complete",
      createdAt: now,
    });
    const title =
      thread.title === "New agent chat" && args.role === "user"
        ? args.content.trim().slice(0, 60) || thread.title
        : thread.title;
    await ctx.db.patch(thread._id, { updatedAt: now, title });
    return id;
  },
});

export const getThreadOwned = internalQuery({
  args: {
    threadId: v.id("agentThreads"),
    ownerId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("agentThreads"),
      title: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== args.ownerId) return null;
    return { _id: thread._id, title: thread.title };
  },
});

export const listRecentMessagesInternal = internalQuery({
  args: {
    threadId: v.id("agentThreads"),
    ownerId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      role: v.string(),
      content: v.string(),
      attachmentsJson: v.optional(v.string()),
      toolName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== args.ownerId) return [];
    const limit = Math.min(60, Math.max(1, args.limit ?? 32));
    const rows = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    return rows
      .reverse()
      .filter(
        (row) =>
          row.role === "user" ||
          row.role === "assistant" ||
          row.role === "tool" ||
          row.role === "system",
      )
      .map((row) => ({
        role: row.role,
        content: row.content,
        attachmentsJson: row.attachmentsJson,
        toolName: row.toolName,
      }));
  },
});

export const appendMessageInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("tool"),
      v.literal("system"),
    ),
    content: v.string(),
    attachmentsJson: v.optional(v.string()),
    toolName: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  returns: v.id("agentMessages"),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== args.ownerId) {
      throw new Error("Agent thread not found");
    }
    const now = Date.now();
    const id = await ctx.db.insert("agentMessages", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      attachmentsJson: args.attachmentsJson,
      toolName: args.toolName,
      status:
        args.status === "streaming" ||
        args.status === "complete" ||
        args.status === "error"
          ? args.status
          : "complete",
      createdAt: now,
    });
    await ctx.db.patch(thread._id, { updatedAt: now });
    return id;
  },
});

export const listFoldersForOwner = internalQuery({
  args: { ownerId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("folders"),
      name: v.string(),
      parentId: v.optional(v.id("folders")),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_deleted", (q) =>
        q.eq("ownerId", args.ownerId).eq("deletedAt", undefined),
      )
      .take(80);
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      parentId: row.parentId,
    }));
  },
});

/** Walk parents from one folder — not capped like listFoldersForOwner. */
export const folderPathForOwner = internalQuery({
  args: { ownerId: v.id("users"), folderId: v.id("folders") },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      path: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const names: string[] = [];
    let cursor: Id<"folders"> | undefined = args.folderId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const row: Doc<"folders"> | null = await ctx.db.get(cursor);
      if (!row || row.ownerId !== args.ownerId || row.deletedAt) break;
      names.unshift(row.name);
      cursor = row.parentId;
    }
    if (!names.length) return null;
    return { name: names[names.length - 1]!, path: `/${names.join("/")}` };
  },
});
