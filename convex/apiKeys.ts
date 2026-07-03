import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  displayKeyPrefix,
  generateApiKeySecret,
  hashApiKey,
  normalizeScopes,
} from "./lib/studioApi/crypto";

const apiKeyReturn = v.object({
  _id: v.id("apiKeys"),
  _creationTime: v.number(),
  name: v.string(),
  keyPrefix: v.string(),
  scopes: v.array(v.string()),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
});

export const list = authedQuery({
  args: {},
  returns: v.array(apiKeyReturn),
  handler: async (ctx) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return keys
      .filter((key) => !key.revokedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(stripSensitiveFields);
  },
});

export const create = authedMutation({
  args: {
    name: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  returns: v.object({
    id: v.id("apiKeys"),
    key: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("API key name is required");
    }
    const scopes = normalizeScopes(args.scopes?.length ? args.scopes : ["read", "generate"]);
    const sandboxFolderId = await ensureStudioRootFolder(ctx, ctx.user._id);
    const fullKey = generateApiKeySecret();
    const keyHash = await hashApiKey(fullKey);
    const now = Date.now();
    const id = await ctx.db.insert("apiKeys", {
      ownerId: ctx.user._id,
      name,
      keyPrefix: displayKeyPrefix(fullKey),
      keyHash,
      scopes,
      sandboxFolderId,
      createdAt: now,
    });
    return {
      id,
      key: fullKey,
      keyPrefix: displayKeyPrefix(fullKey),
      name,
      scopes,
    };
  },
});

export const update = authedMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    name: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await requireApiKeyOwner(ctx, args.apiKeyId);
    if (key.revokedAt) {
      throw new Error("Cannot update a revoked API key");
    }
    await ctx.db.patch(key._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.scopes !== undefined ? { scopes: normalizeScopes(args.scopes) } : {}),
    });
    return null;
  },
});

export const revoke = authedMutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await requireApiKeyOwner(ctx, args.apiKeyId);
    if (key.revokedAt) {
      return null;
    }
    await ctx.db.patch(key._id, { revokedAt: Date.now() });
    return null;
  },
});

function stripSensitiveFields(key: Doc<"apiKeys">) {
  return {
    _id: key._id,
    _creationTime: key._creationTime,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

async function requireApiKeyOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  apiKeyId: Id<"apiKeys">,
) {
  const key = await ctx.db.get("apiKeys", apiKeyId);
  if (!key || key.ownerId !== ctx.user._id) {
    throw new Error("API key not found");
  }
  return key;
}

async function ensureStudioRootFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"folders">> {
  const existingRoot = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_parent", (q) =>
      q.eq("ownerId", userId).eq("parentId", undefined),
    )
    .first();
  if (existingRoot && !existingRoot.deletedAt) {
    return existingRoot._id;
  }
  const now = Date.now();
  return await ctx.db.insert("folders", {
    ownerId: userId,
    parentId: undefined,
    name: "Studio",
    icon: "Folder",
    color: "#22c55e",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });
}
