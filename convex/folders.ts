import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { resolveElementAssets } from "./lib/elementAssetModel";
import { assetThumbnailPath, signBunnyCdnUrl } from "./lib/bunny";

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

const folderPeekItem = v.object({
  kind: v.union(
    v.literal("image"),
    v.literal("video"),
    v.literal("document"),
    v.literal("element"),
    v.literal("file"),
  ),
  thumbnailUrl: v.optional(v.string()),
  label: v.string(),
  elementType: v.optional(
    v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
      v.literal("style_sheet"),
    ),
  ),
  icon: v.optional(v.string()),
});

const folderWithPeeksReturn = v.object({
  ...folderReturn.fields,
  peekItems: v.array(folderPeekItem),
});

const PEEK_LIMIT = 3;
/** Max folders visited per peek (BFS) — finds nested media without deep recursion. */
const MAX_PEEK_FOLDER_VISITS = 24;

type PeekCandidate = {
  kind: "image" | "video" | "document" | "element" | "file";
  priority: number;
  updatedAt: number;
  thumbnailUrl?: string;
  /** Sign only after the candidate wins a peek slot. */
  thumbnailAsset?: Doc<"assets">;
  label: string;
  elementType?: "character" | "prop" | "location" | "doc" | "style_sheet";
  icon?: string;
};

type PeekItemOutput = {
  kind: PeekCandidate["kind"];
  thumbnailUrl?: string;
  label: string;
  elementType?: PeekCandidate["elementType"];
  icon?: string;
};

async function signedAssetThumbnail(
  asset: Doc<"assets">,
  expiresUnix: number | undefined,
): Promise<string | undefined> {
  const path = assetThumbnailPath(asset);
  if (!path || expiresUnix === undefined) {
    return undefined;
  }
  return await signBunnyCdnUrl(path, expiresUnix);
}

function candidateToPeekItem(candidate: PeekCandidate): PeekItemOutput {
  return {
    kind: candidate.kind,
    thumbnailUrl: candidate.thumbnailUrl,
    label: candidate.label,
    elementType: candidate.elementType,
    icon: candidate.icon,
  };
}

function folderFallbackPeek(folderName: string): PeekItemOutput {
  return {
    kind: "file",
    label: folderName,
    icon: "folder",
  };
}

function sortChildFolders(folders: Doc<"folders">[]) {
  return [...folders].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || b.updatedAt - a.updatedAt,
  );
}

