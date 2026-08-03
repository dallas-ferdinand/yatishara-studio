/**
 * Live-link share access helpers (no folders/assets module imports).
 * Kept separate so folders/assets/documents can static-import without cycles
 * and without Convex-unsupported dynamic `import()`.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type StudioShareItemKind =
  | "asset"
  | "document"
  | "element"
  | "videoEdit"
  | "folder";

export async function findActiveGrant(
  ctx: QueryCtx | MutationCtx,
  toUserId: Id<"users">,
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<Doc<"studioShares"> | null> {
  const rows = await ctx.db
    .query("studioShares")
    .withIndex("by_to_and_item", (q) =>
      q.eq("toUserId", toUserId).eq("itemKind", itemKind).eq("itemId", itemId),
    )
    .collect();
  return rows.find((row) => !row.revokedAt) ?? null;
}

export async function folderAncestorIds(
  ctx: QueryCtx | MutationCtx,
  folderId: Id<"folders">,
): Promise<Id<"folders">[]> {
  const ids: Id<"folders">[] = [];
  let current: Id<"folders"> | undefined = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    const folder: Doc<"folders"> | null = await ctx.db.get("folders", current);
    if (!folder || folder.deletedAt) break;
    current = folder.parentId;
  }
  return ids;
}

export async function viewerHasFolderGrantCovering(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<boolean> {
  const ancestors = await folderAncestorIds(ctx, folderId);
  for (const id of ancestors) {
    if (await findActiveGrant(ctx, viewerId, "folder", id)) return true;
  }
  return false;
}

/**
 * True when viewer owns the item OR has an active live-link grant
 * (direct or via an ancestor folder grant).
 */
export async function viewerCanAccessSharedItem(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<boolean> {
  if (itemKind === "asset") {
    const asset = await ctx.db.get("assets", itemId as Id<"assets">);
    if (!asset || asset.deletedAt) return false;
    if (asset.ownerId === viewerId) return true;
    if (await findActiveGrant(ctx, viewerId, "asset", itemId)) return true;
    return await viewerHasFolderGrantCovering(ctx, viewerId, asset.folderId);
  }
  if (itemKind === "document") {
    const doc = await ctx.db.get("documents", itemId as Id<"documents">);
    if (!doc || doc.deletedAt) return false;
    if (doc.ownerId === viewerId) return true;
    if (await findActiveGrant(ctx, viewerId, "document", itemId)) return true;
    return await viewerHasFolderGrantCovering(ctx, viewerId, doc.folderId);
  }
  if (itemKind === "element") {
    const element = await ctx.db.get("elements", itemId as Id<"elements">);
    if (!element || element.deletedAt) return false;
    if (element.ownerId === viewerId) return true;
    if (await findActiveGrant(ctx, viewerId, "element", itemId)) return true;
    if (!element.folderId) return false;
    return await viewerHasFolderGrantCovering(ctx, viewerId, element.folderId);
  }
  if (itemKind === "videoEdit") {
    const project = await ctx.db.get(
      "videoEditProjects",
      itemId as Id<"videoEditProjects">,
    );
    if (!project || project.deletedAt) return false;
    if (project.ownerId === viewerId) return true;
    if (await findActiveGrant(ctx, viewerId, "videoEdit", itemId)) return true;
    return await viewerHasFolderGrantCovering(ctx, viewerId, project.folderId);
  }
  const folder = await ctx.db.get("folders", itemId as Id<"folders">);
  if (!folder || folder.deletedAt) return false;
  if (folder.ownerId === viewerId) return true;
  return await viewerHasFolderGrantCovering(ctx, viewerId, folder._id);
}

export async function requireAssetOwnerOrShare(
  ctx: (QueryCtx | MutationCtx) & {
    user: Doc<"users"> & { _id: Id<"users"> };
  },
  assetId: Id<"assets">,
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get("assets", assetId);
  if (!asset || asset.deletedAt) {
    throw new Error("Asset not found");
  }
  if (asset.ownerId === ctx.user._id) return asset;
  const ok = await viewerCanAccessSharedItem(
    ctx,
    ctx.user._id,
    "asset",
    assetId,
  );
  if (!ok) throw new Error("Unauthorized");
  return asset;
}
