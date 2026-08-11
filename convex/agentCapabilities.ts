import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const roleValidator = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("super_admin"),
);

export const getUserRole = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ role: roleValidator })),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;
    return { role: user.role };
  },
});

export const authenticate = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id("agentCapabilitySessions"),
      ownerId: v.id("users"),
      threadId: v.id("agentThreads"),
      runId: v.optional(v.id("agentRuns")),
      scopes: v.array(v.string()),
      role: roleValidator,
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentCapabilitySessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row || row.revokedAt) return null;
    if (row.expiresAt <= Date.now()) return null;
    return {
      sessionId: row._id,
      ownerId: row.ownerId,
      threadId: row.threadId,
      runId: row.runId,
      scopes: row.scopes,
      role: row.role,
      expiresAt: row.expiresAt,
    };
  },
});

export const touch = internalMutation({
  args: { sessionId: v.id("agentCapabilitySessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentCapabilitySessions", args.sessionId);
    if (!row || row.revokedAt) return null;
    await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
    return null;
  },
});

export const resolveOwnerRootFolder = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const existingRoot = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.ownerId).eq("parentId", undefined),
      )
      .first();
    if (existingRoot && !existingRoot.deletedAt) {
      return existingRoot._id;
    }
    const now = Date.now();
    return await ctx.db.insert("folders", {
      ownerId: args.ownerId,
      parentId: undefined,
      name: "Workspace",
      icon: "folder",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const mint = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("agentThreads"),
    runId: v.optional(v.id("agentRuns")),
    tokenHash: v.string(),
    scopes: v.array(v.string()),
    role: roleValidator,
    expiresAt: v.number(),
  },
  returns: v.id("agentCapabilitySessions"),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("agentThreads", args.threadId);
    if (!thread || thread.ownerId !== args.ownerId) {
      throw new Error("Agent thread not found");
    }
    const now = Date.now();
    return await ctx.db.insert("agentCapabilitySessions", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      runId: args.runId,
      tokenHash: args.tokenHash,
      scopes: args.scopes,
      role: args.role,
      expiresAt: args.expiresAt,
      createdAt: now,
      lastUsedAt: now,
    });
  },
});

export const revoke = internalMutation({
  args: { sessionId: v.id("agentCapabilitySessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("agentCapabilitySessions", args.sessionId);
    if (!row) return null;
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return null;
  },
});

export const revokeForRun = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agentCapabilitySessions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      if (!row.revokedAt) {
        await ctx.db.patch(row._id, { revokedAt: now });
      }
    }
    return null;
  },
});

/**
 * Attribution-only API key row for Agent capability calls (audit / concurrency).
 * Never issued as a bearer — capability token remains the credential.
 */
export const ensureAttributionApiKey = internalMutation({
  args: {
    ownerId: v.id("users"),
    tokenHash: v.string(),
    scopes: v.array(v.string()),
  },
  returns: v.id("apiKeys"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.tokenHash))
      .unique();
    if (existing && !existing.revokedAt && existing.ownerId === args.ownerId) {
      return existing._id;
    }
    const now = Date.now();
    return await ctx.db.insert("apiKeys", {
      ownerId: args.ownerId,
      name: "Studio Agent capability",
      keyHash: args.tokenHash,
      keyPrefix: "ysa_cap_",
      scopes: args.scopes,
      createdAt: now,
      lastUsedAt: now,
    });
  },
});

/** @deprecated placeholder — hashing stays in actions via Web Crypto */
export async function ensureCapabilityTables(_ctx: MutationCtx) {
  return null as Id<"agentCapabilitySessions"> | null;
}
