import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { sanitizeScriptMarkdown } from "./lib/scriptMarkdown";
import { normalizeReactionEmoji } from "./lib/itemReactions";
import { previewItemsByPostId } from "./lib/postDraft";
import {
  requireFolderOwnerOrEditShare,
  requireFolderOwnerOrShare,
  requireShareEdit,
  viewerCanAccessSharedItem,
} from "./lib/studioShareAccess";

const postPreviewItem = v.object({
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  thumbnailUrl: v.optional(v.string()),
  thumbnailLqipUrl: v.optional(v.string()),
});

const documentReturn = v.object({
  _id: v.id("documents"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.id("folders"),
  title: v.string(),
  contentMarkdown: v.string(),
  kind: v.optional(v.union(v.literal("script"), v.literal("post"))),
  assetId: v.optional(v.id("assets")),
  reactionEmoji: v.optional(v.string()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  previewItems: v.optional(v.array(postPreviewItem)),
});

export const listByFolder = authedQuery({
  args: {
    folderId: v.id("folders"),
    includeDeleted: v.optional(v.boolean()),
    expiresUnix: v.optional(v.number()),
  },
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
    const previews = await previewItemsByPostId(ctx, visible, args.expiresUnix);
    // List rows omit body — open/edit loads full markdown via documents.get.
    return visible.map((doc) => ({
      ...doc,
      contentMarkdown: "",
      ...(previews.get(doc._id)?.length
        ? { previewItems: previews.get(doc._id) }
        : {}),
    }));
  },
});

export const get = authedQuery({
  // Callers pass ids from persisted tab keys / list rows. A stale or malformed
  // id must return null, not throw argument validation inside the shell render.
  args: { documentId: v.string() },
  returns: v.union(documentReturn, v.null()),
  handler: async (ctx, args) => {
    const documentId = ctx.db.normalizeId("documents", args.documentId);
    if (!documentId) return null;
    const doc = await ctx.db.get("documents", documentId);
    if (!doc || doc.deletedAt) {
      return null;
    }
    if (doc.ownerId === ctx.user._id) return doc;
    const ok = await viewerCanAccessSharedItem(
      ctx,
      ctx.user._id,
      "document",
      documentId,
    );
    return ok ? doc : null;
  },
});

export const create = authedMutation({
  args: {
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("script"), v.literal("post"))),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    await requireFolderOwnerOrEditShare(ctx, args.folderId);
    const now = Date.now();
    const title = args.title.trim();
    const kind = args.kind === "post" ? "post" : undefined;
    // Empty shells are OK for Files UI (New Script → rename → edit).
    // Agent empty Prompt/Script creates are blocked in studioApiInternal + agentSchemas.
    const contentMarkdown =
      kind === "post"
        ? String(args.contentMarkdown ?? "{}")
        : sanitizeScriptMarkdown(args.contentMarkdown ?? "");
    return await ctx.db.insert("documents", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      title,
      contentMarkdown,
      ...(kind ? { kind } : {}),
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
    if (args.contentMarkdown !== undefined && doc.kind !== "post") {
      const next = sanitizeScriptMarkdown(args.contentMarkdown).trim();
      const title = String(args.title ?? doc.title).trim();
      const prev = String(doc.contentMarkdown ?? "").trim();
      if (prev.length >= 20 && next.length < 20 && /prompt|script/i.test(title)) {
        throw new Error(
          "Refusing to clear Script/Prompt body to empty. Pass the full contentMarkdown.",
        );
      }
    }
    const nextBody =
      args.contentMarkdown === undefined
        ? undefined
        : doc.kind === "post"
          ? String(args.contentMarkdown)
          : sanitizeScriptMarkdown(args.contentMarkdown);
    await ctx.db.patch(doc._id, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(nextBody !== undefined ? { contentMarkdown: nextBody } : {}),
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
      ...(doc.kind ? { kind: doc.kind } : {}),
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

/** Ops: soft-delete by id without owner session (admin key / internal only). */
export const internalSoftDelete = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc) return null;
    await ctx.db.patch(args.documentId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Ops: rewrite Script body (sanitize bad agent markdown without owner session). */
export const internalSetContent = internalMutation({
  args: {
    documentId: v.id("documents"),
    contentMarkdown: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc) return null;
    await ctx.db.patch(args.documentId, {
      contentMarkdown: sanitizeScriptMarkdown(args.contentMarkdown),
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
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
