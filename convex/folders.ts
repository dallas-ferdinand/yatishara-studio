import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { resolveElementAssets } from "./lib/elementAssetModel";
import {
  assetThumbnailPath,
  LQIP_TRANSFORM,
  PEEK_TRANSFORM,
  signBunnyCdnUrl,
} from "./lib/bunny";
import { normalizeReactionEmoji } from "./lib/itemReactions";

const folderReturn = v.object({
  _id: v.id("folders"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  parentId: v.optional(v.id("folders")),
  name: v.string(),
  icon: v.string(),
  color: v.optional(v.string()),
  sortOrder: v.number(),
  systemKind: v.optional(
    v.union(
      v.literal("messages"),
      v.literal("purchased_assets"),
      v.literal("public_assets"),
      v.literal("shared_with_me"),
    ),
  ),
  reactionEmoji: v.optional(v.string()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const folderPeekItem = v.object({
  kind: v.union(
    v.literal("image"),
    v.literal("video"),
    v.literal("audio"),
    v.literal("document"),
    v.literal("element"),
    v.literal("file"),
  ),
  thumbnailUrl: v.optional(v.string()),
  thumbnailLqipUrl: v.optional(v.string()),
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
const MAX_PEEK_FOLDER_VISITS = 8;
/** Cap signed peeks per listWithPeeks call — more folders get empty peeks to stay under 1s. */
const MAX_SIGNED_PEEK_FOLDERS = 10;

type PeekCandidate = {
  kind: "image" | "video" | "audio" | "document" | "element" | "file";
  priority: number;
  updatedAt: number;
  thumbnailUrl?: string;
  thumbnailLqipUrl?: string;
  /** Sign only after the candidate wins a peek slot. */
  thumbnailAsset?: Doc<"assets">;
  label: string;
  elementType?: "character" | "prop" | "location" | "doc" | "style_sheet";
  icon?: string;
};

type PeekItemOutput = {
  kind: PeekCandidate["kind"];
  thumbnailUrl?: string;
  thumbnailLqipUrl?: string;
  label: string;
  elementType?: PeekCandidate["elementType"];
  icon?: string;
};

async function signedAssetThumbnail(
  asset: Doc<"assets">,
  expiresUnix: number | undefined,
): Promise<{ thumbnailUrl?: string; thumbnailLqipUrl?: string }> {
  const path = assetThumbnailPath(asset);
  if (!path || expiresUnix === undefined) {
    return {};
  }
  const [thumbnailUrl, thumbnailLqipUrl] = await Promise.all([
    signBunnyCdnUrl(path, expiresUnix, PEEK_TRANSFORM),
    signBunnyCdnUrl(path, expiresUnix, LQIP_TRANSFORM),
  ]);
  return { thumbnailUrl, thumbnailLqipUrl };
}

function candidateToPeekItem(candidate: PeekCandidate): PeekItemOutput {
  return {
    kind: candidate.kind,
    thumbnailUrl: candidate.thumbnailUrl,
    thumbnailLqipUrl: candidate.thumbnailLqipUrl,
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
  const PEEK_COLLECT_CAP = 40;

  const assets = (
    await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .take(PEEK_COLLECT_CAP)
  ).filter(
    (asset) =>
      !asset.deletedAt &&
      (asset.storageStatus === undefined || asset.storageStatus === "ready"),
  );

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
    if (asset.kind === "audio") {
      candidates.push({
        kind: "audio",
        priority: 55,
        updatedAt: asset.updatedAt,
        label: asset.name,
        icon: "music",
      });
      continue;
    }
    candidates.push({
      kind: "file",
      priority: 35,
      updatedAt: asset.updatedAt,
      label: asset.name,
      icon: "file",
    });
  }

  const documents = (
    await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .take(PEEK_COLLECT_CAP)
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
      .take(PEEK_COLLECT_CAP)
  ).filter((project) => !project.deletedAt);

  for (const project of videoEdits) {
    let thumbnailAsset: Doc<"assets"> | undefined;
    const clipAssetId = (() => {
      try {
        const parsed = JSON.parse(project.projectJson) as {
          clips?: Array<{ assetId?: string; kind?: string; startTime?: number; trackId?: string }>;
          tracks?: Array<{ id?: string; kind?: string }>;
        };
        const videoTrackIds = new Set(
          (parsed.tracks ?? [])
            .filter((track) => track.kind === "video" && typeof track.id === "string")
            .map((track) => track.id as string),
        );
        const first = (parsed.clips ?? [])
          .filter((clip) => {
            if (!clip?.assetId) return false;
            if (clip.kind !== "image" && clip.kind !== "video") return false;
            if (videoTrackIds.size > 0 && clip.trackId && !videoTrackIds.has(clip.trackId)) {
              return false;
            }
            return true;
          })
          .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))[0];
        return first?.assetId;
      } catch {
        return undefined;
      }
    })();
    const previewId = project.outputAssetId ?? clipAssetId ?? project.sourceAssetId;
    if (previewId) {
      const asset = await ctx.db.get("assets", previewId as Id<"assets">);
      if (asset && !asset.deletedAt && assetThumbnailPath(asset)) {
        thumbnailAsset = asset;
      }
    }
    candidates.push({
      kind: "file",
      priority: thumbnailAsset ? 78 : 70,
      updatedAt: project.updatedAt,
      thumbnailAsset,
      label: project.name,
      icon: "clapperboard",
    });
  }

  const elements = (
    await ctx.db
      .query("elements")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .take(PEEK_COLLECT_CAP)
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
      if (candidate.thumbnailUrl || !candidate.thumbnailAsset) {
        return candidateToPeekItem(candidate);
      }
      const signed = await signedAssetThumbnail(candidate.thumbnailAsset, expiresUnix);
      return candidateToPeekItem({
        ...candidate,
        thumbnailUrl: signed.thumbnailUrl,
        thumbnailLqipUrl: signed.thumbnailLqipUrl,
      });
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

    // Sign peeks for a bounded prefix only — signing every folder BFS blew the 1s budget.
    const signedCount = args.expiresUnix
      ? Math.min(visibleFolders.length, MAX_SIGNED_PEEK_FOLDERS)
      : 0;

    return await Promise.all(
      visibleFolders.map(async (folder, index) => ({
        ...folder,
        peekItems:
          index < signedCount
            ? await collectFolderPeekItems(ctx, ctx.user._id, folder._id, args.expiresUnix)
            : [],
      })),
    );
  },
});

export const get = authedQuery({
  args: {
    folderId: v.id("folders"),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(folderReturn, v.null()),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder) {
      return null;
    }
    if (folder.deletedAt && !args.includeDeleted) {
      return null;
    }
    if (folder.ownerId === ctx.user._id) {
      return folder;
    }
    const { viewerCanAccessSharedItem } = await import("./studioShares");
    const ok = await viewerCanAccessSharedItem(
      ctx,
      ctx.user._id,
      "folder",
      args.folderId,
    );
    return ok ? folder : null;
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
    assertSystemFolderMutable(folder);
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


export const setReaction = authedMutation({
  args: {
    folderId: v.id("folders"),
    emoji: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await requireFolderOwner(ctx, args.folderId);
    assertSystemFolderMutable(folder);
    const reactionEmoji = normalizeReactionEmoji(args.emoji);
    await ctx.db.patch(args.folderId, {
      reactionEmoji,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const moveToTrash = authedMutation({
  args: { folderId: v.id("folders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await requireFolderOwner(ctx, args.folderId);
    assertSystemFolderMutable(folder);
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

function assertSystemFolderMutable(folder: Doc<"folders">) {
  if (folder.systemKind === "messages") {
    throw new Error("The Messages folder cannot be renamed, moved, or deleted");
  }
  if (folder.systemKind === "purchased_assets") {
    throw new Error("The Purchased folder cannot be renamed, moved, or deleted");
  }
  if (folder.systemKind === "public_assets") {
    throw new Error("My Public cannot be renamed, moved, or deleted");
  }
  if (folder.systemKind === "shared_with_me") {
    throw new Error(
      "Shared with me cannot be renamed, moved, or deleted",
    );
  }
}

/**
 * Idempotent Messages folder for DM media (billable Studio assets).
 * Lives under the user's Studio workspace root when `parentId` is provided.
 */
export async function ensureMessagesFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId?: Id<"folders">,
): Promise<Id<"folders">> {
  const existing = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_system_kind", (q) =>
      q.eq("ownerId", userId).eq("systemKind", "messages"),
    )
    .first();
  if (existing && !existing.deletedAt) {
    // Keep it under the workspace root when one is known.
    if (
      parentId &&
      existing.parentId !== parentId
    ) {
      await ctx.db.patch(existing._id, {
        parentId,
        updatedAt: Date.now(),
      });
    }
    return existing._id;
  }
  // Revive if somehow soft-deleted (shouldn't happen with guards).
  if (existing?.deletedAt) {
    await ctx.db.patch(existing._id, {
      deletedAt: undefined,
      name: "Messages",
      ...(parentId ? { parentId } : {}),
      updatedAt: Date.now(),
    });
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("folders", {
    ownerId: userId,
    ...(parentId ? { parentId } : {}),
    name: "Messages",
    icon: "message",
    sortOrder: 0,
    systemKind: "messages",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Idempotent Purchased folder for Creative Network stock audio (pay-once licenses).
 * Contents cannot be trashed while licenseKind is purchased_network.
 */
export async function ensurePurchasedAssetsFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId?: Id<"folders">,
): Promise<Id<"folders">> {
  const existing = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_system_kind", (q) =>
      q.eq("ownerId", userId).eq("systemKind", "purchased_assets"),
    )
    .first();
  if (existing && !existing.deletedAt) {
    if (parentId && existing.parentId !== parentId) {
      await ctx.db.patch(existing._id, {
        parentId,
        updatedAt: Date.now(),
      });
    }
    return existing._id;
  }
  if (existing?.deletedAt) {
    await ctx.db.patch(existing._id, {
      deletedAt: undefined,
      name: "Purchased",
      ...(parentId ? { parentId } : {}),
      updatedAt: Date.now(),
    });
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("folders", {
    ownerId: userId,
    ...(parentId ? { parentId } : {}),
    name: "Purchased",
    icon: "library",
    sortOrder: 1,
    systemKind: "purchased_assets",
    createdAt: now,
    updatedAt: now,
  });
}

const PUBLIC_ASSETS_FOLDER_NAME = "My Public";

/**
 * Idempotent My Public folder for Creative Network seller catalog copies.
 * Contents cannot be trashed while licenseKind is listed_network.
 */
export async function ensurePublicAssetsFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId?: Id<"folders">,
): Promise<Id<"folders">> {
  const existing = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_system_kind", (q) =>
      q.eq("ownerId", userId).eq("systemKind", "public_assets"),
    )
    .first();
  if (existing && !existing.deletedAt) {
    const patch: { parentId?: Id<"folders">; name?: string; updatedAt: number } =
      { updatedAt: Date.now() };
    let needsPatch = false;
    if (parentId && existing.parentId !== parentId) {
      patch.parentId = parentId;
      needsPatch = true;
    }
    // Rename legacy "Public" → "My Public" without touching custom renames
    // (system folders are locked from rename, so only the old default remains).
    if (existing.name !== PUBLIC_ASSETS_FOLDER_NAME) {
      patch.name = PUBLIC_ASSETS_FOLDER_NAME;
      needsPatch = true;
    }
    if (needsPatch) {
      await ctx.db.patch(existing._id, patch);
    }
    return existing._id;
  }
  if (existing?.deletedAt) {
    await ctx.db.patch(existing._id, {
      deletedAt: undefined,
      name: PUBLIC_ASSETS_FOLDER_NAME,
      ...(parentId ? { parentId } : {}),
      updatedAt: Date.now(),
    });
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("folders", {
    ownerId: userId,
    ...(parentId ? { parentId } : {}),
    name: PUBLIC_ASSETS_FOLDER_NAME,
    icon: "globe",
    sortOrder: 2,
    systemKind: "public_assets",
    createdAt: now,
    updatedAt: now,
  });
}

async function workspaceRootForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"folders"> | undefined> {
  const topFolders = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_parent", (q) =>
      q.eq("ownerId", userId).eq("parentId", undefined),
    )
    .collect();
  const root = topFolders.find(
    (folder) =>
      !folder.deletedAt &&
      folder.systemKind !== "messages" &&
      folder.systemKind !== "purchased_assets" &&
      folder.systemKind !== "public_assets" &&
      folder.systemKind !== "shared_with_me",
  );
  return root?._id;
}

const SHARED_WITH_ME_FOLDER_NAME = "Shared with me";

/**
 * Idempotent Shared with me folder for live-link grants from other users.
 * Contents are virtual (studioShares) — the folder itself is a navigation root.
 */
export async function ensureSharedWithMeFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId?: Id<"folders">,
): Promise<Id<"folders">> {
  const existing = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_system_kind", (q) =>
      q.eq("ownerId", userId).eq("systemKind", "shared_with_me"),
    )
    .first();
  if (existing && !existing.deletedAt) {
    const patch: {
      parentId?: Id<"folders">;
      name?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    let needsPatch = false;
    if (parentId && existing.parentId !== parentId) {
      patch.parentId = parentId;
      needsPatch = true;
    }
    if (existing.name !== SHARED_WITH_ME_FOLDER_NAME) {
      patch.name = SHARED_WITH_ME_FOLDER_NAME;
      needsPatch = true;
    }
    if (needsPatch) {
      await ctx.db.patch(existing._id, patch);
    }
    return existing._id;
  }
  if (existing?.deletedAt) {
    await ctx.db.patch(existing._id, {
      deletedAt: undefined,
      name: SHARED_WITH_ME_FOLDER_NAME,
      ...(parentId ? { parentId } : {}),
      updatedAt: Date.now(),
    });
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("folders", {
    ownerId: userId,
    ...(parentId ? { parentId } : {}),
    name: SHARED_WITH_ME_FOLDER_NAME,
    icon: "users",
    sortOrder: 3,
    systemKind: "shared_with_me",
    createdAt: now,
    updatedAt: now,
  });
}

/** Public mutation so the DM client can reserve uploads into Messages. */
export const ensureMessagesFolderForMe = authedMutation({
  args: {},
  returns: v.id("folders"),
  handler: async (ctx) => {
    const rootId = await workspaceRootForUser(ctx, ctx.user._id);
    return await ensureMessagesFolder(ctx, ctx.user._id, rootId);
  },
});

export const ensurePurchasedAssetsFolderForMe = authedMutation({
  args: {},
  returns: v.id("folders"),
  handler: async (ctx) => {
    const rootId = await workspaceRootForUser(ctx, ctx.user._id);
    return await ensurePurchasedAssetsFolder(ctx, ctx.user._id, rootId);
  },
});

/** Approved sellers: ensure locked My Public folder for catalog copies. */
export const ensurePublicAssetsFolderForMe = authedMutation({
  args: {},
  returns: v.id("folders"),
  handler: async (ctx) => {
    const rootId = await workspaceRootForUser(ctx, ctx.user._id);
    return await ensurePublicAssetsFolder(ctx, ctx.user._id, rootId);
  },
});

export const ensureSharedWithMeFolderForMe = authedMutation({
  args: {},
  returns: v.id("folders"),
  handler: async (ctx) => {
    const rootId = await workspaceRootForUser(ctx, ctx.user._id);
    return await ensureSharedWithMeFolder(ctx, ctx.user._id, rootId);
  },
});
