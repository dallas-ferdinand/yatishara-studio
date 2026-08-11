import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

/** DM-style keyword terms: split on whitespace, strip @/#. */
function searchKeywordTerms(raw: string): string[] {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[@#]+/, "").trim())
    .filter((term) => term.length > 0);
}

/** Phrase match wins; otherwise every keyword must appear (AND). */
function keywordMatchScore(haystack: string, terms: string[]): number {
  if (!terms.length) return 0;
  const h = String(haystack || "").toLowerCase();
  if (!h) return 0;
  const phrase = terms.join(" ");
  if (h.includes(phrase)) return 100 + terms.length * 10;
  if (terms.every((term) => h.includes(term))) {
    return 40 + terms.reduce((n, term) => n + (h.includes(term) ? 1 : 0), 0);
  }
  return 0;
}

function flattenTodosForSearch(todosJson?: string | null): Array<{
  id: string;
  listTitle: string;
  text: string;
  status: string;
}> {
  if (!todosJson) return [];
  try {
    const parsed = JSON.parse(todosJson) as Record<string, unknown>;
    const out: Array<{
      id: string;
      listTitle: string;
      text: string;
      status: string;
    }> = [];
    if (Array.isArray(parsed?.steps) && !Array.isArray(parsed?.lists)) {
      const listTitle = String(parsed.goal || "Plan");
      (parsed.steps as unknown[]).forEach((step, i) => {
        if (typeof step === "string") {
          out.push({
            id: `legacy-${i}`,
            listTitle,
            text: step,
            status: "pending",
          });
          return;
        }
        if (!step || typeof step !== "object") return;
        const row = step as Record<string, unknown>;
        out.push({
          id: String(row.id || `legacy-${i}`),
          listTitle,
          text: String(row.text || ""),
          status: String(row.status || "pending"),
        });
      });
      return out;
    }
    const lists = Array.isArray(parsed?.lists) ? parsed.lists : [];
    for (const list of lists) {
      if (!list || typeof list !== "object") continue;
      const row = list as Record<string, unknown>;
      const listTitle = String(row.title || "To-do");
      const listId = String(row.id || "list");
      const steps = Array.isArray(row.steps) ? row.steps : [];
      if (steps.length === 0) {
        out.push({
          id: `${listId}:title`,
          listTitle,
          text: listTitle,
          status: String(row.status || "active"),
        });
        continue;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step || typeof step !== "object") continue;
        const s = step as Record<string, unknown>;
        out.push({
          id: `${listId}:${String(s.id || i)}`,
          listTitle,
          text: String(s.text || ""),
          status: String(s.status || "pending"),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

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
    search: v.object({
      messages: v.array(
        v.object({
          _id: v.id("agentMessages"),
          role: v.string(),
          content: v.string(),
          createdAt: v.number(),
        }),
      ),
      todos: v.array(
        v.object({
          id: v.string(),
          listTitle: v.string(),
          text: v.string(),
          status: v.string(),
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
      turns: v.array(
        v.object({
          _id: v.id("agentRuns"),
          status: v.string(),
          creditsSpent: v.optional(v.number()),
          userMessage: v.string(),
          createdAt: v.number(),
        }),
      ),
    }),
    todosJson: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const emptySearch = {
      messages: [],
      todos: [],
      media: [],
      turns: [],
    };
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) {
      return {
        title: "",
        turnCount: 0,
        creditsSpent: 0,
        runs: [],
        media: [],
        searchHits: [],
        search: emptySearch,
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

    const pushAssetId = async (
      rawId: unknown,
      kindHint: string,
      name?: string,
      toolName?: string,
      createdAt?: number,
    ) => {
      const id = String(rawId || "").trim();
      if (!id || seen.has(id)) return;
      const assetId = ctx.db.normalizeId("assets", id);
      if (assetId) {
        seen.add(id);
        const asset = await ctx.db.get("assets", assetId);
        if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) return;
        media.push({
          assetId: String(assetId),
          kind: String(asset.kind || kindHint || "image"),
          name: name || asset.name,
          toolName,
          createdAt: createdAt ?? asset.createdAt,
        });
        return;
      }
      const jobId = ctx.db.normalizeId("generationJobs", id);
      if (!jobId) return;
      const job = await ctx.db.get("generationJobs", jobId);
      if (!job || job.ownerId !== ctx.user._id) return;
      const outputs = await ctx.db
        .query("generationOutputs")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .collect();
      for (const output of outputs) {
        await pushAssetId(
          output.assetId,
          kindHint,
          name,
          toolName,
          createdAt ?? job.createdAt,
        );
      }
    };

    for (const tc of toolCalls) {
      if (!/generate_(image|video|audio)|generate_batch/i.test(tc.toolName)) continue;
      if (!tc.resultJson) continue;
      const kindHint = /video/i.test(tc.toolName)
        ? "video"
        : /audio/i.test(tc.toolName)
          ? "audio"
          : "image";
      try {
        const parsed = JSON.parse(tc.resultJson) as Record<string, unknown>;
        const root =
          parsed.data && typeof parsed.data === "object"
            ? (parsed.data as Record<string, unknown>)
            : parsed;
        if (Array.isArray(root.assets)) {
          for (const a of root.assets) {
            if (!a || typeof a !== "object") continue;
            const row = a as Record<string, unknown>;
            await pushAssetId(
              row.assetId || row.id || row._id,
              String(row.kind || kindHint),
              typeof row.name === "string" ? row.name : undefined,
              tc.toolName,
              tc.startedAt,
            );
          }
        }
        if (Array.isArray(root.assetIds)) {
          for (const id of root.assetIds) {
            await pushAssetId(id, kindHint, undefined, tc.toolName, tc.startedAt);
          }
        }
        if (root.assetId) {
          await pushAssetId(root.assetId, kindHint, undefined, tc.toolName, tc.startedAt);
        } else if (root.jobId || root.id || root._id) {
          await pushAssetId(
            root.jobId || root.id || root._id,
            kindHint,
            undefined,
            tc.toolName,
            tc.startedAt,
          );
        }
      } catch {
        // ignore
      }
    }

    const terms = searchKeywordTerms(args.search || "");
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .collect();

    const searchMessages = !terms.length
      ? []
      : messages
          .filter((m) =>
            m.role === "user" ||
            m.role === "assistant" ||
            m.role === "question" ||
            m.role === "system",
          )
          .map((m) => {
            const content = String(m.content || "")
              .replace(/\s+/g, " ")
              .trim();
            const score = keywordMatchScore(content, terms);
            return score > 0
              ? {
                  score,
                  row: {
                    _id: m._id,
                    role: m.role,
                    content: content.slice(0, 280),
                    createdAt: m.createdAt,
                  },
                }
              : null;
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .sort((a, b) => b.score - a.score || b.row.createdAt - a.row.createdAt)
          .slice(0, 40)
          .map((row) => row.row);

    const searchTodos = !terms.length
      ? []
      : flattenTodosForSearch(thread.todosJson)
          .map((todo) => {
            const haystack = `${todo.listTitle} ${todo.text}`;
            const score = keywordMatchScore(haystack, terms);
            return score > 0 ? { score, row: todo } : null;
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .sort((a, b) => b.score - a.score)
          .slice(0, 40)
          .map((row) => row.row);

    const searchMedia = !terms.length
      ? []
      : media
          .map((item) => {
            const haystack = [
              item.name || "",
              item.kind || "",
              item.toolName || "",
              /attach|upload/i.test(item.toolName || "")
                ? "attachment"
                : "generation",
            ].join(" ");
            const score = keywordMatchScore(haystack, terms);
            return score > 0 ? { score, row: item } : null;
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .sort((a, b) => b.score - a.score || b.row.createdAt - a.row.createdAt)
          .slice(0, 40)
          .map((row) => row.row);

    const orderedRuns = ownedRuns
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);

    const searchTurns = !terms.length
      ? []
      : orderedRuns
          .map((run) => {
            const userMessage = String(run.userMessage || "")
              .replace(/\s+/g, " ")
              .trim();
            const score = keywordMatchScore(
              `${userMessage} ${run.status}`,
              terms,
            );
            return score > 0
              ? {
                  score,
                  row: {
                    _id: run._id,
                    status: run.status,
                    creditsSpent: run.creditsSpent,
                    userMessage: userMessage.slice(0, 160) || "(attachments)",
                    createdAt: run.createdAt,
                  },
                }
              : null;
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .sort((a, b) => b.score - a.score || b.row.createdAt - a.row.createdAt)
          .slice(0, 40)
          .map((row) => row.row);

    return {
      title: thread.title,
      turnCount: ownedRuns.length,
      creditsSpent,
      runs: orderedRuns.slice(0, 40).map((r) => ({
        _id: r._id,
        status: r.status,
        creditsSpent: r.creditsSpent,
        userMessage: r.userMessage.slice(0, 160),
        createdAt: r.createdAt,
        finishedAt: r.finishedAt,
      })),
      media: media.slice(0, 60),
      searchHits: searchMessages,
      search: {
        messages: searchMessages,
        todos: searchTodos,
        media: searchMedia,
        turns: searchTurns,
      },
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
