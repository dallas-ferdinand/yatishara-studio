import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const approvalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
  v.literal("executing"),
  v.literal("completed"),
  v.literal("failed"),
);

const approvalReturn = v.object({
  _id: v.id("assistanceApprovals"),
  threadId: v.id("generationThreads"),
  briefId: v.id("guidedBriefs"),
  action: v.string(),
  title: v.string(),
  summary: v.string(),
  status: approvalStatus,
  estimatedCredits: v.optional(v.number()),
  resultJson: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listForThread = authedQuery({
  args: { threadId: v.id("generationThreads") },
  returns: v.array(approvalReturn),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("generationThreads", args.threadId);
    if (!thread || thread.ownerId !== ctx.user._id) return [];
    const rows = await ctx.db
      .query("assistanceApprovals")
      .withIndex("by_thread_and_status", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows
      .filter((row) => row.ownerId === ctx.user._id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({
        _id: row._id,
        threadId: row.threadId,
        briefId: row.briefId,
        action: row.action,
        title: row.title,
        summary: row.summary,
        status: row.status,
        estimatedCredits: row.estimatedCredits,
        resultJson: row.resultJson,
        error: row.error,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const decide = authedMutation({
  args: {
    approvalId: v.id("assistanceApprovals"),
    decision: v.union(v.literal("approve"), v.literal("deny")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get("assistanceApprovals", args.approvalId);
    if (!approval || approval.ownerId !== ctx.user._id) {
      throw new Error("Approval request not found");
    }
    if (approval.status !== "pending") return null;
    const now = Date.now();
    if (args.decision === "deny") {
      await ctx.db.patch(approval._id, {
        status: "denied",
        decidedAt: now,
        updatedAt: now,
      });
      return null;
    }
    await ctx.db.patch(approval._id, {
      status: "approved",
      decidedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.assistanceApprovals.execute,
      { approvalId: approval._id },
    );
    return null;
  },
});

async function requireFolder(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<Doc<"folders">> {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ownerId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  return folder;
}

async function isDescendant(
  ctx: MutationCtx,
  candidateId: Id<"folders">,
  ancestorId: Id<"folders">,
): Promise<boolean> {
  let current: Id<"folders"> | undefined = candidateId;
  for (let depth = 0; current && depth < 100; depth += 1) {
    if (current === ancestorId) return true;
    const folder: Doc<"folders"> | null = await ctx.db.get("folders", current);
    current = folder?.parentId;
  }
  return false;
}

export const executeWorkspaceMutation = internalMutation({
  args: { approvalId: v.id("assistanceApprovals") },
  returns: v.object({
    action: v.string(),
    elementId: v.optional(v.id("elements")),
    elementFolderId: v.optional(v.id("folders")),
    elementReferenceAssetIds: v.optional(v.array(v.id("assets"))),
    elementSourceMode: v.optional(
      v.union(v.literal("photographic"), v.literal("designed")),
    ),
  }),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get("assistanceApprovals", args.approvalId);
    if (!approval) {
      throw new Error("Approval request is not executable");
    }
    if (
      approval.status === "executing" ||
      approval.status === "completed" ||
      approval.status === "failed"
    ) {
      return { action: "noop" };
    }
    if (approval.status !== "approved") {
      throw new Error("Approval request is not executable");
    }
    await ctx.db.patch(approval._id, {
      status: "executing",
      updatedAt: Date.now(),
    });
    const input = JSON.parse(approval.argumentsJson) as {
      kind?: "folder" | "asset" | "document" | "element";
      id?: string;
      destinationFolderId?: string;
      elementId?: string;
    };
    if (approval.action === "element_build") {
      const elementId = String(input.elementId ?? "") as Id<"elements">;
      const element = await ctx.db.get("elements", elementId);
      if (
        !element ||
        element.ownerId !== approval.ownerId ||
        element.deletedAt ||
        !element.folderId
      ) {
        throw new Error("Element not found");
      }
      return {
        action: approval.action,
        elementId,
        elementFolderId: element.folderId,
        elementReferenceAssetIds:
          element.referenceAssetIds ?? element.sourceAssetIds,
        elementSourceMode: element.sourceMode ?? "designed",
      };
    }
    const kind = input.kind;
    const id = String(input.id ?? "");
    if (!kind || !id) throw new Error("Approval target is missing");
    const now = Date.now();
    if (approval.action === "trash") {
      const table =
        kind === "folder"
          ? "folders"
          : kind === "asset"
            ? "assets"
            : kind === "document"
              ? "documents"
              : "elements";
      const row = await ctx.db.get(table, id as never);
      if (!row || row.ownerId !== approval.ownerId || row.deletedAt) {
        throw new Error("Approval target not found");
      }
      await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
    } else if (approval.action === "move") {
      const destinationFolderId = String(
        input.destinationFolderId ?? "",
      ) as Id<"folders">;
      await requireFolder(ctx, approval.ownerId, destinationFolderId);
      if (kind === "folder") {
        const folderId = id as Id<"folders">;
        await requireFolder(ctx, approval.ownerId, folderId);
        if (
          folderId === destinationFolderId ||
          (await isDescendant(ctx, destinationFolderId, folderId))
        ) {
          throw new Error("Folder cannot be moved into itself or its descendant");
        }
        await ctx.db.patch(folderId, {
          parentId: destinationFolderId,
          updatedAt: now,
        });
      } else {
        const table =
          kind === "asset"
            ? "assets"
            : kind === "document"
              ? "documents"
              : "elements";
        const row = await ctx.db.get(table, id as never);
        if (!row || row.ownerId !== approval.ownerId || row.deletedAt) {
          throw new Error("Approval target not found");
        }
        await ctx.db.patch(row._id, {
          folderId: destinationFolderId,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(approval._id, {
      status: "completed",
      resultJson: JSON.stringify({ ok: true }),
      executedAt: now,
      updatedAt: now,
    });
    return { action: approval.action };
  },
});

export const complete = internalMutation({
  args: {
    approvalId: v.id("assistanceApprovals"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get("assistanceApprovals", args.approvalId);
    if (!approval) return null;
    await ctx.db.patch(approval._id, {
      status: args.status,
      resultJson: args.resultJson,
      error: args.error,
      executedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const execute = internalAction({
  args: { approvalId: v.id("assistanceApprovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const execution = await ctx.runMutation(
        internal.assistanceApprovals.executeWorkspaceMutation,
        { approvalId: args.approvalId },
      );
      if (execution.action === "noop") return null;
      let result: Record<string, unknown> = { ok: true };
      if (
        execution.action === "element_build" &&
        execution.elementId &&
        execution.elementFolderId
      ) {
        const built = await ctx.runAction(
          internal.elementActions.generateElementSheetForApi,
          {
            userId: (
              await ctx.runQuery(
                internal.assistanceApprovals.getExecutionOwner,
                { approvalId: args.approvalId },
              )
            ).ownerId,
            sandboxFolderId: execution.elementFolderId,
            elementId: execution.elementId,
            referenceAssetIds: execution.elementReferenceAssetIds,
            sourceMode: execution.elementSourceMode ?? "designed",
            stylePresetSlug: "unstyled",
            expiresUnix: Math.floor(Date.now() / 1000) + 3600,
          },
        );
        result = {
          ok: true,
          elementId: built.elementId,
          buildStatus: built.buildStatus,
          creditsSpent: built.creditsSpent,
        };
      }
      await ctx.runMutation(internal.assistanceApprovals.complete, {
        approvalId: args.approvalId,
        status: "completed",
        resultJson: JSON.stringify(result),
      });
    } catch (error) {
      await ctx.runMutation(internal.assistanceApprovals.complete, {
        approvalId: args.approvalId,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Approval execution failed",
      });
    }
    return null;
  },
});

export const getExecutionOwner = internalQuery({
  args: { approvalId: v.id("assistanceApprovals") },
  returns: v.object({ ownerId: v.id("users") }),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get("assistanceApprovals", args.approvalId);
    if (!approval) {
      throw new Error("Approval request not found");
    }
    return { ownerId: approval.ownerId };
  },
});
