import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { buildAssetPath } from "./lib/bunny";
import {
  assertReferenceCount,
  referenceAssetIdsFromInput,
} from "./lib/elementAssetModel";
import { inferElementSourceMode } from "./lib/elementSheetGuides";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { normalizeReactionEmoji } from "./lib/itemReactions";
import { applyStorageBytesDelta } from "./lib/storageBilling";
import {
  requireFolderOwnerOrEditShare,
  requireShareEdit,
  viewerCanAccessSharedItem,
} from "./lib/studioShareAccess";
import { composerElementTag } from "./lib/seedanceReferences";

const elementType = v.union(
  v.literal("character"),
  v.literal("prop"),
  v.literal("location"),
  v.literal("doc"),
  v.literal("style_sheet"),
);

const elementRenderMode = v.union(
  v.literal("photoreal"),
  v.literal("illustrated_2d"),
  v.literal("illustrated_3d"),
  v.literal("mixed"),
);

const elementSourceMode = v.union(v.literal("photographic"), v.literal("designed"));

const elementReturn = v.object({
  _id: v.id("elements"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.optional(v.id("folders")),
  type: elementType,
  name: v.string(),
  description: v.optional(v.string()),
  sourceMode: v.optional(elementSourceMode),
  sourceAssetIds: v.array(v.id("assets")),
  referenceAssetIds: v.optional(v.array(v.id("assets"))),
  sheetAssetId: v.optional(v.id("assets")),
  styleRules: v.optional(v.string()),
  renderMode: v.optional(elementRenderMode),
  builtAt: v.optional(v.number()),
  sourceDocumentId: v.optional(v.id("documents")),
  reactionEmoji: v.optional(v.string()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const list = authedQuery({
  args: {
    type: v.optional(elementType),
    folderId: v.optional(v.id("folders")),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(elementReturn),
  handler: async (ctx, args) => {
    let elements =
      args.type !== undefined
        ? await listByType(ctx, args.type)
        : await ctx.db
            .query("elements")
            .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
            .collect();
    if (args.folderId !== undefined) {
      elements = elements.filter((element) => element.folderId === args.folderId);
    }
    return args.includeDeleted ? elements : elements.filter((element) => !element.deletedAt);
  },
});

async function listByType(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  type: "character" | "prop" | "location" | "doc" | "style_sheet",
) {
  return await ctx.db
    .query("elements")
    .withIndex("by_owner_and_type", (q) =>
      q.eq("ownerId", ctx.user._id).eq("type", type),
    )
    .collect();
}

export const get = authedQuery({
  args: { elementId: v.id("elements") },
  returns: v.union(v.null(), elementReturn),
  handler: async (ctx, args) => {
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.deletedAt) {
      return null;
    }
    if (element.ownerId === ctx.user._id) return element;
    const ok = await viewerCanAccessSharedItem(
      ctx,
      ctx.user._id,
      "element",
      args.elementId,
    );
    return ok ? element : null;
  },
});

async function assertUniqueElementName(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  name: string,
  exceptId?: Id<"elements">,
) {
  const tag = composerElementTag(name);
  if (!tag || tag === "ref") {
    throw new Error("Give the element a unique title (letters, numbers, dashes).");
  }
  const existing = await ctx.db
    .query("elements")
    .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
    .collect();
  const clash = existing.find(
    (row) =>
      !row.deletedAt &&
      row._id !== exceptId &&
      row.type !== "style_sheet" &&
      composerElementTag(row.name) === tag,
  );
  if (clash) {
    throw new Error(`@${tag} is already used. Pick a unique title.`);
  }
  return tag;
}

export const listStyleSheets = authedQuery({
  args: {},
  returns: v.array(elementReturn),
  handler: async (ctx) => {
    const sheets = await listByType(ctx, "style_sheet");
    return sheets.filter((sheet) => !sheet.deletedAt);
  },
});

export const create = authedMutation({
  args: {
    type: elementType,
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceDocumentId: v.optional(v.id("documents")),
    sourceMode: v.optional(elementSourceMode),
    styleRules: v.optional(v.string()),
    renderMode: v.optional(elementRenderMode),
  },
  returns: v.id("elements"),
  handler: async (ctx, args) => {
    if (args.folderId) {
      await requireFolderOwnerOrEditShare(ctx, args.folderId);
    }
    const referenceAssetIds = referenceAssetIdsFromInput(args);
    assertReferenceCount(referenceAssetIds.length);
    for (const assetId of referenceAssetIds) {
      await requireAssetOwner(ctx, assetId);
    }
    if (args.sourceDocumentId) {
      await requireDocumentOwner(ctx, args.sourceDocumentId);
    }
    if (
      args.type !== "style_sheet" &&
      args.type !== "doc" &&
      referenceAssetIds.length < 1
    ) {
      throw new Error("Attach an image or video to this element.");
    }
    const now = Date.now();
    const name =
      args.type === "style_sheet"
        ? args.name.trim()
        : await assertUniqueElementName(ctx, args.name);
    const sourceMode =
      args.sourceMode ??
      inferElementSourceMode({
        type: args.type,
        imageRefCount: referenceAssetIds.length,
      });
    return await ctx.db.insert("elements", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      type: args.type,
      name,
      description: args.description,
      sourceMode,
      sourceAssetIds: referenceAssetIds,
      referenceAssetIds,
      sourceDocumentId: args.sourceDocumentId,
      styleRules: args.type === "style_sheet" ? args.styleRules : undefined,
      renderMode: args.type === "style_sheet" ? args.renderMode : undefined,
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
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceDocumentId: v.optional(v.id("documents")),
    styleRules: v.optional(v.string()),
    renderMode: v.optional(elementRenderMode),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireShareEdit(ctx, "element", args.elementId);
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.deletedAt) throw new Error("Element not found");
    if (args.folderId !== undefined) {
      if (element.ownerId !== ctx.user._id) {
        throw new Error("Only the owner can move this element");
      }
      await requireFolderOwner(ctx, args.folderId);
    }
    const nextReferenceAssetIds =
      args.referenceAssetIds !== undefined
        ? args.referenceAssetIds
        : args.sourceAssetIds !== undefined
          ? args.sourceAssetIds
          : undefined;
    if (nextReferenceAssetIds !== undefined) {
      assertReferenceCount(nextReferenceAssetIds.length);
      for (const assetId of nextReferenceAssetIds) {
        await requireAssetOwner(ctx, assetId);
        if (element.sheetAssetId && assetId === element.sheetAssetId) {
          throw new Error(
            "referenceAssetIds must be upload photos only — do not include the built sheet asset.",
          );
        }
      }
    }
    if (args.sourceDocumentId !== undefined) {
      await requireDocumentOwner(ctx, args.sourceDocumentId);
    }
    const nextName =
      args.name !== undefined && element.type !== "style_sheet"
        ? await assertUniqueElementName(ctx, args.name, element._id)
        : args.name !== undefined
          ? args.name.trim()
          : undefined;
    await ctx.db.patch(element._id, {
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      ...(nextReferenceAssetIds !== undefined
        ? {
            referenceAssetIds: nextReferenceAssetIds,
            sourceAssetIds: nextReferenceAssetIds,
          }
        : {}),
      ...(args.sourceDocumentId !== undefined
        ? { sourceDocumentId: args.sourceDocumentId }
        : {}),
      ...(args.styleRules !== undefined ? { styleRules: args.styleRules } : {}),
      ...(args.renderMode !== undefined ? { renderMode: args.renderMode } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createSheetAsset = authedMutation({
  args: {
    elementId: v.id("elements"),
    name: v.string(),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const element = await requireElementOwner(ctx, args.elementId);
    if (!element.folderId) {
      throw new Error("Element must live in a folder before generating a sheet.");
    }
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: ctx.user._id,
      folderId: element.folderId,
      name: args.name,
      kind: "image",
      mimeType: args.mimeType,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: ctx.user._id,
      folderId: element.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const setBuiltSheet = authedMutation({
  args: {
    elementId: v.id("elements"),
    sheetAssetId: v.id("assets"),
    byteSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await requireElementOwner(ctx, args.elementId);
    const now = Date.now();
    await ctx.db.patch(element._id, {
      sheetAssetId: args.sheetAssetId,
      builtAt: now,
      updatedAt: now,
    });
    await recordSheetAssetBytes(ctx, args.sheetAssetId, args.byteSize);
    return null;
  },
});


export const setReaction = authedMutation({
  args: {
    elementId: v.id("elements"),
    emoji: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireShareEdit(ctx, "element", args.elementId);
    const reactionEmoji = normalizeReactionEmoji(args.emoji);
    await ctx.db.patch(args.elementId, {
      reactionEmoji,
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

export const createSheetAssetForUser = internalMutation({
  args: {
    userId: v.id("users"),
    elementId: v.id("elements"),
    name: v.string(),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const element = await requireElementForUser(ctx, args.userId, args.elementId);
    if (!element.folderId) {
      throw new Error("Element must live in a folder before generating a sheet.");
    }
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId: element.folderId,
      name: args.name,
      kind: "image",
      mimeType: args.mimeType,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: args.userId,
      folderId: element.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const setBuiltSheetForUser = internalMutation({
  args: {
    userId: v.id("users"),
    elementId: v.id("elements"),
    sheetAssetId: v.id("assets"),
    byteSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await requireElementForUser(ctx, args.userId, args.elementId);
    const now = Date.now();
    await ctx.db.patch(element._id, {
      sheetAssetId: args.sheetAssetId,
      builtAt: now,
      updatedAt: now,
    });
    await recordSheetAssetBytes(ctx, args.sheetAssetId, args.byteSize);
    return null;
  },
});

/** Sheet images live in the Bunny zone, so their bytes belong on the storage meter. */
async function recordSheetAssetBytes(
  ctx: MutationCtx,
  sheetAssetId: Id<"assets">,
  byteSize?: number,
) {
  if (byteSize == null || byteSize <= 0) return;
  const asset = await ctx.db.get("assets", sheetAssetId);
  if (!asset) return;
  await ctx.db.patch(asset._id, {
    byteSize,
    storageStatus: "ready",
    updatedAt: Date.now(),
  });
  await applyStorageBytesDelta(ctx, {
    userId: asset.ownerId,
    deltaBytes: byteSize - (asset.byteSize ?? 0),
    reason: `Storage added — ${asset.name}`,
  });
}

async function requireElementForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  elementId: Id<"elements">,
) {
  const element = await ctx.db.get("elements", elementId);
  if (!element || element.ownerId !== userId || element.deletedAt) {
    throw new Error("Element not found");
  }
  return element;
}

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
