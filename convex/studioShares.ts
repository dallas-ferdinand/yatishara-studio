/**
 * Live-link Studio file sharing.
 * Recipients see the sender's originals under Shared with me (no Bunny copy).
 * Each share also posts a studio_share DM ping to the peer.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertCanMessagePeer } from "./dmPeerPanel";
import { ensureSharedWithMeFolder } from "./folders";
import {
  assetThumbnailPath,
  signBunnyCdnUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { resolveElementAssets } from "./lib/elementAssetModel";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { studioShareItemKind } from "./schema";

const DM_BODY_MAX = 4000;
const DM_PREVIEW_MAX = 120;
const STUDIO_SHARE_PREVIEW = "Shared files";
const LIST_MAX = 200;

export type StudioShareItemKind =
  | "asset"
  | "document"
  | "element"
  | "videoEdit"
  | "folder";

const shareItemArg = v.object({
  itemKind: studioShareItemKind,
  itemId: v.string(),
});

const sharedEntryReturn = v.object({
  shareId: v.id("studioShares"),
  itemKind: studioShareItemKind,
  itemId: v.string(),
  name: v.string(),
  fromUserId: v.id("users"),
  fromUsername: v.optional(v.string()),
  fromDisplayName: v.optional(v.string()),
  createdAt: v.number(),
  /** Asset kind when itemKind is asset. */
  assetKind: v.optional(
    v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
  ),
  mimeType: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  folderId: v.optional(v.id("folders")),
  elementType: v.optional(
    v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
      v.literal("style_sheet"),
    ),
  ),
});

const sharedChildReturn = v.object({
  itemKind: studioShareItemKind,
  itemId: v.string(),
  name: v.string(),
  assetKind: v.optional(
    v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
  ),
  mimeType: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  folderId: v.optional(v.id("folders")),
  elementType: v.optional(
    v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
      v.literal("style_sheet"),
    ),
  ),
  updatedAt: v.number(),
});

