import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const memoryKind = v.union(
  v.literal("note"),
  v.literal("preference"),
  v.literal("decision"),
  v.literal("summary"),
);

const memoryReturn = v.object({
  _id: v.id("agentMemories"),
  projectFolderId: v.optional(v.id("folders")),
  kind: memoryKind,
  title: v.string(),
  body: v.string(),
  pinned: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listMine = authedQuery({
  args: {
    projectFolderId: v.optional(v.id("folders")),
    limit: v.optional(v.number()),
  },
  returns: v.array(memoryReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    let rows;
    if (args.projectFolderId) {
      const folder = await ctx.db.get("folders", args.projectFolderId);
      if (!folder || folder.ownerId !== ctx.user._id) return [];
      rows = await ctx.db
        .query("agentMemories")
        .withIndex("by_owner_and_project", (q) =>
          q.eq("ownerId", ctx.user._id).eq("projectFolderId", args.projectFolderId),
        )
        .order("desc")
        .take(limit * 2);
    } else {
      rows = await ctx.db
        .query("agentMemories")
        .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", ctx.user._id))
        .order("desc")
        .take(limit * 2);
    }
    return rows
      .filter((row) => !row.archivedAt)
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        projectFolderId: row.projectFolderId,
        kind: row.kind,
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const remember = authedMutation({
  args: {
    title: v.string(),
    body: v.string(),
    kind: v.optional(memoryKind),
    projectFolderId: v.optional(v.id("folders")),
    sourceThreadId: v.optional(v.id("agentThreads")),
    pinned: v.optional(v.boolean()),
  },
  returns: v.id("agentMemories"),
  handler: async (ctx, args) => {
    if (args.projectFolderId) {
      const folder = await ctx.db.get("folders", args.projectFolderId);
      if (!folder || folder.ownerId !== ctx.user._id) {
        throw new Error("Project folder not found");
      }
    }
    if (args.sourceThreadId) {
      const thread = await ctx.db.get("agentThreads", args.sourceThreadId);
      if (!thread || thread.ownerId !== ctx.user._id) {
        throw new Error("Thread not found");
      }
    }
    const now = Date.now();
    return await ctx.db.insert("agentMemories", {
      ownerId: ctx.user._id,
      projectFolderId: args.projectFolderId,
      kind: args.kind ?? "note",
      title: args.title.trim().slice(0, 200) || "Memory",
      body: args.body.trim().slice(0, 8000),
      pinned: args.pinned,
      sourceThreadId: args.sourceThreadId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMemory = authedMutation({
  args: {
    memoryId: v.id("agentMemories"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentMemories", args.memoryId);
    if (!row || row.ownerId !== ctx.user._id || row.archivedAt) {
      throw new Error("Memory not found");
    }
    await ctx.db.patch(row._id, {
      ...(args.title != null ? { title: args.title.trim().slice(0, 200) } : {}),
      ...(args.body != null ? { body: args.body.trim().slice(0, 8000) } : {}),
      ...(args.pinned != null ? { pinned: args.pinned } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const archiveMemory = authedMutation({
  args: { memoryId: v.id("agentMemories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentMemories", args.memoryId);
    if (!row || row.ownerId !== ctx.user._id) {
      throw new Error("Memory not found");
    }
    await ctx.db.patch(row._id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const retrieveForRun = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectFolderId: v.optional(v.id("folders")),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("agentMemories"),
      kind: memoryKind,
      title: v.string(),
      body: v.string(),
      pinned: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);
    const owned = await ctx.db
      .query("agentMemories")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(80);
    const filtered = owned.filter((row) => {
      if (row.archivedAt) return false;
      if (
        args.projectFolderId &&
        row.projectFolderId &&
        row.projectFolderId !== args.projectFolderId
      ) {
        return false;
      }
      return true;
    });
    const pinned = filtered.filter((row) => row.pinned);
    const rest = filtered.filter((row) => !row.pinned);
    return [...pinned, ...rest].slice(0, limit).map((row) => ({
      _id: row._id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      pinned: row.pinned,
    }));
  },
});

export const rememberInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    title: v.string(),
    body: v.string(),
    kind: v.optional(memoryKind),
    projectFolderId: v.optional(v.id("folders")),
    sourceThreadId: v.optional(v.id("agentThreads")),
  },
  returns: v.id("agentMemories"),
  handler: async (ctx, args) => {
    if (args.projectFolderId) {
      const folder = await ctx.db.get("folders", args.projectFolderId);
      if (!folder || folder.ownerId !== args.ownerId) {
        throw new Error("Project folder not found");
      }
    }
    const now = Date.now();
    return await ctx.db.insert("agentMemories", {
      ownerId: args.ownerId,
      projectFolderId: args.projectFolderId,
      kind: args.kind ?? "note",
      title: args.title.trim().slice(0, 200) || "Memory",
      body: args.body.trim().slice(0, 8000),
      sourceThreadId: args.sourceThreadId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const saveThreadSummary = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    summary: v.string(),
  },
  returns: v.id("agentMemories"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentMemories", {
      ownerId: args.ownerId,
      kind: "summary",
      title: `Thread summary`,
      body: args.summary.trim().slice(0, 8000),
      sourceThreadId: args.threadId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
