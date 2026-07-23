/**
 * Agent-oriented workspace context APIs (tree, search, project pack, thread history).
 * Media viewing returns signed URLs only — never runs Studio AI / credits.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  assetThumbnailPath,
  signBunnyFullUrl,
  signBunnyThumbUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { isFolderDescendantOf, isFolderInSandbox } from "./lib/studioApi/folderScope";
import { resolveElementAssets } from "./lib/elementAssetModel";

const folderLite = v.object({
  id: v.id("folders"),
  name: v.string(),
  parentId: v.optional(v.id("folders")),
});

const treeNode = v.object({
  id: v.id("folders"),
  name: v.string(),
  parentId: v.optional(v.id("folders")),
  path: v.string(),
  children: v.array(v.any()),
});

async function requireFolder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== userId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  if (!(await isFolderInSandbox(ctx, folderId, sandboxFolderId))) {
    throw new Error("Folder not found");
  }
  return folder;
}

async function breadcrumbForFolder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
) {
  const crumbs: Array<{ id: Id<"folders">; name: string }> = [];
  let currentId: Id<"folders"> | undefined = folderId;
  const guard = new Set<string>();
  while (currentId && !guard.has(currentId)) {
    guard.add(currentId);
    const folder: Doc<"folders"> | null = await ctx.db.get("folders", currentId);
    if (!folder || folder.ownerId !== userId || folder.deletedAt) break;
    crumbs.unshift({ id: folder._id, name: folder.name });
    if (folder._id === sandboxFolderId) break;
    currentId = folder.parentId;
  }
  return crumbs;
}

async function pathForFolder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
) {
  const crumbs = await breadcrumbForFolder(ctx, userId, folderId, sandboxFolderId);
  // Drop sandbox root name from path segments so paths are relative to workspace root.
  const relative = crumbs.filter((c) => c.id !== sandboxFolderId).map((c) => c.name);
  return relative.join("/");
}

async function buildTree(
  ctx: QueryCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
  maxDepth: number,
  maxNodes: number,
  state: { count: number },
): Promise<{
  id: Id<"folders">;
  name: string;
  parentId?: Id<"folders">;
  path: string;
  children: Array<unknown>;
} | null> {
  if (state.count >= maxNodes) return null;
  const folder = await requireFolder(ctx, userId, folderId, sandboxFolderId);
  state.count += 1;
  const path = await pathForFolder(ctx, userId, folderId, sandboxFolderId);
  const node = {
    id: folder._id,
    name: folder.name,
    parentId: folder.parentId,
    path: path || folder.name,
    children: [] as Array<unknown>,
  };
  if (maxDepth <= 0) return node;
  const children = await ctx.db
    .query("folders")
    .withIndex("by_owner_and_parent", (q) =>
      q.eq("ownerId", userId).eq("parentId", folderId),
    )
    .collect();
  for (const child of children.filter((f) => !f.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (state.count >= maxNodes) break;
    const childNode = await buildTree(
      ctx,
      userId,
      child._id,
      sandboxFolderId,
      maxDepth - 1,
      maxNodes,
      state,
    );
    if (childNode) node.children.push(childNode);
  }
  return node;
}

export const getWorkspaceTree = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.optional(v.id("folders")),
    maxDepth: v.optional(v.number()),
    maxNodes: v.optional(v.number()),
  },
  returns: v.object({
    rootId: v.id("folders"),
    tree: treeNode,
    truncated: v.boolean(),
    nodeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const rootId = args.folderId ?? args.sandboxFolderId;
    await requireFolder(ctx, args.userId, rootId, args.sandboxFolderId);
    const maxDepth = Math.min(Math.max(args.maxDepth ?? 6, 1), 12);
    const maxNodes = Math.min(Math.max(args.maxNodes ?? 200, 10), 500);
    const state = { count: 0 };
    const tree = await buildTree(
      ctx,
      args.userId,
      rootId,
      args.sandboxFolderId,
      maxDepth,
      maxNodes,
      state,
    );
    if (!tree) throw new Error("Folder not found");
    return {
      rootId,
      tree,
      truncated: state.count >= maxNodes,
      nodeCount: state.count,
    };
  },
});

export const resolveFolderPath = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    path: v.string(),
    rootFolderId: v.optional(v.id("folders")),
  },
  returns: v.union(
    v.object({
      folderId: v.id("folders"),
      path: v.string(),
      breadcrumb: v.array(folderLite),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const startId = args.rootFolderId ?? args.sandboxFolderId;
    await requireFolder(ctx, args.userId, startId, args.sandboxFolderId);
    const parts = args.path
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => p !== "." && p !== "Studio");
    let currentId = startId;
    for (const part of parts) {
      const children = await ctx.db
        .query("folders")
        .withIndex("by_owner_and_parent", (q) =>
          q.eq("ownerId", args.userId).eq("parentId", currentId),
        )
        .collect();
      const match = children.find(
        (f) => !f.deletedAt && f.name.toLowerCase() === part.toLowerCase(),
      );
      if (!match) return null;
      currentId = match._id;
    }
    const breadcrumb = await breadcrumbForFolder(
      ctx,
      args.userId,
      currentId,
      args.sandboxFolderId,
    );
    const path = await pathForFolder(ctx, args.userId, currentId, args.sandboxFolderId);
    return {
      folderId: currentId,
      path,
      breadcrumb: breadcrumb.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: undefined,
      })),
    };
  },
});

export const searchWorkspace = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    query: v.string(),
    kinds: v.optional(
      v.array(
        v.union(
          v.literal("folder"),
          v.literal("asset"),
          v.literal("document"),
          v.literal("element"),
        ),
      ),
    ),
    folderId: v.optional(v.id("folders")),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    query: v.string(),
    results: v.array(
      v.object({
        kind: v.string(),
        id: v.string(),
        name: v.string(),
        folderId: v.optional(v.id("folders")),
        path: v.optional(v.string()),
        type: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        buildStatus: v.optional(v.string()),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const q = args.query.trim().toLowerCase();
    if (!q) {
      return { query: args.query, results: [], truncated: false };
    }
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const kinds = new Set(
      args.kinds?.length
        ? args.kinds
        : (["folder", "asset", "document", "element"] as const),
    );
    const scopeRoot = args.folderId ?? args.sandboxFolderId;
    await requireFolder(ctx, args.userId, scopeRoot, args.sandboxFolderId);

    const results: Array<{
      kind: string;
      id: string;
      name: string;
      folderId?: Id<"folders">;
      path?: string;
      type?: string;
      mimeType?: string;
      buildStatus?: string;
    }> = [];

    const inScope = async (folderId: Id<"folders">) => {
      if (folderId === scopeRoot) return true;
      if (scopeRoot === args.sandboxFolderId) {
        return isFolderInSandbox(ctx, folderId, args.sandboxFolderId);
      }
      return (
        (await isFolderInSandbox(ctx, folderId, args.sandboxFolderId)) &&
        ((await isFolderDescendantOf(ctx, folderId, scopeRoot)) || folderId === scopeRoot)
      );
    };

    if (kinds.has("folder") && results.length < limit) {
      const folders = await ctx.db
        .query("folders")
        .withIndex("by_owner", (q2) => q2.eq("ownerId", args.userId))
        .collect();
      for (const folder of folders) {
        if (results.length >= limit) break;
        if (folder.deletedAt || !folder.name.toLowerCase().includes(q)) continue;
        if (!(await inScope(folder._id))) continue;
        results.push({
          kind: "folder",
          id: folder._id,
          name: folder.name,
          folderId: folder.parentId,
          path: await pathForFolder(ctx, args.userId, folder._id, args.sandboxFolderId),
        });
      }
    }

    if (kinds.has("asset") && results.length < limit) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_owner", (q2) => q2.eq("ownerId", args.userId))
        .collect();
      for (const asset of assets) {
        if (results.length >= limit) break;
        if (asset.deletedAt || !asset.name.toLowerCase().includes(q)) continue;
        if (!(await inScope(asset.folderId))) continue;
        results.push({
          kind: "asset",
          id: asset._id,
          name: asset.name,
          folderId: asset.folderId,
          type: asset.kind,
          mimeType: asset.mimeType,
          path: await pathForFolder(ctx, args.userId, asset.folderId, args.sandboxFolderId),
        });
      }
    }

    if (kinds.has("document") && results.length < limit) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_owner", (q2) => q2.eq("ownerId", args.userId))
        .collect();
      for (const doc of docs) {
        if (results.length >= limit) break;
        if (doc.deletedAt || !doc.title.toLowerCase().includes(q)) continue;
        if (!(await inScope(doc.folderId))) continue;
        results.push({
          kind: "document",
          id: doc._id,
          name: doc.title,
          folderId: doc.folderId,
          path: await pathForFolder(ctx, args.userId, doc.folderId, args.sandboxFolderId),
        });
      }
    }

    if (kinds.has("element") && results.length < limit) {
      const elements = await ctx.db
        .query("elements")
        .withIndex("by_owner", (q2) => q2.eq("ownerId", args.userId))
        .collect();
      for (const element of elements) {
        if (results.length >= limit) break;
        if (element.deletedAt || !element.name.toLowerCase().includes(q)) continue;
        if (element.folderId && !(await inScope(element.folderId))) continue;
        const resolved = await resolveElementAssets(ctx, element);
        results.push({
          kind: "element",
          id: element._id,
          name: element.name,
          folderId: element.folderId,
          type: element.type,
          buildStatus: resolved.buildStatus,
          path: element.folderId
            ? await pathForFolder(ctx, args.userId, element.folderId, args.sandboxFolderId)
            : undefined,
        });
      }
    }

    return {
      query: args.query,
      results,
      truncated: results.length >= limit,
    };
  },
});

export const getProjectContext = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    expiresUnix: v.number(),
    recentGenerationLimit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const folder = await requireFolder(
      ctx,
      args.userId,
      args.folderId,
      args.sandboxFolderId,
    );
    const breadcrumb = await breadcrumbForFolder(
      ctx,
      args.userId,
      args.folderId,
      args.sandboxFolderId,
    );
    const path = await pathForFolder(
      ctx,
      args.userId,
      args.folderId,
      args.sandboxFolderId,
    );
    const state = { count: 0 };
    const tree = await buildTree(
      ctx,
      args.userId,
      args.folderId,
      args.sandboxFolderId,
      3,
      80,
      state,
    );

    const subfolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", args.folderId),
      )
      .collect();
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();
    const folderElements = elements.filter(
      (e) => !e.deletedAt && e.folderId === args.folderId,
    );

    const user = await ctx.db.get("users", args.userId);
    let activeStyleSheet = null;
    if (user?.activeStyleSheetId) {
      const sheet = await ctx.db.get("elements", user.activeStyleSheetId);
      if (sheet && !sheet.deletedAt && sheet.ownerId === args.userId) {
        const resolved = await resolveElementAssets(ctx, sheet);
        activeStyleSheet = {
          id: sheet._id,
          name: sheet.name,
          type: sheet.type,
          buildStatus: resolved.buildStatus,
          sheetAssetId: resolved.sheetAssetId,
          folderId: sheet.folderId,
        };
      }
    }

    const genLimit = Math.min(Math.max(args.recentGenerationLimit ?? 8, 1), 24);
    const recentJobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_owner_and_created", (q) => q.eq("ownerId", args.userId))
      .order("desc")
      .take(40);
    const recentGenerations = [];
    for (const job of recentJobs) {
      if (job.saveFolderId !== args.folderId) continue;
      recentGenerations.push({
        id: job._id,
        threadId: job.threadId,
        status: job.stage,
        mode: job.mode,
        prompt: job.userPrompt.slice(0, 240),
        enhancedPrompt: job.enhancedPrompt?.slice(0, 240),
        resolvedModel: job.resolvedModel,
        createdAt: job.createdAt,
      });
      if (recentGenerations.length >= genLimit) break;
    }

    const elementSummaries = await Promise.all(
      folderElements.map(async (element) => {
        const resolved = await resolveElementAssets(ctx, element);
        return {
          id: element._id,
          type: element.type,
          name: element.name,
          buildStatus: resolved.buildStatus,
          sheetAssetId: resolved.sheetAssetId,
          descriptionPreview: element.description?.slice(0, 160),
        };
      }),
    );

    return {
      folder: {
        id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
        path,
      },
      breadcrumb,
      tree,
      counts: {
        folders: subfolders.filter((f) => !f.deletedAt).length,
        assets: assets.filter((a) => !a.deletedAt).length,
        documents: documents.filter((d) => !d.deletedAt).length,
        elements: folderElements.length,
      },
      folders: subfolders
        .filter((f) => !f.deletedAt)
        .map((f) => ({ id: f._id, name: f.name, parentId: f.parentId })),
      assets: assets
        .filter((a) => !a.deletedAt)
        .slice(0, 40)
        .map((a) => ({
          id: a._id,
          name: a.name,
          kind: a.kind,
          mimeType: a.mimeType,
        })),
      documents: documents
        .filter((d) => !d.deletedAt)
        .map((d) => ({
          id: d._id,
          title: d.title,
          updatedAt: d.updatedAt,
        })),
      elements: elementSummaries,
      activeStyleSheet,
      recentGenerations,
      treeTruncated: state.count >= 80,
    };
  },
});

export const viewAssetMedia = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    expiresUnix: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      return null;
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      return null;
    }
    const thumbPath = assetThumbnailPath(asset);
    const url = asset.bunnyPath
      ? await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind)
      : undefined;
    const thumbnailUrl = thumbPath
      ? await signBunnyThumbUrl(thumbPath, args.expiresUnix, THUMB_TRANSFORM)
      : undefined;
    return {
      assetId: asset._id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      folderId: asset.folderId,
      url,
      thumbnailUrl,
      preferredViewUrl: thumbnailUrl ?? url,
      viewHint:
        "Host client should fetch preferredViewUrl/url directly (e.g. Cursor Read on images). This endpoint does not call Studio AI and uses no generation credits.",
      expiresUnix: args.expiresUnix,
    };
  },
});

export const listThreadsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.id("generationThreads"),
      title: v.string(),
      folderId: v.id("folders"),
      updatedAt: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 80);
    const threads = await ctx.db
      .query("generationThreads")
      .withIndex("by_owner_and_archived", (q) =>
        q.eq("ownerId", args.userId).eq("archivedAt", undefined),
      )
      .order("desc")
      .take(limit);
    return threads.map((thread) => ({
      id: thread._id,
      title:
        thread.title?.trim() && thread.title.trim() !== "[object Object]"
          ? thread.title.trim().slice(0, 120)
          : "Untitled",
      folderId: thread.linkedFolderId,
      updatedAt: thread.updatedAt,
      createdAt: thread.createdAt,
    }));
  },
});

export const getThreadHistoryForApi = internalQuery({
  args: {
    userId: v.id("users"),
    threadId: v.id("generationThreads"),
    beforeOrder: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    threadId: v.id("generationThreads"),
    title: v.optional(v.string()),
    events: v.array(
      v.object({
        order: v.number(),
        kind: v.string(),
        text: v.optional(v.string()),
        stage: v.optional(v.string()),
        generationJobId: v.optional(v.id("generationJobs")),
        assetIds: v.optional(v.array(v.id("assets"))),
      }),
    ),
    nextBeforeOrder: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("generationThreads", args.threadId);
    if (!thread || thread.ownerId !== args.userId) {
      throw new Error("Thread not found");
    }
    const limit = Math.min(Math.max(args.limit ?? 24, 1), 50);
    const rows = await ctx.db
      .query("generationEvents")
      .withIndex("by_thread_and_order", (q) => {
        const owned = q.eq("threadId", args.threadId);
        return args.beforeOrder !== undefined
          ? owned.lt("order", args.beforeOrder)
          : owned;
      })
      .order("desc")
      .take(limit);
    const events = rows
      .filter((event) => event.ownerId === args.userId)
      .reverse()
      .map((event) => ({
        order: event.order,
        kind: event.kind,
        text: event.prompt ?? event.message,
        stage: event.stage,
        generationJobId: event.generationJobId,
        assetIds: event.assetIds,
      }));
    return {
      threadId: thread._id,
      title: thread.title,
      events,
      nextBeforeOrder: rows.length === limit ? rows.at(-1)?.order : undefined,
    };
  },
});

export const duplicateAssetForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    folderId: v.optional(v.id("folders")),
    name: v.optional(v.string()),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      throw new Error("Asset not found");
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      throw new Error("Asset not found");
    }
    const folderId = args.folderId ?? asset.folderId;
    await requireFolder(ctx, args.userId, folderId, args.sandboxFolderId);
    const now = Date.now();
    return await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId,
      name: args.name?.trim() || `Copy of ${asset.name}`,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      storageStatus: asset.storageStatus,
      bunnyPath: asset.bunnyPath,
      bunnyStreamVideoId: asset.bunnyStreamVideoId,
      thumbnailPath: asset.thumbnailPath,
      durationSeconds: asset.durationSeconds,
      width: asset.width,
      height: asset.height,
      frameRate: asset.frameRate,
      videoCodec: asset.videoCodec,
      videoProfile: asset.videoProfile,
      audioCodec: asset.audioCodec,
      proxyKeyframeIntervalSeconds: asset.proxyKeyframeIntervalSeconds,
      rotation: asset.rotation,
      editProxyStatus: asset.editProxyStatus,
      editProxyPath: asset.editProxyPath,
      editProxyByteSize: asset.editProxyByteSize,
      editProxy1080Path: asset.editProxy1080Path,
      editProxy1080ByteSize: asset.editProxy1080ByteSize,
      editProxyError: asset.editProxyError,
      editProxyUpdatedAt: asset.editProxyUpdatedAt,
      sourceGenerationJobId: asset.sourceGenerationJobId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

const bulkItem = v.object({
  kind: v.union(
    v.literal("asset"),
    v.literal("document"),
    v.literal("element"),
    v.literal("folder"),
  ),
  id: v.string(),
});

/**
 * Create nested folders for a path (e.g. Clients/JAV/refs). Case-insensitive
 * match reuses existing segments; returns final folderId + created list.
 */
