/**
 * Ownership-checked Studio workspace access for the Assistance agent loop.
 * Mirrors MCP-style folder/file/element/generation reads without API-key sandbox.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { signBunnyFullUrl } from "./lib/bunny";
import { imageCreditCost } from "./lib/generationPricing";

async function requireOwnedFolder(
  ctx: Pick<QueryCtx, "db">,
  ownerId: Id<"users">,
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ownerId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  return folder;
}

export const listFoldersForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    parentId: v.optional(v.id("folders")),
  },
  returns: v.array(
    v.object({
      id: v.id("folders"),
      name: v.string(),
      parentId: v.optional(v.id("folders")),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.parentId) {
      await requireOwnedFolder(ctx, args.ownerId, args.parentId);
    }
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.ownerId).eq("parentId", args.parentId),
      )
      .collect();
    return folders
      .filter((folder) => !folder.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((folder) => ({
        id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
      }));
  },
});

export const getFolderForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    folderId: v.id("folders"),
  },
  returns: v.object({
    id: v.id("folders"),
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    icon: v.string(),
    color: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const folder = await requireOwnedFolder(ctx, args.ownerId, args.folderId);
    return {
      id: folder._id,
      name: folder.name,
      parentId: folder.parentId,
      icon: folder.icon,
      color: folder.color,
    };
  },
});

export const getThreadHistoryForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    beforeOrder: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
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
    if (!thread || thread.ownerId !== args.ownerId) {
      return { events: [], nextBeforeOrder: undefined };
    }
    const limit = Math.min(Math.max(args.limit ?? 24, 1), 50);
    const collected: Array<{
      order: number;
      kind: string;
      text?: string;
      stage?: string;
      generationJobId?: Id<"generationJobs">;
      assetIds?: Id<"assets">[];
    }> = [];
    let cursor = args.beforeOrder;
    const batchSize = Math.min(Math.max(limit * 2, 40), 100);
    const maxScanRows = 8_000;
    let scannedTotal = 0;
    let exhausted = false;
    while (collected.length < limit + 1 && scannedTotal < maxScanRows) {
      const rows = await ctx.db
        .query("generationEvents")
        .withIndex("by_thread_and_order", (q) => {
          const owned = q.eq("threadId", args.threadId);
          return cursor !== undefined
            ? owned.lt("order", cursor)
            : owned;
        })
        .order("desc")
        .take(batchSize);
      if (rows.length === 0) {
        exhausted = true;
        break;
      }
      scannedTotal += rows.length;
      for (const event of rows) {
        if (event.ownerId !== args.ownerId || event.kind === "folder_switched") {
          continue;
        }
        collected.push({
          order: event.order,
          kind: event.kind,
          text: event.prompt ?? event.message,
          stage: event.stage,
          generationJobId: event.generationJobId,
          assetIds: event.assetIds,
        });
        if (collected.length >= limit + 1) break;
      }
      cursor = rows[rows.length - 1]?.order;
      if (rows.length < batchSize) {
        exhausted = true;
        break;
      }
    }
    const page = collected.slice(0, limit);
    const events = page.reverse();
    return {
      events,
      nextBeforeOrder:
        collected.length > limit || (!exhausted && page.length >= limit)
          ? page[0]?.order
          : undefined,
    };
  },
});

export const getFolderContentsForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    expiresUnix: v.number(),
  },
  returns: v.object({
    folder: v.object({
      id: v.id("folders"),
      name: v.string(),
      parentId: v.optional(v.id("folders")),
    }),
    folders: v.array(
      v.object({
        id: v.id("folders"),
        name: v.string(),
        parentId: v.optional(v.id("folders")),
      }),
    ),
    assets: v.array(
      v.object({
        id: v.id("assets"),
        name: v.string(),
        kind: v.string(),
        mimeType: v.string(),
        url: v.optional(v.string()),
      }),
    ),
    documents: v.array(
      v.object({
        id: v.id("documents"),
        title: v.string(),
      }),
    ),
    elements: v.array(
      v.object({
        id: v.id("elements"),
        name: v.string(),
        type: v.string(),
        buildStatus: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const folder = await requireOwnedFolder(ctx, args.ownerId, args.folderId);
    const subfolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.ownerId).eq("parentId", args.folderId),
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
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    const assetRows = [];
    for (const asset of assets) {
      if (asset.deletedAt || asset.ownerId !== args.ownerId) continue;
      let url: string | undefined;
      if (asset.bunnyPath) {
        url = await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind);
      }
      assetRows.push({
        id: asset._id,
        name: asset.name,
        kind: asset.kind,
        mimeType: asset.mimeType,
        url,
      });
    }

    return {
      folder: {
        id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
      },
      folders: subfolders
        .filter((item) => !item.deletedAt)
        .map((item) => ({
          id: item._id,
          name: item.name,
          parentId: item.parentId,
        })),
      assets: assetRows,
      documents: documents
        .filter((item) => !item.deletedAt && item.ownerId === args.ownerId)
        .map((item) => ({ id: item._id, title: item.title })),
      elements: elements
        .filter((item) => !item.deletedAt && item.ownerId === args.ownerId)
        .map((item) => ({
          id: item._id,
          name: item.name,
          type: item.type,
          buildStatus: item.sheetAssetId ? "built" : "unbuilt",
        })),
    };
  },
});

export const getAssetForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    assetId: v.id("assets"),
    expiresUnix: v.number(),
  },
  returns: v.union(
    v.object({
      id: v.id("assets"),
      name: v.string(),
      kind: v.string(),
      mimeType: v.string(),
      folderId: v.id("folders"),
      url: v.optional(v.string()),
      sourceGenerationJobId: v.optional(v.id("generationJobs")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.ownerId || asset.deletedAt) return null;
    let url: string | undefined;
    if (asset.bunnyPath) {
      url = await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind);
    }
    return {
      id: asset._id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      folderId: asset.folderId,
      url,
      sourceGenerationJobId: asset.sourceGenerationJobId,
    };
  },
});

export const getElementForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    elementId: v.id("elements"),
    expiresUnix: v.number(),
  },
  returns: v.union(
    v.object({
      id: v.id("elements"),
      name: v.string(),
      type: v.string(),
      description: v.optional(v.string()),
      folderId: v.optional(v.id("folders")),
      sheetAssetId: v.optional(v.id("assets")),
      sheetUrl: v.optional(v.string()),
      styleRules: v.optional(v.string()),
      renderMode: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.ownerId !== args.ownerId || element.deletedAt) {
      return null;
    }
    let sheetUrl: string | undefined;
    if (element.sheetAssetId) {
      const sheet = await ctx.db.get("assets", element.sheetAssetId);
      if (
        sheet &&
        sheet.ownerId === args.ownerId &&
        !sheet.deletedAt &&
        sheet.bunnyPath
      ) {
        sheetUrl = await signBunnyFullUrl(
          sheet.bunnyPath,
          args.expiresUnix,
          sheet.kind,
        );
      }
    }
    return {
      id: element._id,
      name: element.name,
      type: element.type,
      description: element.description,
      folderId: element.folderId,
      sheetAssetId: element.sheetAssetId,
      sheetUrl,
      styleRules: element.styleRules,
      renderMode: element.renderMode,
    };
  },
});

export const listElementsForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.id("elements"),
      name: v.string(),
      type: v.string(),
      description: v.optional(v.string()),
      folderId: v.optional(v.id("folders")),
      buildStatus: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 50);
    const rows = args.type
      ? await ctx.db
          .query("elements")
          .withIndex("by_owner_and_type", (q) =>
            q.eq("ownerId", args.ownerId).eq("type", args.type as never),
          )
          .take(limit * 2)
      : await ctx.db
          .query("elements")
          .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
          .take(limit * 2);
    return rows
      .filter((element) => !element.deletedAt)
      .slice(0, limit)
      .map((element) => ({
        id: element._id,
        name: element.name,
        type: element.type,
        description: element.description,
        folderId: element.folderId,
        buildStatus: element.sheetAssetId ? "built" : "unbuilt",
      }));
  },
});

export const listThreadGenerationsForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.id("generationJobs"),
      mode: v.string(),
      stage: v.string(),
      aspectRatio: v.optional(v.string()),
      resolution: v.optional(v.string()),
      userPrompt: v.string(),
      error: v.optional(v.string()),
      createdAt: v.number(),
      outputAssetIds: v.array(v.id("assets")),
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("generationThreads", args.threadId);
    if (!thread || thread.ownerId !== args.ownerId) return [];
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 40);
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    const out = [];
    for (const job of jobs) {
      if (job.ownerId !== args.ownerId) continue;
      const outputs = await ctx.db
        .query("generationOutputs")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .collect();
      out.push({
        id: job._id,
        mode: job.mode,
        stage: job.stage,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        userPrompt: job.userPrompt.slice(0, 2_000),
        error: job.error,
        createdAt: job.createdAt,
        outputAssetIds: outputs
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((row) => row.assetId),
      });
    }
    return out;
  },
});

export const getGenerationForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    generationJobId: v.id("generationJobs"),
  },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("generationJobs"),
      mode: v.string(),
      stage: v.string(),
      model: v.string(),
      prompt: v.string(),
      enhancedPrompt: v.optional(v.string()),
      aspectRatio: v.optional(v.string()),
      resolution: v.optional(v.string()),
      error: v.optional(v.string()),
      outputAssetIds: v.array(v.id("assets")),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.generationJobId);
    if (!job || job.ownerId !== args.ownerId) return null;
    const outputs = await ctx.db
      .query("generationOutputs")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    return {
      id: job._id,
      mode: job.mode,
      stage: job.stage,
      model: job.resolvedModel,
      prompt: job.userPrompt.slice(0, 4_000),
      enhancedPrompt: job.enhancedPrompt?.slice(0, 4_000),
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
      error: job.error,
      outputAssetIds: outputs
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((output) => output.assetId),
    };
  },
});

export const getDocumentForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    documentId: v.id("documents"),
  },
  returns: v.union(
    v.object({
      id: v.id("documents"),
      title: v.string(),
      folderId: v.id("folders"),
      contentMarkdown: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db.get("documents", args.documentId);
    if (!document || document.ownerId !== args.ownerId || document.deletedAt) {
      return null;
    }
    return {
      id: document._id,
      title: document.title,
      folderId: document.folderId,
      contentMarkdown: document.contentMarkdown.slice(0, 20_000),
    };
  },
});

export const getCreditBalanceForAgent = internalQuery({
  args: { ownerId: v.id("users") },
  returns: v.object({
    creditBalance: v.number(),
    reservedCredits: v.number(),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.ownerId))
      .unique();
    return {
      creditBalance: account?.creditBalance ?? 0,
      reservedCredits: account?.reservedCredits ?? 0,
    };
  },
});

export const validateApprovalTargetForAgent = internalQuery({
  args: {
    ownerId: v.id("users"),
    action: v.union(
      v.literal("trash"),
      v.literal("move"),
      v.literal("element_build"),
    ),
    kind: v.optional(
      v.union(
        v.literal("folder"),
        v.literal("asset"),
        v.literal("document"),
        v.literal("element"),
      ),
    ),
    id: v.optional(v.string()),
    destinationFolderId: v.optional(v.id("folders")),
    elementId: v.optional(v.id("elements")),
  },
  returns: v.object({
    ok: v.boolean(),
    label: v.optional(v.string()),
    estimatedCredits: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    if (args.destinationFolderId) {
      await requireOwnedFolder(ctx, args.ownerId, args.destinationFolderId);
    }
    if (args.action === "element_build") {
      if (!args.elementId) throw new Error("Element not found");
      const element = await ctx.db.get("elements", args.elementId);
      if (!element || element.ownerId !== args.ownerId || element.deletedAt) {
        throw new Error("Element not found");
      }
      if (element.type === "doc") {
        throw new Error("Document elements do not support paid sheet builds");
      }
      return {
        ok: true,
        label: element.name,
        estimatedCredits: imageCreditCost({
          resolution: "2K",
          hasReferenceInput:
            (element.referenceAssetIds ?? element.sourceAssetIds).length > 0,
        }),
      };
    }
    if (!args.kind || !args.id) throw new Error("Approval target not found");
    const table =
      args.kind === "folder"
        ? "folders"
        : args.kind === "asset"
          ? "assets"
          : args.kind === "document"
            ? "documents"
            : "elements";
    const row = await ctx.db.get(table, args.id as never);
    if (!row || row.ownerId !== args.ownerId || row.deletedAt) {
      throw new Error("Approval target not found");
    }
    const label =
      "name" in row
        ? String(row.name)
        : "title" in row
          ? String(row.title)
          : undefined;
    return { ok: true, label };
  },
});

const safeWorkspaceOperation = v.union(
  v.literal("create_folder"),
  v.literal("update_folder"),
  v.literal("create_document"),
  v.literal("update_document"),
  v.literal("create_element"),
  v.literal("update_element"),
  v.literal("update_asset"),
  v.literal("duplicate_asset"),
);

/**
 * Idempotent ownership-checked workspace writes for the Assistance agent.
 * Destructive operations and moves are intentionally excluded and approval-gated.
 */
