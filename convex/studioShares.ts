/**
 * Live-link Studio file sharing.
 * Recipients see the sender's originals under Shared with me (no Bunny copy).
 * Each share also posts a studio_share DM ping to the peer.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertCanMessagePeer } from "./dmPeerPanel";
import {
  collectFolderPeekItems,
  ensureMessagesFolder,
  ensureSharedWithMeFolder,
} from "./folders";
import {
  assetThumbnailPath,
  buildAssetPath,
  signBunnyCdnUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { resolveElementAssets } from "./lib/elementAssetModel";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { applyStorageBytesDelta } from "./lib/storageBilling";
import { studioShareItemKind } from "./schema";
import {
  findActiveGrant,
  folderAncestorIds,
  requireAssetOwnerOrShare,
  viewerCanAccessSharedItem,
  viewerHasFolderGrantCovering,
  viewerSharePermission,
  type StudioSharePermission,
} from "./lib/studioShareAccess";

export {
  findActiveGrant,
  folderAncestorIds,
  requireAssetOwnerOrShare,
  viewerCanAccessSharedItem,
  viewerHasFolderGrantCovering,
  viewerSharePermission,
};


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

const sharedPeekItem = v.object({
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

/** Cap signed folder peeks in shared listings (Bunny signing / 1s isolate). */
const SHARED_SIGNED_PEEK_FOLDERS = 8;