export const ensureFolderPath = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    path: v.string(),
    rootFolderId: v.optional(v.id("folders")),
  },
  returns: v.object({
    folderId: v.id("folders"),
    path: v.string(),
    created: v.array(
      v.object({
        id: v.id("folders"),
        name: v.string(),
      }),
    ),
    breadcrumb: v.array(folderLite),
  }),
  handler: async (ctx, args) => {
    const startId = args.rootFolderId ?? args.sandboxFolderId;
    await requireFolder(ctx, args.userId, startId, args.sandboxFolderId);
    const parts = args.path
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => p !== "." && p !== ".." && p !== "Studio");
    if (parts.length === 0) {
      const breadcrumb = await breadcrumbForFolder(
        ctx,
        args.userId,
        startId,
        args.sandboxFolderId,
      );
      const path = await pathForFolder(ctx, args.userId, startId, args.sandboxFolderId);
      return {
        folderId: startId,
        path,
        created: [],
        breadcrumb: breadcrumb.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: undefined,
        })),
      };
    }
    if (parts.length > 12) {
      throw new Error("Path limited to 12 segments");
    }
    for (const part of parts) {
      if (part.length > 80) {
        throw new Error(`Folder name too long: ${part.slice(0, 40)}…`);
      }
    }

    let currentId = startId;
    const created: Array<{ id: Id<"folders">; name: string }> = [];
    const now = Date.now();

    for (const part of parts) {
      const children = await ctx.db
        .query("folders")
        .withIndex("by_owner_and_parent", (q) =>
          q.eq("ownerId", args.userId).eq("parentId", currentId),
        )
        .collect();
      const match = children.find(
        (f) => !f.deletedAt && f.name.toLowerCase() === part.toLowerCase(),
      );
      if (match) {
        currentId = match._id;
        continue;
      }
      const folderId = await ctx.db.insert("folders", {
        ownerId: args.userId,
        parentId: currentId,
        name: part,
        icon: "Folder",
        sortOrder: now + created.length,
        createdAt: now,
        updatedAt: now,
      });
      created.push({ id: folderId, name: part });
      currentId = folderId;
    }

    const breadcrumb = await breadcrumbForFolder(
      ctx,
      args.userId,
      currentId,
      args.sandboxFolderId,
    );
    const path = await pathForFolder(ctx, args.userId, currentId, args.sandboxFolderId);
    return {
      folderId: currentId,
      path,
      created,
      breadcrumb: breadcrumb.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: undefined,
      })),
    };
  },
});

