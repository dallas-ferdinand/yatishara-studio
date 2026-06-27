import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const folderReturn = v.object({
  _id: v.id("folders"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  parentId: v.optional(v.id("folders")),
  name: v.string(),
  icon: v.string(),
  color: v.optional(v.string()),
  sortOrder: v.number(),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const list = authedQuery({
  args: {
    parentId: v.optional(v.union(v.id("folders"), v.null())),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(folderReturn),
  handler: async (ctx, args) => {
    const parentId = args.parentId === null ? undefined : args.parentId;
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", parentId),
      )
      .collect();
    return args.includeDeleted ? folders : folders.filter((folder) => !folder.deletedAt);
  },
});

export const create = authedMutation({
  args: {
    parentId: v.optional(v.id("folders")),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
  },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    if (args.parentId) {
      await requireFolderOwner(ctx, args.parentId);
    }
    const now = Date.now();
    return await ctx.db.insert("folders", {
      ownerId: ctx.user._id,
      parentId: args.parentId,
      name: args.name.trim(),
      icon: args.icon,
      color: args.color,
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authedMutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await requireFolderOwner(ctx, args.folderId);
    if (args.parentId !== undefined && args.parentId !== null) {
      if (args.parentId === folder._id) {
        throw new Error("Folder cannot be moved into itself");
      }
      await requireFolderOwner(ctx, args.parentId);
    }
    await ctx.db.patch(args.folderId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.icon !== undefined ? { icon: args.icon } : {}),
      ...(args.color !== undefined ? { color: args.color } : {}),
      ...(args.parentId !== undefined
        ? { parentId: args.parentId === null ? undefined : args.parentId }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const moveToTrash = authedMutation({
  args: { folderId: v.id("folders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    await ctx.db.patch(args.folderId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = authedMutation({
  args: { folderId: v.id("folders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    await ctx.db.patch(args.folderId, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listTrash = authedQuery({
  args: {},
  returns: v.array(folderReturn),
  handler: async (ctx) => {
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return folders.filter((folder) => folder.deletedAt !== undefined);
  },
});

async function requireFolderOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  if (folder.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return folder;
}