const sharedEntryReturn = v.object({
  shareId: v.id("studioShares"),
  itemKind: studioShareItemKind,
  itemId: v.string(),
  name: v.string(),
  permission: v.union(v.literal("view"), v.literal("edit")),
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
  peekItems: v.optional(v.array(sharedPeekItem)),
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
  peekItems: v.optional(v.array(sharedPeekItem)),
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
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  itemKind: StudioShareItemKind,
  itemId: string,
): Promise<{ name: string }> {
  if (itemKind === "asset") {
    const asset = await ctx.db.get("assets", itemId as Id<"assets">);
    if (!asset || asset.ownerId !== ownerId || asset.deletedAt) {
      throw new Error("File not found");
    }
    if (
      asset.licenseKind === "purchased_network" ||
      asset.licenseKind === "purchased_help_answer" ||
      asset.licenseKind === "listed_network"
    ) {
      throw new Error("Purchased or catalog files cannot be shared this way");
    }
    return { name: asset.name };
  }
  if (itemKind === "document") {
    const doc = await ctx.db.get("documents", itemId as Id<"documents">);
    if (!doc || doc.ownerId !== ownerId || doc.deletedAt) {
      throw new Error("Document not found");
    }
    return { name: doc.title };
  }
  if (itemKind === "element") {
    const element = await ctx.db.get("elements", itemId as Id<"elements">);
    if (!element || element.ownerId !== ownerId || element.deletedAt) {
      throw new Error("Element not found");
    }
    return { name: element.name };
  }
  if (itemKind === "videoEdit") {
    const project = await ctx.db.get(
      "videoEditProjects",
      itemId as Id<"videoEditProjects">,
    );
    if (!project || project.ownerId !== ownerId || project.deletedAt) {
      throw new Error("Edit project not found");
    }
    return { name: project.name };
  }
  const folder = await ctx.db.get("folders", itemId as Id<"folders">);
  if (!folder || folder.ownerId !== ownerId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  if (folder.systemKind) {
    throw new Error("System folders cannot be shared");
  }
  return { name: folder.name };
}

async function upsertGrant(
  ctx: MutationCtx,
  args: {
    fromUserId: Id<"users">;
    toUserId: Id<"users">;
    itemKind: StudioShareItemKind;
    itemId: string;
    permission: StudioSharePermission;
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
    const current: StudioSharePermission =
      existing.permission === "edit" ? "edit" : "view";
    // Upgrade view → edit; never downgrade on re-share.
    if (args.permission === "edit" && current !== "edit") {
      await ctx.db.patch(existing._id, { permission: "edit" });
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
      permission: args.permission,
    });
    return revoked._id;
  }
  return await ctx.db.insert("studioShares", {
    fromUserId: args.fromUserId,
    toUserId: args.toUserId,
    itemKind: args.itemKind,
    itemId: args.itemId,
    permission: args.permission,
    createdAt: now,
  });
}

async function openConversationWithUser(
  ctx: MutationCtx,
  senderId: Id<"users">,
  peerUserId: Id<"users">,
): Promise<Id<"dmConversations">> {
  if (peerUserId === senderId) {
    throw new Error("You cannot share with yourself");
  }
  await assertCanMessagePeer(ctx, senderId, peerUserId);
  const pair = sortPair(senderId, peerUserId);
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

async function signedThumbForAsset(
  asset: Doc<"assets"> | null | undefined,
  expiresUnix: number | undefined,
): Promise<string | undefined> {
  if (!asset || !expiresUnix) return undefined;
  // File-share copies set bunnyPath before the Bunny object exists — signing that
  // path yields a broken <img> in DM cards until finalizeSharedMediaCopy.
  if (asset.storageStatus !== undefined && asset.storageStatus !== "ready") {
    return undefined;
  }
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

const shareItemsArgs = {
  peerUserIds: v.optional(v.array(v.id("users"))),
  items: v.array(shareItemArg),
  note: v.optional(v.string()),
  /** When set, only ping this conversation (must include that peer). */
  conversationId: v.optional(v.id("dmConversations")),
  /** access = live grant; file = Bunny copy into peer Messages. */
  delivery: v.optional(v.union(v.literal("access"), v.literal("file"))),
  /** Live-link permission (ignored for file delivery). */
  permission: v.optional(v.union(v.literal("view"), v.literal("edit"))),
};

const shareItemsReturn = v.object({
  sharedCount: v.number(),
  conversationIds: v.array(v.id("dmConversations")),
  messageIds: v.array(v.id("dmMessages")),
});

async function shareItemsCore(
  ctx: MutationCtx,
  senderId: Id<"users">,
  args: {
    peerUserIds?: Id<"users">[];
    items: Array<{ itemKind: StudioShareItemKind; itemId: string }>;
    note?: string;
    conversationId?: Id<"dmConversations">;
    delivery?: "access" | "file";
    permission?: "view" | "edit";
  },
): Promise<{
  sharedCount: number;
  conversationIds: Id<"dmConversations">[];
  messageIds: Id<"dmMessages">[];
}> {
  if (args.items.length === 0) {
    throw new Error("Pick at least one file or folder to share");
  }
  if (args.items.length > 40) {
    throw new Error("You can share at most 40 items at once");
  }
  let peerIds = [...new Set(args.peerUserIds ?? [])].filter(
    (id) => id !== senderId,
  );
  if (peerIds.length === 0 && args.conversationId) {
    const conversation = await ctx.db.get(
      "dmConversations",
      args.conversationId,
    );
    if (!conversation) throw new Error("Conversation not found");
    const isMember =
      conversation.userLowId === senderId ||
      conversation.userHighId === senderId;
    if (!isMember) throw new Error("Unauthorized");
    peerIds = [
      conversation.userLowId === senderId
        ? conversation.userHighId
        : conversation.userLowId,
    ];
  }
  if (peerIds.length === 0) {
    throw new Error("Pick at least one person to share with");
  }
  if (peerIds.length > 40) {
    throw new Error("You can share with at most 40 people at once");
  }

  const delivery = args.delivery ?? "access";
  const permission: StudioSharePermission =
    args.permission === "edit" ? "edit" : "view";

  if (delivery === "file") {
    for (const item of args.items) {
      if (item.itemKind !== "asset") {
        throw new Error(
          "Send as file supports media files only — use Access for folders/docs/edits",
        );
      }
    }
  }

  const resolvedItems: Array<{
    itemKind: StudioShareItemKind;
    itemId: string;
    name: string;
    sourceAsset?: Doc<"assets">;
  }> = [];
  for (const item of args.items) {
    const owned = await requireOwnedShareable(
      ctx,
      senderId,
      item.itemKind,
      item.itemId,
    );
    let sourceAsset: Doc<"assets"> | undefined;
    if (item.itemKind === "asset") {
      const asset = await ctx.db.get("assets", item.itemId as Id<"assets">);
      if (
        !asset?.bunnyPath ||
        asset.deletedAt ||
        (asset.storageStatus !== undefined && asset.storageStatus !== "ready")
      ) {
        throw new Error(`File not ready to share: ${owned.name}`);
      }
      sourceAsset = asset;
    }
    resolvedItems.push({
      itemKind: item.itemKind,
      itemId: item.itemId,
      name: owned.name,
      sourceAsset,
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

    let conversationId: Id<"dmConversations">;
    if (args.conversationId) {
      const conversation = await ctx.db.get(
        "dmConversations",
        args.conversationId,
      );
      if (!conversation) throw new Error("Conversation not found");
      const isMember =
        conversation.userLowId === senderId ||
        conversation.userHighId === senderId;
      if (!isMember) throw new Error("Unauthorized");
      const peer =
        conversation.userLowId === senderId
          ? conversation.userHighId
          : conversation.userLowId;
      if (peer !== peerUserId) {
        throw new Error("Conversation does not match peer");
      }
      await assertCanMessagePeer(ctx, senderId, peerUserId);
      conversationId = conversation._id;
    } else {
      conversationId = await openConversationWithUser(ctx, senderId, peerUserId);
    }

    if (delivery === "file") {
      const messagesFolderId = await ensureMessagesFolder(
        ctx,
        peerUserId,
        rootId,
      );
      const cardItems: Array<{
        itemKind: StudioShareItemKind;
        itemId: string;
        sourceItemId: string;
        name: string;
      }> = [];
      let peerNote = note;
      let lastMediaPreview = studioShareListPreview(
        resolvedItems.map((item) => ({ name: item.name })),
        peerNote,
      );

      for (const item of resolvedItems) {
        const source = item.sourceAsset!;
        const now = Date.now();
        const destAssetId = await ctx.db.insert("assets", {
          ownerId: peerUserId,
          folderId: messagesFolderId,
          name: source.name,
          kind: source.kind,
          mimeType: source.mimeType,
          storageStatus: "pending",
          durationSeconds: source.durationSeconds,
          width: source.width,
          height: source.height,
          frameRate: source.frameRate,
          videoCodec: source.videoCodec,
          videoProfile: source.videoProfile,
          audioCodec: source.audioCodec,
          createdAt: now,
          updatedAt: now,
        });
        const bunnyPath = buildAssetPath({
          userId: peerUserId,
          folderId: messagesFolderId,
          assetId: destAssetId,
          filename: source.name,
        });
        await ctx.db.patch(destAssetId, { bunnyPath, updatedAt: now });
        await ctx.scheduler.runAfter(
          0,
          internal.studioShareActions.copySharedMedia,
          {
            destAssetId,
            destOwnerId: peerUserId,
            sourceBunnyPath: source.bunnyPath!,
            destBunnyPath: bunnyPath,
            mimeType: source.mimeType || "application/octet-stream",
            sourceThumbnailPath: source.thumbnailPath,
          },
        );
        sharedCount += 1;

        // Chat shows real media bubbles for images/videos (source asset —
        // both peers can sign). Peer still gets a Messages-folder copy.
        if (source.kind === "image" || source.kind === "video") {
          const messageId = await ctx.db.insert("dmMessages", {
            conversationId,
            senderId,
            body: peerNote,
            kind: source.kind,
            assetId: source._id,
            contentType: source.mimeType,
            createdAt: now,
          });
          messageIds.push(messageId);
          lastMediaPreview =
            source.kind === "image"
              ? peerNote.trim() || "Photo"
              : peerNote.trim() || "Video";
          peerNote = "";
        } else {
          cardItems.push({
            itemKind: "asset",
            itemId: destAssetId,
            sourceItemId: source._id,
            name: source.name,
          });
        }
      }

      if (cardItems.length > 0) {
        const now = Date.now();
        const messageId = await ctx.db.insert("dmMessages", {
          conversationId,
          senderId,
          body: peerNote,
          kind: "studio_share",
          sharedItems: cardItems,
          createdAt: now,
        });
        messageIds.push(messageId);
        lastMediaPreview = studioShareListPreview(cardItems, peerNote);
      }

      const patchNow = Date.now();
      const isLow = (await ctx.db.get(conversationId))!.userLowId === senderId;
      await ctx.db.patch(conversationId, {
        lastMessageAt: patchNow,
        lastMessagePreview: lastMediaPreview,
        lastMessageSenderId: senderId,
        ...(isLow
          ? { lowLastReadAt: patchNow, lowTypingAt: 0 }
          : { highLastReadAt: patchNow, highTypingAt: 0 }),
      });
      conversationIds.push(conversationId);
      continue;
    }

    await ensureSharedWithMeFolder(ctx, peerUserId, rootId);
    for (const item of resolvedItems) {
      await upsertGrant(ctx, {
        fromUserId: senderId,
        toUserId: peerUserId,
        itemKind: item.itemKind,
        itemId: item.itemId,
        permission,
      });
      sharedCount += 1;
    }
    const dmItems = resolvedItems.map((item) => ({
      itemKind: item.itemKind,
      itemId: item.itemId,
      name: item.name,
    }));

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId,
      senderId,
      body: note,
      kind: "studio_share",
      sharedItems: dmItems,
      createdAt: now,
    });

    const isLow = (await ctx.db.get(conversationId))!.userLowId === senderId;
    await ctx.db.patch(conversationId, {
      lastMessageAt: now,
      lastMessagePreview: studioShareListPreview(dmItems, note),
      lastMessageSenderId: senderId,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });

    conversationIds.push(conversationId);
    messageIds.push(messageId);
  }

  return { sharedCount, conversationIds, messageIds };
}

export const shareItems = authedMutation({
  args: shareItemsArgs,
  returns: shareItemsReturn,
  handler: async (ctx, args) => shareItemsCore(ctx, ctx.user._id, args),
});

/** API/MCP: same as UI Choose/Share — file delivery copies into peer Messages. */
export const shareItemsForApi = internalMutation({
  args: {
    userId: v.id("users"),
    ...shareItemsArgs,
  },
  returns: shareItemsReturn,
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const { userId: senderId, ...rest } = args;
    return shareItemsCore(ctx, senderId, rest);
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
      permission: StudioSharePermission;
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
      peekItems?: Array<{
        kind: "image" | "video" | "audio" | "document" | "element" | "file";
        thumbnailUrl?: string;
        thumbnailLqipUrl?: string;
        label: string;
        elementType?:
          | "character"
          | "prop"
          | "location"
          | "doc"
          | "style_sheet";
        icon?: string;
      }>;
    }> = [];

    let signedPeekFolders = 0;
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
      let peekItems:
        | Array<{
            kind: "image" | "video" | "audio" | "document" | "element" | "file";
            thumbnailUrl?: string;
            thumbnailLqipUrl?: string;
            label: string;
            elementType?:
              | "character"
              | "prop"
              | "location"
              | "doc"
              | "style_sheet";
            icon?: string;
          }>
        | undefined;
      if (row.itemKind === "folder" && args.expiresUnix) {
        const folder = await ctx.db.get("folders", row.itemId as Id<"folders">);
        if (
          folder &&
          !folder.deletedAt &&
          signedPeekFolders < SHARED_SIGNED_PEEK_FOLDERS
        ) {
          peekItems = await collectFolderPeekItems(
            ctx,
            folder.ownerId,
            folder._id,
            args.expiresUnix,
          );
          signedPeekFolders += 1;
        }
      }
      out.push({
        shareId: row._id,
        itemKind: row.itemKind,
        itemId: row.itemId,
        name: live.name,
        permission: row.permission === "edit" ? "edit" : "view",
        fromUserId: row.fromUserId,
        fromUsername: profile?.username,
        fromDisplayName: profile?.displayName,
        createdAt: row.createdAt,
        assetKind: live.assetKind,
        mimeType: live.mimeType,
        thumbnailUrl: live.thumbnailUrl,
        folderId: live.folderId,
        elementType: live.elementType,
        peekItems,
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
    permission: v.union(v.literal("view"), v.literal("edit")),
    children: v.array(sharedChildReturn),
  }),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.deletedAt) {
      throw new Error("Folder not found");
    }
    const level = await viewerSharePermission(
      ctx,
      ctx.user._id,
      "folder",
      folder._id,
    );
    const canBrowse =
      folder.ownerId === ctx.user._id || level === "view" || level === "edit";
    if (!canBrowse) {
      throw new Error("Unauthorized");
    }
    const permission: StudioSharePermission =
      level === "edit" || level === "owner" ? "edit" : "view";

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
      peekItems?: Array<{
        kind: "image" | "video" | "audio" | "document" | "element" | "file";
        thumbnailUrl?: string;
        thumbnailLqipUrl?: string;
        label: string;
        elementType?:
          | "character"
          | "prop"
          | "location"
          | "doc"
          | "style_sheet";
        icon?: string;
      }>;
    }> = [];

    const childFolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", folder.ownerId).eq("parentId", folder._id),
      )
      .collect();
    let signedPeekFolders = 0;
    for (const child of childFolders) {
      if (child.deletedAt || child.systemKind) continue;
      let peekItems:
        | Array<{
            kind: "image" | "video" | "audio" | "document" | "element" | "file";
            thumbnailUrl?: string;
            thumbnailLqipUrl?: string;
            label: string;
            elementType?:
              | "character"
              | "prop"
              | "location"
              | "doc"
              | "style_sheet";
            icon?: string;
          }>
        | undefined;
      if (
        args.expiresUnix &&
        signedPeekFolders < SHARED_SIGNED_PEEK_FOLDERS
      ) {
        peekItems = await collectFolderPeekItems(
          ctx,
          folder.ownerId,
          child._id,
          args.expiresUnix,
        );
        signedPeekFolders += 1;
      }
      children.push({
        itemKind: "folder",
        itemId: child._id,
        name: child.name,
        folderId: child._id,
        updatedAt: child.updatedAt,
        peekItems,
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
      permission,
      children,
    };
  },
});