function sortPair(a: Id<"users">, b: Id<"users">) {
  return a < b
    ? { low: a, high: b }
    : { low: b, high: a };
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

async function requireOwnedShareable(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<{ name: string }> {
  if (itemKind === "asset") {
    const asset = await ctx.db.get("assets", itemId as Id<"assets">);
    if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) {
      throw new Error("File not found");
    }
    if (
      asset.licenseKind === "purchased_network" ||
      asset.licenseKind === "listed_network"
    ) {
      throw new Error("Creative Network catalog files cannot be shared this way");
    }
    return { name: asset.name };
  }
  if (itemKind === "document") {
    const doc = await ctx.db.get("documents", itemId as Id<"documents">);
    if (!doc || doc.ownerId !== ctx.user._id || doc.deletedAt) {
      throw new Error("Document not found");
    }
    return { name: doc.title };
  }
  if (itemKind === "element") {
    const element = await ctx.db.get("elements", itemId as Id<"elements">);
    if (!element || element.ownerId !== ctx.user._id || element.deletedAt) {
      throw new Error("Element not found");
    }
    return { name: element.name };
  }
  if (itemKind === "videoEdit") {
    const project = await ctx.db.get(
      "videoEditProjects",
      itemId as Id<"videoEditProjects">,
    );
    if (!project || project.ownerId !== ctx.user._id || project.deletedAt) {
      throw new Error("Edit project not found");
    }
    return { name: project.name };
  }
  const folder = await ctx.db.get("folders", itemId as Id<"folders">);
  if (!folder || folder.ownerId !== ctx.user._id || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  if (folder.systemKind) {
    throw new Error("System folders cannot be shared");
  }
  return { name: folder.name };
}

async function findActiveGrant(
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

async function upsertGrant(
  ctx: MutationCtx,
  args: {
    fromUserId: Id<"users">;
    toUserId: Id<"users">;
    itemKind: StudioShareItemKind;
    itemId: string;
  },
): Promise<Id<"studioShares">> {
  const existing = await findActiveGrant(
    ctx,
    args.toUserId,
    args.itemKind,
    args.itemId,
  );
  if (existing) {
    if (existing.fromUserId !== args.fromUserId) {
      // Another sharer already granted — keep first active grant.
      return existing._id;
    }
    return existing._id;
  }
  const revived = await ctx.db
    .query("studioShares")
    .withIndex("by_to_and_item", (q) =>
      q
        .eq("toUserId", args.toUserId)
        .eq("itemKind", args.itemKind)
        .eq("itemId", args.itemId),
    )
    .collect();
  const revoked = revived.find(
    (row) => row.revokedAt && row.fromUserId === args.fromUserId,
  );
  const now = Date.now();
  if (revoked) {
    await ctx.db.patch(revoked._id, {
      revokedAt: undefined,
      createdAt: now,
    });
    return revoked._id;
  }
  return await ctx.db.insert("studioShares", {
    fromUserId: args.fromUserId,
    toUserId: args.toUserId,
    itemKind: args.itemKind,
    itemId: args.itemId,
    createdAt: now,
  });
}

async function openConversationWithUser(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  peerUserId: Id<"users">,
): Promise<Id<"dmConversations">> {
  if (peerUserId === ctx.user._id) {
    throw new Error("You cannot share with yourself");
  }
  await assertCanMessagePeer(ctx, ctx.user._id, peerUserId);
  const pair = sortPair(ctx.user._id, peerUserId);
  const existing = await ctx.db
    .query("dmConversations")
    .withIndex("by_pair", (q) =>
      q.eq("userLowId", pair.low).eq("userHighId", pair.high),
    )
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("dmConversations", {
    userLowId: pair.low,
    userHighId: pair.high,
    lastMessageAt: now,
    lowLastReadAt: now,
    highLastReadAt: now,
    lowLastDeliveredAt: 0,
    highLastDeliveredAt: 0,
    createdAt: now,
  });
}

function studioShareListPreview(
  items: Array<{ name: string }>,
  note: string,
): string {
  if (note.trim()) {
    return note.length > DM_PREVIEW_MAX
      ? `${note.slice(0, DM_PREVIEW_MAX)}…`
      : note;
  }
  if (items.length === 1) {
    const name = items[0]!.name.trim() || STUDIO_SHARE_PREVIEW;
    return name.length > DM_PREVIEW_MAX
      ? `${name.slice(0, DM_PREVIEW_MAX)}…`
      : name;
  }
  if (items.length > 1) {
    return `${items.length} shared items`;
  }
  return STUDIO_SHARE_PREVIEW;
}

async function folderAncestorIds(
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

async function signedThumbForAsset(
  asset: Doc<"assets"> | null | undefined,
  expiresUnix: number | undefined,
): Promise<string | undefined> {
  if (!asset || !expiresUnix) return undefined;
  const path = assetThumbnailPath(asset);
  if (!path) return undefined;
  return await signBunnyCdnUrl(path, expiresUnix, THUMB_TRANSFORM);
}

async function hydrateLiveItem(
  ctx: QueryCtx,
  itemKind: StudioShareItemKind,
  itemId: string,
  expiresUnix: number | undefined,
): Promise<{
  name: string;
  assetKind?: "image" | "video" | "audio" | "document";
  mimeType?: string;
  thumbnailUrl?: string;
  folderId?: Id<"folders">;
  elementType?:
    | "character"
    | "prop"
    | "location"
    | "doc"
    | "style_sheet";
  updatedAt: number;
} | null> {
  if (itemKind === "asset") {
    const asset = await ctx.db.get("assets", itemId as Id<"assets">);
    if (!asset || asset.deletedAt) return null;
    return {
      name: asset.name,
      assetKind: asset.kind,
      mimeType: asset.mimeType,
      thumbnailUrl: await signedThumbForAsset(asset, expiresUnix),
      folderId: asset.folderId,
      updatedAt: asset.updatedAt,
    };
  }
  if (itemKind === "document") {
    const doc = await ctx.db.get("documents", itemId as Id<"documents">);
    if (!doc || doc.deletedAt) return null;
    return {
      name: doc.title,
      folderId: doc.folderId,
      updatedAt: doc.updatedAt,
    };
  }
  if (itemKind === "element") {
    const element = await ctx.db.get("elements", itemId as Id<"elements">);
    if (!element || element.deletedAt) return null;
    const resolved = await resolveElementAssets(ctx, element);
    let thumbnailUrl: string | undefined;
    if (resolved.sheetAssetId) {
      const sheet = await ctx.db.get("assets", resolved.sheetAssetId);
      thumbnailUrl = await signedThumbForAsset(sheet, expiresUnix);
    }
    return {
      name: element.name,
      folderId: element.folderId,
      elementType: element.type,
      thumbnailUrl,
      updatedAt: element.updatedAt,
    };
  }
  if (itemKind === "videoEdit") {
    const project = await ctx.db.get(
      "videoEditProjects",
      itemId as Id<"videoEditProjects">,
    );
    if (!project || project.deletedAt) return null;
    let thumbnailUrl: string | undefined;
    const previewId = project.outputAssetId ?? project.sourceAssetId;
    if (previewId) {
      const asset = await ctx.db.get("assets", previewId);
      thumbnailUrl = await signedThumbForAsset(asset, expiresUnix);
    }
    return {
      name: project.name,
      folderId: project.folderId,
      thumbnailUrl,
      updatedAt: project.updatedAt,
    };
  }
  const folder = await ctx.db.get("folders", itemId as Id<"folders">);
  if (!folder || folder.deletedAt) return null;
  return {
    name: folder.name,
    folderId: folder._id,
    updatedAt: folder.updatedAt,
  };
}

export const shareItems = authedMutation({
  args: {
    peerUserIds: v.array(v.id("users")),
    items: v.array(shareItemArg),
    note: v.optional(v.string()),
    /** When set, only ping this conversation (must include that peer). */
    conversationId: v.optional(v.id("dmConversations")),
  },
  returns: v.object({
    sharedCount: v.number(),
    conversationIds: v.array(v.id("dmConversations")),
    messageIds: v.array(v.id("dmMessages")),
  }),
  handler: async (ctx, args) => {
    if (args.items.length === 0) {
      throw new Error("Pick at least one file or folder to share");
    }
    if (args.items.length > 40) {
      throw new Error("You can share at most 40 items at once");
    }
    const peerIds = [...new Set(args.peerUserIds)].filter(
      (id) => id !== ctx.user._id,
    );
    if (peerIds.length === 0) {
      throw new Error("Pick at least one person to share with");
    }
    if (peerIds.length > 40) {
      throw new Error("You can share with at most 40 people at once");
    }

    const resolvedItems: Array<{
      itemKind: StudioShareItemKind;
      itemId: string;
      name: string;
    }> = [];
    for (const item of args.items) {
      const owned = await requireOwnedShareable(
        ctx,
        item.itemKind,
        item.itemId,
      );
      resolvedItems.push({
        itemKind: item.itemKind,
        itemId: item.itemId,
        name: owned.name,
      });
    }

    let note = (args.note ?? "").trim();
    if (note.length > DM_BODY_MAX) {
      note = `${note.slice(0, DM_BODY_MAX - 1)}…`;
    }

    const conversationIds: Id<"dmConversations">[] = [];
    const messageIds: Id<"dmMessages">[] = [];
    let sharedCount = 0;

    for (const peerUserId of peerIds) {
      const rootId = await workspaceRootForUser(ctx, peerUserId);
      await ensureSharedWithMeFolder(ctx, peerUserId, rootId);

      for (const item of resolvedItems) {
        await upsertGrant(ctx, {
          fromUserId: ctx.user._id,
          toUserId: peerUserId,
          itemKind: item.itemKind,
          itemId: item.itemId,
        });
        sharedCount += 1;
      }

      let conversationId: Id<"dmConversations">;
      if (args.conversationId) {
        const conversation = await ctx.db.get(
          "dmConversations",
          args.conversationId,
        );
        if (!conversation) throw new Error("Conversation not found");
        const isMember =
          conversation.userLowId === ctx.user._id ||
          conversation.userHighId === ctx.user._id;
        if (!isMember) throw new Error("Unauthorized");
        const peer =
          conversation.userLowId === ctx.user._id
            ? conversation.userHighId
            : conversation.userLowId;
        if (peer !== peerUserId) {
          throw new Error("Conversation does not match peer");
        }
        await assertCanMessagePeer(ctx, ctx.user._id, peerUserId);
        conversationId = conversation._id;
      } else {
        conversationId = await openConversationWithUser(ctx, peerUserId);
      }

      const now = Date.now();
      const messageId = await ctx.db.insert("dmMessages", {
        conversationId,
        senderId: ctx.user._id,
        body: note,
        kind: "studio_share",
        sharedItems: resolvedItems.map((item) => ({
          itemKind: item.itemKind,
          itemId: item.itemId,
          name: item.name,
        })),
        createdAt: now,
      });

      const isLow = (await ctx.db.get(conversationId))!.userLowId === ctx.user._id;
      await ctx.db.patch(conversationId, {
        lastMessageAt: now,
        lastMessagePreview: studioShareListPreview(resolvedItems, note),
        lastMessageSenderId: ctx.user._id,
        ...(isLow
          ? { lowLastReadAt: now, lowTypingAt: 0 }
          : { highLastReadAt: now, highTypingAt: 0 }),
      });

      conversationIds.push(conversationId);
      messageIds.push(messageId);
    }

    return { sharedCount, conversationIds, messageIds };
  },
});

export const listSharedWithMe = authedQuery({
  args: {
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(sharedEntryReturn),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studioShares")
      .withIndex("by_to_and_created", (q) => q.eq("toUserId", ctx.user._id))
      .order("desc")
      .take(LIST_MAX);

    const out: Array<{
      shareId: Id<"studioShares">;
      itemKind: StudioShareItemKind;
      itemId: string;
      name: string;
      fromUserId: Id<"users">;
      fromUsername?: string;
      fromDisplayName?: string;
      createdAt: number;
      assetKind?: "image" | "video" | "audio" | "document";
      mimeType?: string;
      thumbnailUrl?: string;
      folderId?: Id<"folders">;
      elementType?:
        | "character"
        | "prop"
        | "location"
        | "doc"
        | "style_sheet";
    }> = [];

    for (const row of rows) {
      if (row.revokedAt) continue;
      const live = await hydrateLiveItem(
        ctx,
        row.itemKind,
        row.itemId,
        args.expiresUnix,
      );
      if (!live) continue;
      // Skip grants that are covered only as folder-browse children? No —
      // top-level Shared with me shows every direct grant.
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.fromUserId))
        .unique();
      out.push({
        shareId: row._id,
        itemKind: row.itemKind,
        itemId: row.itemId,
        name: live.name,
        fromUserId: row.fromUserId,
        fromUsername: profile?.username,
        fromDisplayName: profile?.displayName,
        createdAt: row.createdAt,
        assetKind: live.assetKind,
        mimeType: live.mimeType,
        thumbnailUrl: live.thumbnailUrl,
        folderId: live.folderId,
        elementType: live.elementType,
      });
    }
    return out;
  },
});

export const listSharedFolderChildren = authedQuery({
  args: {
    folderId: v.id("folders"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.object({
    folder: v.object({
      _id: v.id("folders"),
      name: v.string(),
      parentId: v.optional(v.id("folders")),
      ownerId: v.id("users"),
    }),
    children: v.array(sharedChildReturn),
  }),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.deletedAt) {
      throw new Error("Folder not found");
    }
    const canBrowse =
      folder.ownerId === ctx.user._id ||
      (await viewerHasFolderGrantCovering(ctx, ctx.user._id, folder._id));
    if (!canBrowse) {
      throw new Error("Unauthorized");
    }

    const children: Array<{
      itemKind: StudioShareItemKind;
      itemId: string;
      name: string;
      assetKind?: "image" | "video" | "audio" | "document";
      mimeType?: string;
      thumbnailUrl?: string;
      folderId?: Id<"folders">;
      elementType?:
        | "character"
        | "prop"
        | "location"
        | "doc"
        | "style_sheet";
      updatedAt: number;
    }> = [];

    const childFolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", folder.ownerId).eq("parentId", folder._id),
      )
      .collect();
    for (const child of childFolders) {
      if (child.deletedAt || child.systemKind) continue;
      children.push({
        itemKind: "folder",
        itemId: child._id,
        name: child.name,
        folderId: child._id,
        updatedAt: child.updatedAt,
      });
    }

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();
    for (const asset of assets) {
      if (asset.deletedAt) continue;
      children.push({
        itemKind: "asset",
        itemId: asset._id,
        name: asset.name,
        assetKind: asset.kind,
        mimeType: asset.mimeType,
        thumbnailUrl: await signedThumbForAsset(asset, args.expiresUnix),
        folderId: asset.folderId,
        updatedAt: asset.updatedAt,
      });
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();
    for (const doc of documents) {
      if (doc.deletedAt) continue;
      children.push({
        itemKind: "document",
        itemId: doc._id,
        name: doc.title,
        folderId: doc.folderId,
        updatedAt: doc.updatedAt,
      });
    }

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();
    for (const element of elements) {
      if (element.deletedAt) continue;
      const resolved = await resolveElementAssets(ctx, element);
      let thumbnailUrl: string | undefined;
      if (resolved.sheetAssetId) {
        const sheet = await ctx.db.get("assets", resolved.sheetAssetId);
        thumbnailUrl = await signedThumbForAsset(sheet, args.expiresUnix);
      }
      children.push({
        itemKind: "element",
        itemId: element._id,
        name: element.name,
        folderId: element.folderId,
        elementType: element.type,
        thumbnailUrl,
        updatedAt: element.updatedAt,
      });
    }

    const edits = await ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();
    for (const project of edits) {
      if (project.deletedAt) continue;
      let thumbnailUrl: string | undefined;
      const previewId = project.outputAssetId ?? project.sourceAssetId;
      if (previewId) {
        const asset = await ctx.db.get("assets", previewId);
        thumbnailUrl = await signedThumbForAsset(asset, args.expiresUnix);
      }
      children.push({
        itemKind: "videoEdit",
        itemId: project._id,
        name: project.name,
        folderId: project.folderId,
        thumbnailUrl,
        updatedAt: project.updatedAt,
      });
    }

    children.sort((a, b) => b.updatedAt - a.updatedAt);

    return {
      folder: {
        _id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
        ownerId: folder.ownerId,
      },
      children,
    };
  },
});

/** Hydrate studio_share cards for DM listMessages. */
export async function hydrateStudioShareCard(
  ctx: QueryCtx,
  row: Doc<"dmMessages">,
  expiresUnix: number,
): Promise<
  | {
      items: Array<{
        itemKind: StudioShareItemKind;
        itemId: string;
        name: string;
        thumbnailUrl?: string;
        unavailable?: boolean;
        assetKind?: "image" | "video" | "audio" | "document";
      }>;
    }
  | undefined
> {
  if ((row.kind ?? "text") !== "studio_share") return undefined;
  const items = row.sharedItems ?? [];
  const hydrated = await Promise.all(
    items.map(async (item) => {
      const live = await hydrateLiveItem(
        ctx,
        item.itemKind,
        item.itemId,
        expiresUnix,
      );
      if (!live) {
        return {
          itemKind: item.itemKind,
          itemId: item.itemId,
          name: item.name,
          unavailable: true as const,
        };
      }
      return {
        itemKind: item.itemKind,
        itemId: item.itemId,
        name: live.name,
        thumbnailUrl: live.thumbnailUrl,
        assetKind: live.assetKind,
      };
    }),
  );
  return { items: hydrated };
}