async function listChildFolders(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<Doc<"folders">[]> {
  return sortChildFolders(
    (
      await ctx.db
        .query("folders")
        .withIndex("by_owner_and_parent", (q) =>
          q.eq("ownerId", ownerId).eq("parentId", folderId),
        )
        .collect()
    ).filter((folder) => !folder.deletedAt),
  );
}

async function collectDirectFolderPeekCandidates(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<PeekCandidate[]> {
  const candidates: PeekCandidate[] = [];

  const assets = (
    await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect()
  ).filter((asset) => !asset.deletedAt);

  for (const asset of assets) {
    if (asset.kind === "image" || asset.kind === "video") {
      candidates.push({
        kind: asset.kind,
        priority: asset.kind === "image" ? 100 : 90,
        updatedAt: asset.updatedAt,
        thumbnailAsset: assetThumbnailPath(asset) ? asset : undefined,
        label: asset.name,
      });
      continue;
    }
    candidates.push({
      kind: "file",
      priority: asset.kind === "audio" ? 40 : 35,
      updatedAt: asset.updatedAt,
      label: asset.name,
      icon: asset.kind === "audio" ? "music" : "file",
    });
  }

  const documents = (
    await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect()
  ).filter((doc) => !doc.deletedAt);

  for (const doc of documents) {
    candidates.push({
      kind: "document",
      priority: 60,
      updatedAt: doc.updatedAt,
      label: doc.title,
      icon: "fileText",
    });
  }

  const videoEdits = (
    await ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect()
  ).filter((project) => !project.deletedAt);

  for (const project of videoEdits) {
    candidates.push({
      kind: "file",
      priority: 70,
      updatedAt: project.updatedAt,
      label: project.name,
      icon: "scissors",
    });
  }

  const elements = (
    await ctx.db
      .query("elements")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect()
  ).filter((element) => !element.deletedAt);

  for (const element of elements) {
    const resolved = await resolveElementAssets(ctx, element);
    let thumbnailAsset: Doc<"assets"> | undefined;
    if (resolved.sheetAssetId) {
      const sheet = await ctx.db.get("assets", resolved.sheetAssetId);
      if (sheet && assetThumbnailPath(sheet)) {
        thumbnailAsset = sheet;
      }
    }
    candidates.push({
      kind: "element",
      priority: thumbnailAsset ? 85 : 55,
      updatedAt: element.updatedAt,
      thumbnailAsset,
      label: element.name,
      elementType: element.type,
    });
  }

  return candidates;
}

async function peekCandidatesToItems(
  candidates: PeekCandidate[],
  expiresUnix: number | undefined,
): Promise<PeekItemOutput[]> {
  const winners = [...candidates]
    .sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt)
    .slice(0, PEEK_LIMIT);

  return await Promise.all(
    winners.map(async (candidate) => {
      const thumbnailUrl =
        candidate.thumbnailUrl ??
        (candidate.thumbnailAsset
          ? await signedAssetThumbnail(candidate.thumbnailAsset, expiresUnix)
          : undefined);
      return candidateToPeekItem({ ...candidate, thumbnailUrl });
    }),
  );
}

/** Breadth-first peek: surfaces nested media even when direct children are subfolders only. */
async function collectFolderPeekItems(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  folderId: Id<"folders">,
  expiresUnix: number | undefined,
): Promise<PeekItemOutput[]> {
  const queue: Id<"folders">[] = [folderId];
  const visited = new Set<string>();
  const candidates: PeekCandidate[] = [];

  while (queue.length > 0 && visited.size < MAX_PEEK_FOLDER_VISITS) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    candidates.push(...(await collectDirectFolderPeekCandidates(ctx, ownerId, currentId)));

    // Enough high-priority media to fill peeks — stop walking.
    const ranked = [...candidates].sort(
      (a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt,
    );
    if (ranked.filter((item) => item.priority >= 85).length >= PEEK_LIMIT) {
      return await peekCandidatesToItems(candidates, expiresUnix);
    }

    for (const child of await listChildFolders(ctx, ownerId, currentId)) {
      queue.push(child._id);
    }
  }

  if (candidates.length > 0) {
    return await peekCandidatesToItems(candidates, expiresUnix);
  }

  const childFolders = await listChildFolders(ctx, ownerId, folderId);
  if (childFolders.length === 0) {
    return [];
  }

  return childFolders
    .slice(0, PEEK_LIMIT)
    .map((folder) => folderFallbackPeek(folder.name));
}

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

export const listWithPeeks = authedQuery({
  args: {
    parentId: v.optional(v.union(v.id("folders"), v.null())),
    includeDeleted: v.optional(v.boolean()),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(folderWithPeeksReturn),
  handler: async (ctx, args) => {
    const parentId = args.parentId === null ? undefined : args.parentId;
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", parentId),
      )
      .collect();
    const visibleFolders = args.includeDeleted
      ? folders
      : folders.filter((folder) => !folder.deletedAt);
    return await Promise.all(
      visibleFolders.map(async (folder) => ({
        ...folder,
        peekItems: await collectFolderPeekItems(
          ctx,
          ctx.user._id,
          folder._id,
          args.expiresUnix,
        ),
      })),
    );
  },
});

export const get = authedQuery({
  args: { folderId: v.id("folders") },
  returns: v.union(folderReturn, v.null()),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.ownerId !== ctx.user._id || folder.deletedAt) {
      return null;
    }
    return folder;
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
