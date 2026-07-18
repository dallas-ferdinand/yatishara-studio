import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  assetThumbnailPath,
  LQIP_TRANSFORM,
  signBunnyCdnUrls,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { isFolderInSandbox } from "./lib/studioApi/folderScope";

const projectReturn = v.object({
  _id: v.id("videoEditProjects"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.id("folders"),
  name: v.string(),
  project: v.any(),
  sourceAssetId: v.optional(v.id("assets")),
  outputAssetId: v.optional(v.id("assets")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const listRowReturn = v.object({
  _id: v.id("videoEditProjects"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  folderId: v.id("folders"),
  name: v.string(),
  sourceAssetId: v.optional(v.id("assets")),
  outputAssetId: v.optional(v.id("assets")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  signedThumbnailUrl: v.optional(v.string()),
  signedThumbnailLqipUrl: v.optional(v.string()),
  /** Signed source/output video URL when no poster image exists — first-frame thumbs. */
  signedMediaUrl: v.optional(v.string()),
  previewKind: v.optional(v.union(v.literal("image"), v.literal("video"))),
});

export function emptyProjectJson(
  name: string,
  folderId: Id<"folders">,
  frameRatio = "16:9",
) {
  return JSON.stringify({
    name,
    folderId,
    duration: 30,
    frameRatio,
    tracks: [
      { id: "track-v1", kind: "video", label: "V1" },
      { id: "track-audio", kind: "audio", label: "Audio" },
    ],
    clips: [],
  });
}

const DEFAULT_IMAGE_CLIP_SEC = 3;
const DEFAULT_MEDIA_CLIP_SEC = 5;

function newClipId(): string {
  return `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function requireFolderOwner(ctx: QueryCtx | MutationCtx, folderId: Id<"folders">, ownerId: Id<"users">) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.ownerId !== ownerId || folder.deletedAt) {
    throw new Error("Folder not found.");
  }
  return folder;
}

async function requireProjectOwner(ctx: QueryCtx | MutationCtx, projectId: Id<"videoEditProjects">, ownerId: Id<"users">) {
  const row = await ctx.db.get(projectId);
  if (!row || row.ownerId !== ownerId) {
    throw new Error("Edit project not found.");
  }
  return row;
}

function parseProject(projectJson: string) {
  try {
    return JSON.parse(projectJson) as Record<string, unknown>;
  } catch {
    throw new Error("Saved edit project is corrupted.");
  }
}

function toListRow(row: {
  _id: Id<"videoEditProjects">;
  _creationTime: number;
  ownerId: Id<"users">;
  folderId: Id<"folders">;
  name: string;
  sourceAssetId?: Id<"assets">;
  outputAssetId?: Id<"assets">;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    ownerId: row.ownerId,
    folderId: row.folderId,
    name: row.name,
    sourceAssetId: row.sourceAssetId,
    outputAssetId: row.outputAssetId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function previewAssetId(row: {
  sourceAssetId?: Id<"assets">;
  outputAssetId?: Id<"assets">;
}) {
  return row.outputAssetId ?? row.sourceAssetId;
}

/** Earliest image/video clip on the timeline — covers edits whose first frame is an image. */
function firstVisualClipAssetId(projectJson: string | undefined): Id<"assets"> | undefined {
  if (!projectJson) return undefined;
  try {
    const project = JSON.parse(projectJson) as {
      clips?: Array<{
        assetId?: string;
        kind?: string;
        startTime?: number;
        trackId?: string;
      }>;
      tracks?: Array<{ id?: string; kind?: string }>;
    };
    const videoTrackIds = new Set(
      (project.tracks ?? [])
        .filter((track) => track.kind === "video" && typeof track.id === "string")
        .map((track) => track.id as string),
    );
    const clips = (project.clips ?? [])
      .filter((clip) => {
        if (!clip?.assetId) return false;
        if (clip.kind !== "image" && clip.kind !== "video") return false;
        if (videoTrackIds.size > 0 && clip.trackId && !videoTrackIds.has(clip.trackId)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
    const first = clips[0]?.assetId;
    return first ? (first as Id<"assets">) : undefined;
  } catch {
    return undefined;
  }
}

function resolvePreviewAssetId(row: {
  sourceAssetId?: Id<"assets">;
  outputAssetId?: Id<"assets">;
  projectJson?: string;
}) {
  return row.outputAssetId ?? firstVisualClipAssetId(row.projectJson) ?? row.sourceAssetId;
}

async function withSignedPreviewThumbs(
  ctx: QueryCtx,
  rows: Array<{
    _id: Id<"videoEditProjects">;
    _creationTime: number;
    ownerId: Id<"users">;
    folderId: Id<"folders">;
    name: string;
    projectJson?: string;
    sourceAssetId?: Id<"assets">;
    outputAssetId?: Id<"assets">;
    deletedAt?: number;
    createdAt: number;
    updatedAt: number;
  }>,
  expiresUnix: number | undefined,
) {
  const base = rows.map(toListRow);
  if (expiresUnix === undefined || rows.length === 0) return base;

  const assets = await Promise.all(
    rows.map(async (row) => {
      const assetId = resolvePreviewAssetId(row);
      if (!assetId) return null;
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.deletedAt || asset.ownerId !== row.ownerId) return null;
      if (asset.kind !== "image" && asset.kind !== "video") return null;
      return asset;
    }),
  );

  const thumbPaths = assets.map((asset) => (asset ? assetThumbnailPath(asset) : undefined));
  // Videos without a poster still need a signed media URL for <video> first-frame thumbs.
  // Images always go through thumbPaths (bunnyPath).
  const videoPaths = assets.map((asset) => {
    if (!asset || asset.kind !== "video" || !asset.bunnyPath) return undefined;
    if (assetThumbnailPath(asset)) return undefined;
    return asset.bunnyPath;
  });

  const [thumbs, lqips, videos] = await Promise.all([
    signBunnyCdnUrls(thumbPaths, expiresUnix, THUMB_TRANSFORM),
    signBunnyCdnUrls(thumbPaths, expiresUnix, LQIP_TRANSFORM),
    signBunnyCdnUrls(videoPaths, expiresUnix),
  ]);

  return base.map((row, index) => {
    const asset = assets[index];
    const thumbPath = asset ? assetThumbnailPath(asset) : undefined;
    const videoPath =
      asset && asset.kind === "video" && asset.bunnyPath && !thumbPath
        ? asset.bunnyPath
        : undefined;
    return {
      ...row,
      signedThumbnailUrl: thumbPath ? thumbs.get(thumbPath) : undefined,
      signedThumbnailLqipUrl: thumbPath ? lqips.get(thumbPath) : undefined,
      signedMediaUrl: videoPath ? videos.get(videoPath) : undefined,
      previewKind:
        asset?.kind === "image" || asset?.kind === "video" ? asset.kind : undefined,
    };
  });
}

export const listByFolder = authedQuery({
  args: {
    folderId: v.id("folders"),
    includeDeleted: v.optional(v.boolean()),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(listRowReturn),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId, ctx.user._id);
    const rows = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const visible = args.includeDeleted ? rows : rows.filter((row) => !row.deletedAt);
    return await withSignedPreviewThumbs(ctx, visible, args.expiresUnix);
  },
});

export const listTrash = authedQuery({
  args: {
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(listRowReturn),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    const trashed = rows.filter((row) => row.deletedAt !== undefined);
    return await withSignedPreviewThumbs(ctx, trashed, args.expiresUnix);
  },
});

function toProjectReturn(row: {
  _id: Id<"videoEditProjects">;
  _creationTime: number;
  ownerId: Id<"users">;
  folderId: Id<"folders">;
  name: string;
  projectJson: string;
  sourceAssetId?: Id<"assets">;
  outputAssetId?: Id<"assets">;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    ownerId: row.ownerId,
    folderId: row.folderId,
    name: row.name,
    project: parseProject(row.projectJson),
    sourceAssetId: row.sourceAssetId,
    outputAssetId: row.outputAssetId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const get = authedQuery({
  args: {
    projectId: v.id("videoEditProjects"),
  },
  returns: v.union(v.null(), projectReturn),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row || row.ownerId !== ctx.user._id || row.deletedAt) return null;
    return toProjectReturn(row);
  },
});

export const getBySourceAsset = authedQuery({
  args: {
    sourceAssetId: v.id("assets"),
  },
  returns: v.union(v.null(), projectReturn),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_source_asset", (q) => q.eq("sourceAssetId", args.sourceAssetId))
      .filter((q) => q.eq(q.field("ownerId"), ctx.user._id))
      .first();
    if (!row || row.deletedAt) return null;
    return toProjectReturn(row);
  },
});

export const create = authedMutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    sourceAssetId: v.optional(v.id("assets")),
  },
  returns: v.object({
    projectId: v.id("videoEditProjects"),
  }),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId, ctx.user._id);
    const now = Date.now();
    const name = args.name?.trim() || "Untitled";
    const projectId = await ctx.db.insert("videoEditProjects", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      name,
      projectJson: emptyProjectJson(name, args.folderId),
      sourceAssetId: args.sourceAssetId,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId };
  },
});

export const save = authedMutation({
  args: {
    projectId: v.optional(v.id("videoEditProjects")),
    folderId: v.id("folders"),
    name: v.string(),
    project: v.any(),
    sourceAssetId: v.optional(v.id("assets")),
  },
  returns: v.object({
    projectId: v.id("videoEditProjects"),
  }),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId, ctx.user._id);
    const now = Date.now();
    const name = args.name.trim() || "Untitled";
    const projectPayload = { ...args.project, name, folderId: args.folderId };
    const projectJson = JSON.stringify(projectPayload);
    if (args.projectId) {
      const existing = await requireProjectOwner(ctx, args.projectId, ctx.user._id);
      if (existing.deletedAt) {
        throw new Error("Edit project is in trash.");
      }
      await ctx.db.patch(args.projectId, {
        name,
        projectJson,
        folderId: args.folderId,
        updatedAt: now,
      });
      return { projectId: args.projectId };
    }
    const projectId = await ctx.db.insert("videoEditProjects", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      name,
      projectJson,
      sourceAssetId: args.sourceAssetId,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId };
  },
});

export const update = authedMutation({
  args: {
    projectId: v.id("videoEditProjects"),
    name: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireProjectOwner(ctx, args.projectId, ctx.user._id);
    if (row.deletedAt) {
      throw new Error("Edit project is in trash.");
    }
    if (args.folderId !== undefined) {
      await requireFolderOwner(ctx, args.folderId, ctx.user._id);
    }
    const nextName = args.name?.trim();
    let projectJson = row.projectJson;
    if (nextName) {
      try {
        const parsed = parseProject(row.projectJson);
        parsed.name = nextName;
        projectJson = JSON.stringify(parsed);
      } catch {
        // keep existing json if corrupt
      }
    }
    await ctx.db.patch(args.projectId, {
      ...(nextName ? { name: nextName, projectJson } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const moveToTrash = authedMutation({
  args: {
    projectId: v.id("videoEditProjects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId, ctx.user._id);
    await ctx.db.patch(args.projectId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const restore = authedMutation({
  args: {
    projectId: v.id("videoEditProjects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId, ctx.user._id);
    await ctx.db.patch(args.projectId, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const attachOutputAsset = authedMutation({
  args: {
    projectId: v.id("videoEditProjects"),
    outputAssetId: v.id("assets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId, ctx.user._id);
    await ctx.db.patch(args.projectId, {
      outputAssetId: args.outputAssetId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function requireFolderInSandbox(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.ownerId !== userId || folder.deletedAt) {
    throw new Error("Folder not found.");
  }
  if (!(await isFolderInSandbox(ctx, folderId, sandboxFolderId))) {
    throw new Error("Folder not found.");
  }
  return folder;
}

function seedProjectFromAssets(args: {
  name: string;
  folderId: Id<"folders">;
  frameRatio?: string;
  assets: Array<{
    _id: Id<"assets">;
    name: string;
    kind: "image" | "video" | "audio" | "document";
    durationSeconds?: number;
  }>;
}): string {
  const frameRatio = args.frameRatio === "9:16" || args.frameRatio === "1:1"
    ? args.frameRatio
    : "16:9";
  const base = JSON.parse(emptyProjectJson(args.name, args.folderId, frameRatio)) as {
    name: string;
    folderId: Id<"folders">;
    duration: number;
    frameRatio: string;
    tracks: Array<{ id: string; kind: string; label: string }>;
    clips: Array<Record<string, unknown>>;
  };
  let videoCursor = 0;
  let audioCursor = 0;
  for (const asset of args.assets) {
    if (asset.kind === "video" || asset.kind === "image") {
      const duration =
        asset.kind === "image"
          ? DEFAULT_IMAGE_CLIP_SEC
          : Math.max(0.05, asset.durationSeconds ?? DEFAULT_MEDIA_CLIP_SEC);
      base.clips.push({
        id: newClipId(),
        assetId: asset._id,
        trackId: "track-v1",
        startTime: videoCursor,
        trimIn: 0,
        trimOut: duration,
        sourceDuration: duration,
        label: asset.name,
        kind: "video",
      });
      videoCursor += duration;
    } else if (asset.kind === "audio") {
      const duration = Math.max(0.05, asset.durationSeconds ?? DEFAULT_MEDIA_CLIP_SEC);
      base.clips.push({
        id: newClipId(),
        assetId: asset._id,
        trackId: "track-audio",
        startTime: audioCursor,
        trimIn: 0,
        trimOut: duration,
        sourceDuration: duration,
        label: asset.name,
        kind: "audio",
      });
      audioCursor += duration;
    }
  }
  base.duration = Math.max(30, videoCursor, audioCursor);
  return JSON.stringify(base);
}

export const createForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    sourceAssetId: v.optional(v.id("assets")),
    assetIds: v.optional(v.array(v.id("assets"))),
    frameRatio: v.optional(v.string()),
  },
  returns: projectReturn,
  handler: async (ctx, args) => {
    await requireFolderInSandbox(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const now = Date.now();
    const name = args.name?.trim() || "Untitled";
    const assetIds = args.assetIds ?? [];
    const assets = [];
    for (const assetId of assetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
        throw new Error("Asset not found");
      }
      if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
        throw new Error("Asset not found");
      }
      assets.push(asset);
    }
    if (args.sourceAssetId) {
      const source = await ctx.db.get("assets", args.sourceAssetId);
      if (!source || source.ownerId !== args.userId || source.deletedAt) {
        throw new Error("Source asset not found");
      }
      if (!(await isFolderInSandbox(ctx, source.folderId, args.sandboxFolderId))) {
        throw new Error("Source asset not found");
      }
    }
    const projectJson =
      assets.length > 0
        ? seedProjectFromAssets({
            name,
            folderId: args.folderId,
            frameRatio: args.frameRatio,
            assets,
          })
        : emptyProjectJson(args.name?.trim() || "Untitled", args.folderId, args.frameRatio ?? "16:9");
    const projectId = await ctx.db.insert("videoEditProjects", {
      ownerId: args.userId,
      folderId: args.folderId,
      name,
      projectJson,
      sourceAssetId: args.sourceAssetId,
      createdAt: now,
      updatedAt: now,
    });
    const row = await ctx.db.get("videoEditProjects", projectId);
    if (!row) throw new Error("Edit project missing after create");
    return toProjectReturn(row);
  },
});

export const getForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
  },
  returns: v.union(v.null(), projectReturn),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("videoEditProjects", args.projectId);
    if (!row || row.ownerId !== args.userId || row.deletedAt) return null;
    if (!(await isFolderInSandbox(ctx, row.folderId, args.sandboxFolderId))) {
      return null;
    }
    return toProjectReturn(row);
  },
});

export const listForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
  },
  returns: v.array(listRowReturn),
  handler: async (ctx, args) => {
    await requireFolderInSandbox(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const rows = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    return rows
      .filter((row) => !row.deletedAt && row.ownerId === args.userId)
      .map(toListRow);
  },
});

export const saveForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
    name: v.optional(v.string()),
    project: v.any(),
    folderId: v.optional(v.id("folders")),
  },
  returns: projectReturn,
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("videoEditProjects", args.projectId);
    if (!existing || existing.ownerId !== args.userId) {
      throw new Error("Edit project not found.");
    }
    if (existing.deletedAt) {
      throw new Error("Edit project is in trash.");
    }
    if (!(await isFolderInSandbox(ctx, existing.folderId, args.sandboxFolderId))) {
      throw new Error("Edit project not found.");
    }
    const folderId = args.folderId ?? existing.folderId;
    if (args.folderId !== undefined) {
      await requireFolderInSandbox(ctx, args.userId, folderId, args.sandboxFolderId);
    }
    const now = Date.now();
    const name = args.name?.trim() || existing.name;
    const projectPayload = { ...args.project, name, folderId };
    await ctx.db.patch(args.projectId, {
      name,
      projectJson: JSON.stringify(projectPayload),
      folderId,
      updatedAt: now,
    });
    const row = await ctx.db.get("videoEditProjects", args.projectId);
    if (!row) throw new Error("Edit project missing after save");
    return toProjectReturn(row);
  },
});

export const updateForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
    name: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: projectReturn,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("videoEditProjects", args.projectId);
    if (!row || row.ownerId !== args.userId) {
      throw new Error("Edit project not found.");
    }
    if (row.deletedAt) {
      throw new Error("Edit project is in trash.");
    }
    if (!(await isFolderInSandbox(ctx, row.folderId, args.sandboxFolderId))) {
      throw new Error("Edit project not found.");
    }
    if (args.folderId !== undefined) {
      await requireFolderInSandbox(ctx, args.userId, args.folderId, args.sandboxFolderId);
    }
    const nextName = args.name?.trim();
    let projectJson = row.projectJson;
    if (nextName) {
      try {
        const parsed = parseProject(row.projectJson);
        parsed.name = nextName;
        projectJson = JSON.stringify(parsed);
      } catch {
        // keep existing json if corrupt
      }
    }
    await ctx.db.patch(args.projectId, {
      ...(nextName ? { name: nextName, projectJson } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get("videoEditProjects", args.projectId);
    if (!updated) throw new Error("Edit project missing after update");
    return toProjectReturn(updated);
  },
});
