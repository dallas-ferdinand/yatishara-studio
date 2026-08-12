import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { normalizeReactionEmoji } from "./lib/itemReactions";
import {
  requireFolderOwnerOrEditShare,
  requireFolderOwnerOrShare,
  requireShareEdit,
  viewerCanAccessSharedItem,
} from "./lib/studioShareAccess";

const documentReturn = v.object({
  _id: v.id("documents"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.id("folders"),
  title: v.string(),
  contentMarkdown: v.string(),
  assetId: v.optional(v.id("assets")),
  reactionEmoji: v.optional(v.string()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listByFolder = authedQuery({
  args: { folderId: v.id("folders"), includeDeleted: v.optional(v.boolean()) },
  returns: v.array(documentReturn),
  handler: async (ctx, args) => {
    await requireFolderOwnerOrShare(ctx, args.folderId, {
      allowDeleted: Boolean(args.includeDeleted),
    });
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const visible = args.includeDeleted ? docs : docs.filter((doc) => !doc.deletedAt);
    // List rows omit body — open/edit loads full markdown via documents.get.
    return visible.map((doc) => ({
      ...doc,
      contentMarkdown: "",
    }));
  },
});

export const get = authedQuery({
  args: { documentId: v.id("documents") },
  returns: v.union(documentReturn, v.null()),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc || doc.deletedAt) {
      return null;
    }
    if (doc.ownerId === ctx.user._id) return doc;
    const ok = await viewerCanAccessSharedItem(
      ctx,
      ctx.user._id,
      "document",
      args.documentId,
    );
    return ok ? doc : null;
  },
});

export const create = authedMutation({
  args: {
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    await requireFolderOwnerOrEditShare(ctx, args.folderId);
    const now = Date.now();
    const title = args.title.trim();
    // Empty shells are OK for Files UI (New Script → rename → edit).
    // Agent empty Prompt/Script creates are blocked in studioApiInternal + agentSchemas.
    return await ctx.db.insert("documents", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      title,
      contentMarkdown: args.contentMarkdown ?? "",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authedMutation({
  args: {
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireShareEdit(ctx, "document", args.documentId);
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc || doc.deletedAt) throw new Error("Document not found");
    if (args.folderId !== undefined) {
      // Moving requires ownership of destination; edit-share cannot re-home.
      if (doc.ownerId !== ctx.user._id) {
        throw new Error("Only the owner can move this document");
      }
      await requireFolderOwner(ctx, args.folderId);
    }
    if (args.contentMarkdown !== undefined) {
      const next = String(args.contentMarkdown).trim();
      const title = String(args.title ?? doc.title).trim();
      const prev = String(doc.contentMarkdown ?? "").trim();
      if (prev.length >= 20 && next.length < 20 && /prompt|script/i.test(title)) {
        throw new Error(
          "Refusing to clear Script/Prompt body to empty. Pass the full contentMarkdown.",
        );
      }
    }
    await ctx.db.patch(doc._id, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.contentMarkdown !== undefined
        ? { contentMarkdown: args.contentMarkdown }
        : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});


export const setReaction = authedMutation({
  args: {
    documentId: v.id("documents"),
    emoji: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireShareEdit(ctx, "document", args.documentId);
    const reactionEmoji = normalizeReactionEmoji(args.emoji);
    await ctx.db.patch(args.documentId, {
      reactionEmoji,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const duplicate = authedMutation({
  args: {
    documentId: v.id("documents"),
    targetFolderId: v.optional(v.id("folders")),
    title: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const doc = await requireDocumentOwner(ctx, args.documentId);
    const folderId = args.targetFolderId ?? doc.folderId;
    await requireFolderOwner(ctx, folderId);
    const now = Date.now();
    return await ctx.db.insert("documents", {
      ownerId: ctx.user._id,
      folderId,
      title: args.title?.trim() || `Copy of ${doc.title}`,
      contentMarkdown: doc.contentMarkdown,
      assetId: doc.assetId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const moveToTrash = authedMutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await requireDocumentOwner(ctx, args.documentId);
    await ctx.db.patch(doc._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = authedMutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await requireDocumentOwner(ctx, args.documentId);
    await ctx.db.patch(doc._id, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listTrash = authedQuery({
  args: {},
  returns: v.array(documentReturn),
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return docs.filter((doc) => doc.deletedAt !== undefined);
  },
});

async function requireFolderOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
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

async function requireDocumentOwner(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  documentId: Id<"documents">,
) {
  const doc = await ctx.db.get("documents", documentId);
  if (!doc) {
    throw new Error("Document not found");
  }
  if (doc.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return doc;
}
