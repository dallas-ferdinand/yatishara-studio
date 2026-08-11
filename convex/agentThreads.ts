import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
      questionId: v.optional(v.id("agentQuestions")),
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
      questionId: row.questionId,
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

export const get = authedQuery({
  args: { threadId: v.id("agentThreads") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("agentThreads"),
      title: v.string(),
      todosJson: v.optional(v.string()),
      archivedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return null;
    return {
      _id: thread._id,
      title: thread.title,
      todosJson: thread.todosJson,
      archivedAt: thread.archivedAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  },
});

export const setTodosInternal = internalMutation({
  args: {
    threadId: v.id("agentThreads"),
    todosJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread) return null;
    await ctx.db.patch(thread._id, {
      todosJson: args.todosJson.slice(0, 24000),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Cost / media / search summary for the agent info sidebar */
export const threadInsight = authedQuery({
  args: {
    threadId: v.id("agentThreads"),
    search: v.optional(v.string()),
  },
  returns: v.object({
    title: v.string(),
    turnCount: v.number(),
    creditsSpent: v.number(),
    runs: v.array(
      v.object({
        _id: v.id("agentRuns"),
        status: v.string(),
        creditsSpent: v.optional(v.number()),
        userMessage: v.string(),
        createdAt: v.number(),
        finishedAt: v.optional(v.number()),
      }),
    ),
    media: v.array(
      v.object({
        assetId: v.string(),
        kind: v.string(),
        name: v.optional(v.string()),
        toolName: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
    searchHits: v.array(
      v.object({
        _id: v.id("agentMessages"),
        role: v.string(),
        content: v.string(),
        createdAt: v.number(),
      }),
    ),
    todosJson: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      return {
        title: "",
        turnCount: 0,
        creditsSpent: 0,
        runs: [],
        media: [],
        searchHits: [],
      };
    }
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .collect();
    const ownedRuns = runs.filter((r) => r.ownerId === ctx.user._id);
    let creditsSpent = 0;
    for (const run of ownedRuns) {
      creditsSpent += Number(run.creditsSpent || 0);
    }

    const toolCalls = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_thread_and_started", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(80);

    const media: Array<{
      assetId: string;
      kind: string;
      name?: string;
      toolName?: string;
      createdAt: number;
    }> = [];
    const seen = new Set<string>();
    for (const tc of toolCalls) {
      if (!/generate_(image|video|audio)|generate_batch/i.test(tc.toolName)) continue;
      if (!tc.resultJson) continue;
      try {
        const parsed = JSON.parse(tc.resultJson) as Record<string, unknown>;
        const root =
          parsed.data && typeof parsed.data === "object"
            ? (parsed.data as Record<string, unknown>)
            : parsed;
        const push = (raw: Record<string, unknown>) => {
          const assetId = String(
            raw.assetId || raw.id || raw._id || "",
          ).trim();
          if (!assetId || seen.has(assetId)) return;
          seen.add(assetId);
          media.push({
            assetId,
            kind: String(raw.kind || "image"),
            name: typeof raw.name === "string" ? raw.name : undefined,
            toolName: tc.toolName,
            createdAt: tc.startedAt,
          });
        };
        if (Array.isArray(root.assets)) {
          for (const a of root.assets) {
            if (a && typeof a === "object") push(a as Record<string, unknown>);
          }
        }
        if (root.assetId || root.id || root._id) {
          push(root);
        }
        if (Array.isArray(root.assetIds)) {
          for (const id of root.assetIds) {
            push({ assetId: String(id), kind: "image" });
          }
        }
      } catch {
        // ignore
      }
    }

    const needle = String(args.search || "").trim().toLowerCase();
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .collect();
    const searchHits = needle
      ? messages
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              m.content.toLowerCase().includes(needle),
          )
          .slice(-40)
          .map((m) => ({
            _id: m._id,
            role: m.role,
            content: m.content.slice(0, 280),
            createdAt: m.createdAt,
          }))
      : [];

    return {
      title: thread.title,
      turnCount: ownedRuns.length,
      creditsSpent,
      runs: ownedRuns
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 40)
        .map((r) => ({
          _id: r._id,
          status: r.status,
          creditsSpent: r.creditsSpent,
          userMessage: r.userMessage.slice(0, 160),
          createdAt: r.createdAt,
          finishedAt: r.finishedAt,
        })),
      media: media.slice(0, 60),
      searchHits,
      todosJson: thread.todosJson,
    };
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