/** Hydrate studio_share cards for DM listMessages. */
export async function hydrateStudioShareCard(
  ctx: QueryCtx,
  row: Doc<"dmMessages">,
  expiresUnix: number,
  viewerId?: Id<"users">,
  /** Non-sender in the DM — used to detect revoked Access grants for both sides. */
  recipientId?: Id<"users">,
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
      const candidates = [
        ...new Set(
          [item.itemId, item.sourceItemId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ];
      // Access shares (no sourceItemId) die when the recipient grant is revoked —
      // show Unavailable to both peers, even though the sender still owns the file.
      const isAccessShare = !item.sourceItemId;
      if (isAccessShare && recipientId) {
        const recipientCan = await viewerCanAccessSharedItem(
          ctx,
          recipientId,
          item.itemKind,
          item.itemId,
        );
        if (!recipientCan) {
          return {
            itemKind: item.itemKind,
            itemId: item.itemId,
            name: item.name,
            unavailable: true as const,
          };
        }
      }
      // Prefer an id the viewer owns / has a grant on (file copies store peer id).
      // When viewerId is set, never fall back to unauthorized hydrate.
      let chosenId: string | null = null;
      let live: Awaited<ReturnType<typeof hydrateLiveItem>> = null;
      if (viewerId) {
        for (const candidate of candidates) {
          const level = await viewerSharePermission(
            ctx,
            viewerId,
            item.itemKind,
            candidate,
          );
          if (!level) continue;
          const next = await hydrateLiveItem(
            ctx,
            item.itemKind,
            candidate,
            expiresUnix,
          );
          if (!next) continue;
          chosenId = candidate;
          live = next;
          break;
        }
      } else {
        for (const candidate of candidates) {
          const next = await hydrateLiveItem(
            ctx,
            item.itemKind,
            candidate,
            expiresUnix,
          );
          if (!next) continue;
          chosenId = candidate;
          live = next;
          break;
        }
      }
      if (!live || !chosenId) {
        return {
          itemKind: item.itemKind,
          itemId: item.itemId,
          name: item.name,
          unavailable: true as const,
        };
      }
      return {
        itemKind: item.itemKind,
        itemId: chosenId,
        name: live.name,
        thumbnailUrl: live.thumbnailUrl,
        assetKind: live.assetKind,
      };
    }),
  );
  return { items: hydrated };
}

