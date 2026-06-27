import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const elementType = v.union(
  v.literal("character"),
  v.literal("prop"),
  v.literal("location"),
  v.literal("doc"),
);

const elementReturn = v.object({
  _id: v.id("elements"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.optional(v.id("folders")),
  type: elementType,
  name: v.string(),
  description: v.optional(v.string()),
  sourceAssetIds: v.array(v.id("assets")),
  sourceDocumentId: v.optional(v.id("documents")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const list = authedQuery({
  args: {
    type: v.optional(elementType),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(elementReturn),
  handler: async (ctx, args) => {
    const elements = args.type !== undefined
      ? await listByType(ctx, args.type)
      : await ctx.db
          .query("elements")
          .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
          .collect();
    return args.includeDeleted ? elements : elements.filter((element) => !element.deletedAt);
  },
});

async function listByType(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  type: "character" | "prop" | "location" | "doc",
) {
  return await ctx.db
    .query("elements")
    .withIndex("by_owner_and_type", (q) =>
      q.eq("ownerId", ctx.user._id).eq("type", type),
    )
    .collect();
}

export const create = authedMutation({
  args: {
    type: elementType,
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    sourceAssetIds: v.array(v.id("assets")),
    sourceDocumentId: v.optional(v.id("documents")),
  },
  returns: v.id("elements"),
  handler: async (ctx, args) => {
    if (args.folderId) {
      await requireFolderOwner(ctx, args.folderId);
    }
    for (const assetId of args.sourceAssetIds) {
      await requireAssetOwner(ctx, assetId);
    }
    if (args.sourceDocumentId) {
      await requireDocumentOwner(ctx, args.sourceDocumentId);
    }
    const now = Date.now();
    return await ctx.db.insert("elements", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      type: args.type,
      name: args.name.trim(),
      description: args.description,
      sourceAssetIds: args.sourceAssetIds,
      sourceDocumentId: args.sourceDocumentId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authedMutation({
  args: {
    elementId: v.id("elements"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    sourceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceDocumentId: v.optional(v.id("documents")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await requireElementOwner(ctx, args.elementId);
    if (args.folderId !== undefined) {
      await requireFolderOwner(ctx, args.folderId);
    }
    if (args.sourceAssetIds !== undefined) {
      for (const assetId of args.sourceAssetIds) {
        await requireAssetOwner(ctx, assetId);
      }
    }
    if (args.sourceDocumentId !== undefined) {
      await requireDocumentOwner(ctx, args.sourceDocumentId);
    }
    await ctx.db.patch(element._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      ...(args.sourceAssetIds !== undefined ? { sourceAssetIds: args.sourceAssetIds } : {}),
      ...(args.sourceDocumentId !== undefined
        ? { sourceDocumentId: args.sourceDocumentId }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const moveToTrash = authedMutation({
  args: { elementId: v.id("elements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await requireElementOwner(ctx, args.elementId);
    await ctx.db.patch(element._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = authedMutation({
  args: { elementId: v.id("elements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await requireElementOwner(ctx, args.elementId);
    await ctx.db.patch(element._id, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function requireElementOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  elementId: Id<"elements">,
) {
  const element = await ctx.db.get("elements", elementId);
  if (!element || element.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return element;
}

async function requireFolderOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
}

async function requireAssetOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  assetId: Id<"assets">,
) {
  const asset = await ctx.db.get("assets", assetId);
  if (!asset || asset.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
}

async function requireDocumentOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  documentId: Id<"documents">,
) {
  const document = await ctx.db.get("documents", documentId);
  if (!document || document.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
}
