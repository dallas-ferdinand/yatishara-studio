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
    /** Optional user message — boost memories whose title/body overlap tokens. */
    query: v.optional(v.string()),
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
    const limit = Math.min(Math.max(args.limit ?? 6, 1), 12);
    // Take a wider pool so summary spam cannot crowd out real notes.
    const owned = await ctx.db
      .query("agentMemories")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(120);
    const filtered = owned.filter((row) => {
      if (row.archivedAt) return false;
      // Thread summaries are injected separately — skip as generic recall noise.
      if (row.kind === "summary") return false;
      if (
        args.projectFolderId &&
        row.projectFolderId &&
        row.projectFolderId !== args.projectFolderId
      ) {
        return false;
      }
      return true;
    });

    const tokens = String(args.query ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
      .slice(0, 16);

    const now = Date.now();
    const scored = filtered.map((row) => {
      let score = row.pinned ? 1000 : 0;
      let tokenHits = 0;
      let projectHit = false;
      if (
        args.projectFolderId &&
        row.projectFolderId &&
        row.projectFolderId === args.projectFolderId
      ) {
        score += 200;
        projectHit = true;
      }
      if (tokens.length) {
        const hay = `${row.title}\n${row.body}`.toLowerCase();
        for (const t of tokens) {
          if (hay.includes(t)) {
            score += 12;
            tokenHits += 1;
          }
        }
      }
      // Real recency: up to +40 for updates in the last ~14 days.
      const ageMs = Math.max(0, now - row.updatedAt);
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      score += Math.max(0, Math.round(40 - ageDays * 3));
      if (row.kind === "preference" || row.kind === "decision") score += 15;
      return { row, score, tokenHits, projectHit };
    });

    scored.sort((a, b) => b.score - a.score || b.row.updatedAt - a.row.updatedAt);

    // Softer gate: one token hit or recent preference/decision is enough.
    const relevant = scored.filter(
      (s) =>
        s.row.pinned ||
        s.projectHit ||
        s.tokenHits >= 1 ||
        ((s.row.kind === "preference" || s.row.kind === "decision") &&
          s.score >= 20) ||
        s.score >= 36,
    );

    return relevant.slice(0, limit).map(({ row }) => ({
      _id: row._id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      pinned: row.pinned,
    }));
  },
});

/** Latest durable summary for this thread (if any). */
export const getThreadSummary = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agentMemories")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(80);
    const hit = rows.find(
      (row) =>
        !row.archivedAt &&
        row.kind === "summary" &&
        row.sourceThreadId === args.threadId,
    );
    return hit ? hit.body.slice(0, 1200) : null;
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
    const kind = args.kind ?? "note";
    const title = args.title.trim().slice(0, 200) || "Memory";
    const body = args.body.trim().slice(0, 8000);
    // Update-by-title when same kind+title exists (avoid note spam).
    const recent = await ctx.db
      .query("agentMemories")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(60);
    const existing = recent.find(
      (row) =>
        !row.archivedAt &&
        row.kind === kind &&
        row.kind !== "summary" &&
        row.title.toLowerCase() === title.toLowerCase(),
    );
    if (existing) {
      await ctx.db.patch(existing._id, {
        body,
        projectFolderId: args.projectFolderId ?? existing.projectFolderId,
        sourceThreadId: args.sourceThreadId ?? existing.sourceThreadId,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("agentMemories", {
      ownerId: args.ownerId,
      projectFolderId: args.projectFolderId,
      kind,
      title,
      body,
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
    const body = args.summary.trim().slice(0, 8000);
    const recent = await ctx.db
      .query("agentMemories")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(80);
    const existing = recent.filter(
      (row) =>
        !row.archivedAt &&
        row.kind === "summary" &&
        row.sourceThreadId === args.threadId,
    );
    // Upsert one live summary; archive older duplicates for this thread.
    for (let i = 1; i < existing.length; i++) {
      await ctx.db.patch(existing[i]!._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        title: "Thread summary",
        body,
        updatedAt: now,
      });
      return existing[0]._id;
    }
    return await ctx.db.insert("agentMemories", {
      ownerId: args.ownerId,
      kind: "summary",
      title: "Thread summary",
      body,
      sourceThreadId: args.threadId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