const peerShareRowReturn = v.object({
  shareId: v.id("studioShares"),
  itemKind: studioShareItemKind,
  itemId: v.string(),
  name: v.string(),
  createdAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  assetKind: v.optional(
    v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
  ),
});

/** Active shares I sent to one peer (for DM peer sidebar). */
export const listOutgoingToPeer = authedQuery({
  args: {
    peerUserId: v.id("users"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(peerShareRowReturn),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studioShares")
      .withIndex("by_from_and_to", (q) =>
        q.eq("fromUserId", ctx.user._id).eq("toUserId", args.peerUserId),
      )
      .collect();
    const active = rows
      .filter((row) => !row.revokedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LIST_MAX);
    const out: Array<{
      shareId: Id<"studioShares">;
      itemKind: StudioShareItemKind;
      itemId: string;
      name: string;
      createdAt: number;
      thumbnailUrl?: string;
      assetKind?: "image" | "video" | "audio" | "document";
    }> = [];
    for (const row of active) {
      const live = await hydrateLiveItem(
        ctx,
        row.itemKind,
        row.itemId,
        args.expiresUnix,
      );
      if (!live) continue;
      out.push({
        shareId: row._id,
        itemKind: row.itemKind,
        itemId: row.itemId,
        name: live.name,
        createdAt: row.createdAt,
        thumbnailUrl: live.thumbnailUrl,
        assetKind: live.assetKind,
      });
    }
    return out;
  },
});

const recipientReturn = v.object({
  shareId: v.id("studioShares"),
  userId: v.id("users"),
  username: v.string(),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  permission: v.union(v.literal("view"), v.literal("edit")),
  createdAt: v.number(),
});

/** Who currently has an active grant for one of my items. */
export const listRecipientsForItem = authedQuery({
  args: {
    itemKind: studioShareItemKind,
    itemId: v.string(),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(recipientReturn),
  handler: async (ctx, args) => {
    // Recipients browsing Shared with me must not hit requireOwnedShareable —
    // return empty instead of throwing (context menu opens on shared items).
    try {
      await requireOwnedShareable(ctx, ctx.user._id, args.itemKind, args.itemId);
    } catch {
      return [];
    }
    const rows = await ctx.db
      .query("studioShares")
      .withIndex("by_item", (q) =>
        q.eq("itemKind", args.itemKind).eq("itemId", args.itemId),
      )
      .collect();
    const active = rows.filter(
      (row) => !row.revokedAt && row.fromUserId === ctx.user._id,
    );
    const out: Array<{
      shareId: Id<"studioShares">;
      userId: Id<"users">;
      username: string;
      displayName?: string;
      avatarUrl?: string;
      permission: StudioSharePermission;
      createdAt: number;
    }> = [];
    for (const row of active) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.toUserId))
        .unique();
      if (!profile) continue;
      let avatarUrl: string | undefined;
      if (args.expiresUnix && profile.avatarAssetId) {
        const asset = await ctx.db.get("assets", profile.avatarAssetId);
        avatarUrl = await signedThumbForAsset(asset, args.expiresUnix);
      }
      out.push({
        shareId: row._id,
        userId: row.toUserId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl,
        permission: row.permission === "edit" ? "edit" : "view",
        createdAt: row.createdAt,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  },
});

/** Compact keys for explorer shared badges on my items. */
export const listMyOutgoingShareKeys = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      itemKind: studioShareItemKind,
      itemId: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("studioShares")
      .withIndex("by_from_and_created", (q) => q.eq("fromUserId", ctx.user._id))
      .order("desc")
      .take(500);
    const seen = new Set<string>();
    const out: Array<{ itemKind: StudioShareItemKind; itemId: string }> = [];
    for (const row of rows) {
      if (row.revokedAt) continue;
      const key = `${row.itemKind}:${row.itemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ itemKind: row.itemKind, itemId: row.itemId });
    }
    return out;
  },
});

export const revokeShare = authedMutation({
  args: {
    shareId: v.id("studioShares"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("studioShares", args.shareId);
    if (!row || row.revokedAt) return null;
    if (row.fromUserId !== ctx.user._id) {
      throw new Error("Only the sharer can stop sharing");
    }
    await ctx.db.patch(args.shareId, { revokedAt: Date.now() });
    return null;
  },
});

/** Finalize Bunny copy for a file-share or Copy-to destination asset. */
export const finalizeSharedMediaCopy = internalMutation({
  args: {
    destAssetId: v.id("assets"),
    destOwnerId: v.id("users"),
    bunnyPath: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
    thumbnailPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.destAssetId);
    if (!asset || asset.ownerId !== args.destOwnerId) {
      throw new Error("Destination asset not found");
    }
    if (asset.storageStatus === "ready" && asset.bunnyPath) {
      return null;
    }
    const now = Date.now();
    const prevBytes = asset.byteSize ?? 0;
    await ctx.db.patch(asset._id, {
      bunnyPath: args.bunnyPath,
      byteSize: args.byteSize,
      mimeType: args.mimeType,
      storageStatus: "ready",
      ...(args.thumbnailPath ? { thumbnailPath: args.thumbnailPath } : {}),
      updatedAt: now,
    });
    const delta = Math.max(0, args.byteSize - prevBytes);
    if (delta > 0) {
      await applyStorageBytesDelta(ctx, {
        userId: args.destOwnerId,
        deltaBytes: delta,
        reason: "Studio shared file copy",
      });
    }
    return null;
  },
});

export const failSharedMediaCopy = internalMutation({
  args: {
    destAssetId: v.id("assets"),
    destOwnerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.destAssetId);
    if (!asset || asset.ownerId !== args.destOwnerId) return null;
    if (asset.storageStatus === "ready") return null;
    await ctx.db.patch(asset._id, {
      storageStatus: "failed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Copy a shared (or owned) asset into one of my folders via Bunny server copy.
 * Schedules the copy; returns the new pending asset id.
 */
export const copySharedItemToFolder = authedMutation({
  args: {
    assetId: v.id("assets"),
    targetFolderId: v.id("folders"),
    name: v.optional(v.string()),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const source = await requireAssetOwnerOrShare(ctx, args.assetId);
    if (
      source.licenseKind === "purchased_network" ||
      source.licenseKind === "purchased_help_answer" ||
      source.licenseKind === "listed_network"
    ) {
      throw new Error("Purchased or catalog files cannot be copied this way");
    }
    if (
      !source.bunnyPath ||
      (source.storageStatus !== undefined && source.storageStatus !== "ready")
    ) {
      throw new Error("File is not ready to copy");
    }
    const destFolder = await ctx.db.get("folders", args.targetFolderId);
    if (!destFolder || destFolder.deletedAt) {
      throw new Error("Folder not found");
    }
    if (destFolder.ownerId !== ctx.user._id) {
      throw new Error("You can only copy into your own folders");
    }
    if (destFolder.systemKind === "shared_with_me") {
      throw new Error("Cannot copy into Shared with me");
    }
    const now = Date.now();
    const name = args.name?.trim() || source.name;
    const assetId = await ctx.db.insert("assets", {
      ownerId: ctx.user._id,
      folderId: args.targetFolderId,
      name,
      kind: source.kind,
      mimeType: source.mimeType,
      storageStatus: "pending",
      durationSeconds: source.durationSeconds,
      width: source.width,
      height: source.height,
      frameRate: source.frameRate,
      videoCodec: source.videoCodec,
      videoProfile: source.videoProfile,
      audioCodec: source.audioCodec,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: ctx.user._id,
      folderId: args.targetFolderId,
      assetId,
      filename: name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.studioShareActions.copySharedMedia, {
      destAssetId: assetId,
      destOwnerId: ctx.user._id,
      sourceBunnyPath: source.bunnyPath,
      destBunnyPath: bunnyPath,
      mimeType: source.mimeType || "application/octet-stream",
      sourceThumbnailPath: source.thumbnailPath,
    });
    return assetId;
  },
});

