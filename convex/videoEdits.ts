import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

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
});

function emptyProjectJson(name: string, folderId: Id<"folders">) {
  return JSON.stringify({
    name,
    folderId,
    duration: 30,
    tracks: [
      { id: "track-video", kind: "video", label: "Video" },
      { id: "track-audio", kind: "audio", label: "Music" },
    ],
    clips: [],
  });
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

export const listByFolder = authedQuery({
  args: {
    folderId: v.id("folders"),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(listRowReturn),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId, ctx.user._id);
    const rows = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const visible = args.includeDeleted ? rows : rows.filter((row) => !row.deletedAt);
    return visible.map(toListRow);
  },
});

export const listTrash = authedQuery({
  args: {},
  returns: v.array(listRowReturn),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return rows.filter((row) => row.deletedAt !== undefined).map(toListRow);
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
    const name = args.name?.trim() || "Untitled edit";
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
    const name = args.name.trim() || "Untitled edit";
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