export const performSafeWorkspaceToolCall = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    turnId: v.id("assistanceTurns"),
    toolCallId: v.string(),
    operation: safeWorkspaceOperation,
    argumentsJson: v.string(),
  },
  returns: v.object({
    idempotent: v.boolean(),
    resultJson: v.string(),
  }),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (
      !turn ||
      turn.ownerId !== args.ownerId ||
      turn.threadId !== args.threadId ||
      turn.phase !== "begun"
    ) {
      throw new Error("Assistance turn not found");
    }
    const existing = await ctx.db
      .query("assistanceToolCalls")
      .withIndex("by_turn_and_call", (q) =>
        q.eq("turnId", args.turnId).eq("toolCallId", args.toolCallId),
      )
      .unique();
    if (existing) {
      if (
        existing.toolName !== args.operation ||
        existing.argumentsJson !== args.argumentsJson
      ) {
        throw new Error("Tool call ID was reused with different arguments");
      }
      if (existing.status === "completed" && existing.outputJson) {
        return { idempotent: true, resultJson: existing.outputJson };
      }
      throw new Error(existing.error ?? "Tool call did not complete");
    }

    const input = JSON.parse(args.argumentsJson) as Record<string, unknown>;
    const now = Date.now();
    let result: Record<string, unknown> = { ok: true };
    if (args.operation === "create_folder") {
      const parentId =
        typeof input.parentId === "string"
          ? (input.parentId as Id<"folders">)
          : turn.briefId
            ? (await ctx.db.get("guidedBriefs", turn.briefId))?.threadId
              ? (await ctx.db.get("generationThreads", turn.threadId))?.linkedFolderId
              : undefined
            : undefined;
      if (!parentId) throw new Error("Parent folder is required");
      await requireOwnedFolder(ctx, args.ownerId, parentId);
      const name = String(input.name ?? "").trim().slice(0, 120);
      if (!name) throw new Error("Folder name is required");
      const folderId = await ctx.db.insert("folders", {
        ownerId: args.ownerId,
        parentId,
        name,
        icon: "Folder",
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      });
      result = { ok: true, folderId };
    } else if (args.operation === "update_folder") {
      const folderId = String(input.folderId ?? "") as Id<"folders">;
      await requireOwnedFolder(ctx, args.ownerId, folderId);
      const name = String(input.name ?? "").trim().slice(0, 120);
      if (!name) throw new Error("Folder name is required");
      await ctx.db.patch(folderId, { name, updatedAt: now });
      result = { ok: true, folderId };
    } else if (args.operation === "create_document") {
      const folderId = String(input.folderId ?? "") as Id<"folders">;
      await requireOwnedFolder(ctx, args.ownerId, folderId);
      const title = String(input.title ?? "").trim().slice(0, 160);
      if (!title) throw new Error("Document title is required");
      const documentId = await ctx.db.insert("documents", {
        ownerId: args.ownerId,
        folderId,
        title,
        contentMarkdown: String(input.contentMarkdown ?? "").slice(0, 100_000),
        createdAt: now,
        updatedAt: now,
      });
      result = { ok: true, documentId };
    } else if (args.operation === "update_document") {
      const documentId = String(input.documentId ?? "") as Id<"documents">;
      const document = await ctx.db.get("documents", documentId);
      if (!document || document.ownerId !== args.ownerId || document.deletedAt) {
        throw new Error("Document not found");
      }
      await ctx.db.patch(documentId, {
        ...(input.title !== undefined
          ? { title: String(input.title).trim().slice(0, 160) }
          : {}),
        ...(input.contentMarkdown !== undefined
          ? { contentMarkdown: String(input.contentMarkdown).slice(0, 100_000) }
          : {}),
        updatedAt: now,
      });
      result = { ok: true, documentId };
    } else if (args.operation === "create_element") {
      const folderId = String(input.folderId ?? "") as Id<"folders">;
      await requireOwnedFolder(ctx, args.ownerId, folderId);
      const type = String(input.type ?? "");
      if (!["character", "prop", "location", "doc", "style_sheet"].includes(type)) {
        throw new Error("Unsupported element type");
      }
      const name = String(input.name ?? "").trim().slice(0, 120);
      if (!name) throw new Error("Element name is required");
      const elementId = await ctx.db.insert("elements", {
        ownerId: args.ownerId,
        folderId,
        type: type as "character" | "prop" | "location" | "doc" | "style_sheet",
        name,
        description: String(input.description ?? "").slice(0, 10_000),
        sourceMode: "designed",
        sourceAssetIds: [],
        createdAt: now,
        updatedAt: now,
      });
      result = { ok: true, elementId };
    } else if (args.operation === "update_element") {
      const elementId = String(input.elementId ?? "") as Id<"elements">;
      const element = await ctx.db.get("elements", elementId);
      if (!element || element.ownerId !== args.ownerId || element.deletedAt) {
        throw new Error("Element not found");
      }
      await ctx.db.patch(elementId, {
        ...(input.name !== undefined
          ? { name: String(input.name).trim().slice(0, 120) }
          : {}),
        ...(input.description !== undefined
          ? { description: String(input.description).slice(0, 10_000) }
          : {}),
        updatedAt: now,
      });
      result = { ok: true, elementId };
    } else if (args.operation === "update_asset") {
      const assetId = String(input.assetId ?? "") as Id<"assets">;
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.ownerId || asset.deletedAt) {
        throw new Error("Asset not found");
      }
      const name = String(input.name ?? "").trim().slice(0, 200);
      if (!name) throw new Error("Asset name is required");
      await ctx.db.patch(assetId, { name, updatedAt: now });
      result = { ok: true, assetId };
    } else if (args.operation === "duplicate_asset") {
      const assetId = String(input.assetId ?? "") as Id<"assets">;
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.ownerId || asset.deletedAt) {
        throw new Error("Asset not found");
      }
      const folderId =
        input.folderId !== undefined
          ? (String(input.folderId) as Id<"folders">)
          : asset.folderId;
      await requireOwnedFolder(ctx, args.ownerId, folderId);
      const duplicatedAssetId = await ctx.db.insert("assets", {
        ownerId: args.ownerId,
        folderId,
        name:
          String(input.name ?? "").trim().slice(0, 200) ||
          `Copy of ${asset.name}`,
        kind: asset.kind,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        bunnyPath: asset.bunnyPath,
        bunnyStreamVideoId: asset.bunnyStreamVideoId,
        thumbnailPath: asset.thumbnailPath,
        sourceGenerationJobId: asset.sourceGenerationJobId,
        createdAt: now,
        updatedAt: now,
      });
      result = { ok: true, assetId: duplicatedAssetId };
    }

    const resultJson = JSON.stringify(result);
    await ctx.db.insert("assistanceToolCalls", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      turnId: args.turnId,
      toolCallId: args.toolCallId,
      toolName: args.operation,
      argumentsJson: args.argumentsJson,
      status: "completed",
      outputJson: resultJson,
      createdAt: now,
      updatedAt: now,
    });
    return { idempotent: false, resultJson };
  },
});

export const recordFailedWorkspaceToolCall = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    turnId: v.id("assistanceTurns"),
    toolCallId: v.string(),
    operation: safeWorkspaceOperation,
    argumentsJson: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (
      !turn ||
      turn.ownerId !== args.ownerId ||
      turn.threadId !== args.threadId
    ) {
      throw new Error("Assistance turn not found");
    }
    const existing = await ctx.db
      .query("assistanceToolCalls")
      .withIndex("by_turn_and_call", (q) =>
        q.eq("turnId", args.turnId).eq("toolCallId", args.toolCallId),
      )
      .unique();
    if (existing) return null;
    const now = Date.now();
    await ctx.db.insert("assistanceToolCalls", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      turnId: args.turnId,
      toolCallId: args.toolCallId,
      toolName: args.operation,
      argumentsJson: args.argumentsJson,
      status: "failed",
      error: args.error.slice(0, 500),
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});