export const bulkMoveForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    targetFolderId: v.id("folders"),
    items: v.array(bulkItem),
  },
  returns: v.object({
    moved: v.array(v.object({ kind: v.string(), id: v.string() })),
    errors: v.array(v.object({ kind: v.string(), id: v.string(), error: v.string() })),
  }),
  handler: async (ctx, args) => {
    await requireFolder(ctx, args.userId, args.targetFolderId, args.sandboxFolderId);
    if (args.items.length > 50) {
      throw new Error("bulk move limited to 50 items");
    }
    const moved: Array<{ kind: string; id: string }> = [];
    const errors: Array<{ kind: string; id: string; error: string }> = [];
    const now = Date.now();

    for (const item of args.items) {
      try {
        if (item.kind === "asset") {
          const assetId = item.id as Id<"assets">;
          const asset = await ctx.db.get("assets", assetId);
          if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
            throw new Error("Asset not found");
          }
          if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
            throw new Error("Asset not found");
          }
          await ctx.db.patch(assetId, { folderId: args.targetFolderId, updatedAt: now });
        } else if (item.kind === "document") {
          const documentId = item.id as Id<"documents">;
          const doc = await ctx.db.get("documents", documentId);
          if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
            throw new Error("Document not found");
          }
          if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
            throw new Error("Document not found");
          }
          await ctx.db.patch(documentId, { folderId: args.targetFolderId, updatedAt: now });
        } else if (item.kind === "element") {
          const elementId = item.id as Id<"elements">;
          const element = await ctx.db.get("elements", elementId);
          if (!element || element.ownerId !== args.userId || element.deletedAt) {
            throw new Error("Element not found");
          }
          if (
            element.folderId &&
            !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))
          ) {
            throw new Error("Element not found");
          }
          await ctx.db.patch(elementId, { folderId: args.targetFolderId, updatedAt: now });
        } else if (item.kind === "folder") {
          const folderId = item.id as Id<"folders">;
          if (folderId === args.sandboxFolderId) {
            throw new Error("Cannot move sandbox root");
          }
          await requireFolder(ctx, args.userId, folderId, args.sandboxFolderId);
          if (folderId === args.targetFolderId) {
            throw new Error("Folder cannot be moved into itself");
          }
          if (await isFolderDescendantOf(ctx, args.targetFolderId, folderId)) {
            throw new Error("Folder cannot be moved into its own subfolder");
          }
          await ctx.db.patch(folderId, { parentId: args.targetFolderId, updatedAt: now });
        }
        moved.push({ kind: item.kind, id: item.id });
      } catch (error) {
        errors.push({
          kind: item.kind,
          id: item.id,
          error: error instanceof Error ? error.message : "move failed",
        });
      }
    }
    return { moved, errors };
  },
});
