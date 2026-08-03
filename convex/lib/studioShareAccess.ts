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

export type StudioSharePermission = "view" | "edit";

export type ViewerShareLevel = "owner" | "edit" | "view";

type AuthedCtx = (QueryCtx | MutationCtx) & {
  user: Doc<"users"> & { _id: Id<"users"> };
};

function grantPermission(
  grant: Doc<"studioShares"> | null,
): StudioSharePermission | null {
  if (!grant) return null;
  return grant.permission === "edit" ? "edit" : "view";
}

function stronger(
  a: StudioSharePermission | null,
  b: StudioSharePermission | null,
): StudioSharePermission | null {
  if (a === "edit" || b === "edit") return "edit";
  if (a === "view" || b === "view") return "view";
  return null;
}

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

export async function viewerFolderGrantPermission(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<StudioSharePermission | null> {
  const ancestors = await folderAncestorIds(ctx, folderId);
  let best: StudioSharePermission | null = null;
  for (const id of ancestors) {
    best = stronger(
      best,
      grantPermission(await findActiveGrant(ctx, viewerId, "folder", id)),
    );
    if (best === "edit") return "edit";
  }
  return best;
}

export async function viewerHasFolderGrantCovering(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  folderId: Id<"folders">,
): Promise<boolean> {
  return (await viewerFolderGrantPermission(ctx, viewerId, folderId)) != null;
}

/**
 * Owner / edit / view for a live-link item, or null if no access.
 * Folder grants cover descendants; strongest ancestor/direct wins.
 */
export async function viewerSharePermission(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<ViewerShareLevel | null> {
  if (itemKind === "asset") {
    const asset = await ctx.db.get("assets", itemId as Id<"assets">);
    if (!asset || asset.deletedAt) return null;
    if (asset.ownerId === viewerId) return "owner";
    const direct = grantPermission(
      await findActiveGrant(ctx, viewerId, "asset", itemId),
    );
    const viaFolder = await viewerFolderGrantPermission(
      ctx,
      viewerId,
      asset.folderId,
    );
    const best = stronger(direct, viaFolder);
    return best;
  }
  if (itemKind === "document") {
    const doc = await ctx.db.get("documents", itemId as Id<"documents">);
    if (!doc || doc.deletedAt) return null;
    if (doc.ownerId === viewerId) return "owner";
    const direct = grantPermission(
      await findActiveGrant(ctx, viewerId, "document", itemId),
    );
    const viaFolder = await viewerFolderGrantPermission(
      ctx,
      viewerId,
      doc.folderId,
    );
    return stronger(direct, viaFolder);
  }
  if (itemKind === "element") {
    const element = await ctx.db.get("elements", itemId as Id<"elements">);
    if (!element || element.deletedAt) return null;
    if (element.ownerId === viewerId) return "owner";
    const direct = grantPermission(
      await findActiveGrant(ctx, viewerId, "element", itemId),
    );
    if (!element.folderId) return direct;
    const viaFolder = await viewerFolderGrantPermission(
      ctx,
      viewerId,
      element.folderId,
    );
    return stronger(direct, viaFolder);
  }
  if (itemKind === "videoEdit") {
    const project = await ctx.db.get(
      "videoEditProjects",
      itemId as Id<"videoEditProjects">,
    );
    if (!project || project.deletedAt) return null;
    if (project.ownerId === viewerId) return "owner";
    const direct = grantPermission(
      await findActiveGrant(ctx, viewerId, "videoEdit", itemId),
    );
    const viaFolder = await viewerFolderGrantPermission(
      ctx,
      viewerId,
      project.folderId,
    );
    return stronger(direct, viaFolder);
  }
  const folder = await ctx.db.get("folders", itemId as Id<"folders">);
  if (!folder || folder.deletedAt) return null;
  if (folder.ownerId === viewerId) return "owner";
  return await viewerFolderGrantPermission(ctx, viewerId, folder._id);
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
  return (await viewerSharePermission(ctx, viewerId, itemKind, itemId)) != null;
}

export async function requireFolderOwnerOrShare(
  ctx: AuthedCtx,
  folderId: Id<"folders">,
  options?: { allowDeleted?: boolean },
): Promise<Doc<"folders">> {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  if (folder.deletedAt && !options?.allowDeleted) {
    throw new Error("Folder not found");
  }
  if (folder.ownerId === ctx.user._id) return folder;
  const ok = await viewerCanAccessSharedItem(
    ctx,
    ctx.user._id,
    "folder",
    folderId,
  );
  if (!ok) throw new Error("Unauthorized");
  return folder;
}

export async function requireAssetOwnerOrShare(
  ctx: AuthedCtx,
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

/** Owner or edit grant — for mutate paths. Trash/delete stay owner-only. */
export async function requireShareEdit(
  ctx: AuthedCtx,
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<ViewerShareLevel> {
  const level = await viewerSharePermission(ctx, ctx.user._id, itemKind, itemId);
  if (level === "owner" || level === "edit") return level;
  throw new Error("Unauthorized");
}

export async function requireFolderOwnerOrEditShare(
  ctx: AuthedCtx,
  folderId: Id<"folders">,
): Promise<Doc<"folders">> {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  if (folder.ownerId === ctx.user._id) return folder;
  const level = await viewerSharePermission(
    ctx,
    ctx.user._id,
    "folder",
    folderId,
  );
  if (level !== "edit") throw new Error("Unauthorized");
  return folder;
}
