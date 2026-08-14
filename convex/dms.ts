/**
 * Person-to-person direct messages (WhatsApp-style).
 * Exactly one conversation exists per user pair — enforced by the sorted-pair
 * index on dmConversations (userLowId < userHighId by id string).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { peerIdsInLabel } from "./dmLabels";
import {
  assertCanMessagePeer,
  sellerTagForUser,
} from "./dmPeerPanel";
import {
  assetThumbnailPath,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  createNotificationAndPush,
  resolveActorDisplayName,
} from "./lib/notify";
import { hydrateSocialPeople } from "./profiles";
import {
  hydrateStudioShareCard,
  type StudioShareItemKind,
} from "./studioShares";
import { studioShareItemKind } from "./schema";

const DM_BODY_MAX = 4000;
const DM_PREVIEW_MAX = 120;
const REPLY_BODY_MAX = 120;
const VOICE_NOTE_MAX_SECONDS = 300;
const VOICE_PREVIEW = "Voice message";
const IMAGE_PREVIEW = "Photo";
const POST_PREVIEW = "Post";
const COMMENT_PREVIEW = "Comment";
const STUDIO_SHARE_PREVIEW = "Shared files";
const VIDEO_PREVIEW = "Video";
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const dmMessageKind = v.union(
  v.literal("text"),
  v.literal("voice"),
  v.literal("image"),
  v.literal("video"),
  v.literal("post"),
  v.literal("comment"),
  v.literal("studio_share"),
);

const replySnippet = v.object({
  _id: v.id("dmMessages"),
  body: v.string(),
  kind: dmMessageKind,
  fromMe: v.boolean(),
  audioUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  durationSec: v.optional(v.number()),
});

const feedShareCard = v.object({
  type: v.union(v.literal("post"), v.literal("comment")),
  postId: v.id("profilePosts"),
  commentId: v.optional(v.id("profileComments")),
  username: v.optional(v.string()),
  displayName: v.optional(v.string()),
  caption: v.optional(v.string()),
  body: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  unavailable: v.optional(v.boolean()),
});

const studioShareCard = v.object({
  items: v.array(
    v.object({
      itemKind: studioShareItemKind,
      itemId: v.string(),
      name: v.string(),
      thumbnailUrl: v.optional(v.string()),
      unavailable: v.optional(v.boolean()),
      assetKind: v.optional(
        v.union(
          v.literal("image"),
          v.literal("video"),
          v.literal("audio"),
          v.literal("document"),
        ),
      ),
    }),
  ),
});

async function resolveReplyToMessageId(
  ctx: { db: QueryCtx["db"] },
  conversationId: Id<"dmConversations">,
  replyToMessageId: Id<"dmMessages"> | undefined,
): Promise<Id<"dmMessages"> | undefined> {
  if (!replyToMessageId) return undefined;
  const target = await ctx.db.get(replyToMessageId);
  if (!target || target.conversationId !== conversationId) {
    throw new Error("Reply target not found in this chat");
  }
  return replyToMessageId;
}

const DELETED_MESSAGE_PREVIEW = "This message was deleted";

function replyPreviewBody(row: Doc<"dmMessages">): string {
  if (row.deletedAt) return DELETED_MESSAGE_PREVIEW;
  const kind = row.kind ?? "text";
  if (kind === "voice") return VOICE_PREVIEW;
  if (kind === "post") return POST_PREVIEW;
  if (kind === "comment") {
    const body = row.body.trim();
    if (!body) return COMMENT_PREVIEW;
    const clipped =
      body.length > REPLY_BODY_MAX ? `${body.slice(0, REPLY_BODY_MAX)}…` : body;
    return `${COMMENT_PREVIEW} · ${clipped}`;
  }
  if (kind === "image") {
    const caption = row.body.trim();
    if (!caption) return IMAGE_PREVIEW;
    const clipped =
      caption.length > REPLY_BODY_MAX
        ? `${caption.slice(0, REPLY_BODY_MAX)}…`
        : caption;
    return `${IMAGE_PREVIEW} · ${clipped}`;
  }
  if (kind === "video") {
    const caption = row.body.trim();
    if (!caption) return VIDEO_PREVIEW;
    const clipped =
      caption.length > REPLY_BODY_MAX
        ? `${caption.slice(0, REPLY_BODY_MAX)}…`
        : caption;
    return `${VIDEO_PREVIEW} · ${clipped}`;
  }
  if (kind === "studio_share") {
    const note = row.body.trim();
    if (note) {
      return note.length > REPLY_BODY_MAX
        ? `${note.slice(0, REPLY_BODY_MAX)}…`
        : note;
    }
    const count = row.sharedItems?.length ?? 0;
    if (count === 1) {
      const name = row.sharedItems?.[0]?.name?.trim();
      if (name) {
        return name.length > REPLY_BODY_MAX
          ? `${name.slice(0, REPLY_BODY_MAX)}…`
          : name;
      }
    }
    if (count > 1) return `${count} shared items`;
    return STUDIO_SHARE_PREVIEW;
  }
  const body = row.body.trim();
  if (!body) return "";
  return body.length > REPLY_BODY_MAX
    ? `${body.slice(0, REPLY_BODY_MAX)}…`
    : body;
}

function feedShareListPreview(kind: "post" | "comment", body: string): string {
  if (kind === "post") {
    const caption = body.trim();
    if (!caption) return POST_PREVIEW;
    return caption.length > DM_PREVIEW_MAX
      ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
      : caption;
  }
  const text = body.trim();
  if (!text) return COMMENT_PREVIEW;
  return text.length > DM_PREVIEW_MAX
    ? `${text.slice(0, DM_PREVIEW_MAX)}…`
    : text;
}

type FeedShareCard = {
  type: "post" | "comment";
  postId: Id<"profilePosts">;
  commentId?: Id<"profileComments">;
  username?: string;
  displayName?: string;
  caption?: string;
  body?: string;
  thumbnailUrl?: string;
  unavailable?: boolean;
};

async function hydrateFeedShareCard(
  ctx: QueryCtx,
  row: Doc<"dmMessages">,
  expiresUnix: number,
): Promise<FeedShareCard | undefined> {
  const kind = row.kind ?? "text";
  if (kind !== "post" && kind !== "comment") return undefined;
  const postId = row.sharedPostId;
  if (!postId) return undefined;

  const post = await ctx.db.get("profilePosts", postId);
  if (!post || post.unpublishedAt) {
    return {
      type: kind,
      postId,
      commentId: row.sharedCommentId,
      unavailable: true,
    };
  }

  const [profile, asset] = await Promise.all([
    ctx.db.get("profiles", post.profileId),
    ctx.db.get("assets", post.assetId),
  ]);
  const thumbPath = asset ? assetThumbnailPath(asset) : undefined;
  const [thumbs, people] = await Promise.all([
    thumbPath
      ? signBunnyCdnUrls([thumbPath], expiresUnix, THUMB_TRANSFORM)
      : Promise.resolve(new Map<string, string>()),
    profile
      ? hydrateSocialPeople(ctx, [profile], expiresUnix)
      : Promise.resolve([]),
  ]);
  const person = people[0];

  let commentBody: string | undefined;
  if (kind === "comment" && row.sharedCommentId) {
    const comment = await ctx.db.get("profileComments", row.sharedCommentId);
    if (comment && !comment.deletedAt) {
      commentBody = comment.body?.trim() || undefined;
    }
  }

  return {
    type: kind,
    postId,
    commentId: row.sharedCommentId,
    username: person?.username ?? profile?.username,
    displayName: person?.displayName,
    caption: post.caption?.trim() || undefined,
    // Card copy is the live post/comment — never the DM note (row.body).
    body: commentBody,
    thumbnailUrl: thumbPath ? thumbs.get(thumbPath) : undefined,
  };
}

/** Resolve playable URL for a DM media row via its billable Studio asset. */
async function resolveDmMediaUrls(
  ctx: QueryCtx,
  row: Doc<"dmMessages">,
  expiresUnix: number,
): Promise<{
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  contentType?: string;
}> {
  const kind = row.kind ?? "text";
  if (!row.assetId) {
    return { contentType: row.contentType };
  }
  const asset = await ctx.db.get(row.assetId);
  // Legacy Studio assets often lack storageStatus/byteSize but still have Bunny
  // objects — only skip explicit pending/failed (same gate as shareItems).
  const notReady =
    asset?.storageStatus === "pending" || asset?.storageStatus === "failed";
  if (asset && !asset.purgedAt && !asset.deletedAt && asset.bunnyPath && !notReady) {
    const url = await signBunnyFullUrl(
      asset.bunnyPath,
      expiresUnix,
      asset.kind,
    );
    if (kind === "voice") {
      return { audioUrl: url, contentType: asset.mimeType };
    }
    if (kind === "image") {
      return {
        imageUrl: url,
        contentType: row.contentType ?? asset.mimeType,
      };
    }
    if (kind === "video") {
      return {
        videoUrl: url,
        contentType: row.contentType ?? asset.mimeType,
      };
    }
  }
  // Asset missing/purged — orphan stub (no URL).
  return { contentType: row.contentType };
}

async function requireOwnedReadyAsset(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  assetId: Id<"assets">,
  expectedKind: "image" | "audio" | "video",
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get(assetId);
  if (!asset || asset.ownerId !== ownerId || asset.deletedAt || asset.purgedAt) {
    throw new Error("Media not found");
  }
  if (asset.kind !== expectedKind) {
    throw new Error(
      expectedKind === "image"
        ? "Only image assets can be sent as photos"
        : expectedKind === "video"
          ? "Only video assets can be sent as videos"
          : "Only audio assets can be sent as voice notes",
    );
  }
  if (asset.storageStatus === "pending" || asset.storageStatus === "failed") {
    throw new Error("Upload is not ready yet — try again");
  }
  if (!asset.bunnyPath) {
    throw new Error("Media upload is incomplete");
  }
  return asset;
}
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const CONVERSATIONS_MAX = 60;
const MESSAGES_PAGE_MAX = 200;
const PUBLIC_URL_TTL_SECONDS = 60 * 60;
const SEARCH_PEOPLE_MAX = 16;
const SEARCH_CHATS_MAX = 16;
const SEARCH_MESSAGES_MAX = 16;
const SEARCH_MESSAGE_SCAN_MAX = 120;

function peerReadAt(conversation: Doc<"dmConversations">, me: Id<"users">) {
  return conversation.userLowId === me
    ? conversation.highLastReadAt
    : conversation.lowLastReadAt;
}

function peerDeliveredAt(
  conversation: Doc<"dmConversations">,
  me: Id<"users">,
) {
  return conversation.userLowId === me
    ? (conversation.highLastDeliveredAt ?? 0)
    : (conversation.lowLastDeliveredAt ?? 0);
}

function myDeliveredAt(
  conversation: Doc<"dmConversations">,
  me: Id<"users">,
) {
  return conversation.userLowId === me
    ? (conversation.lowLastDeliveredAt ?? 0)
    : (conversation.highLastDeliveredAt ?? 0);
}

const receiptStatus = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("read"),
);

/** WhatsApp-style: sent → delivered (peer ACK) → read (peer opened chat). */
function receiptFor(
  createdAt: number,
  peerReadWatermark: number,
  peerDeliveredWatermark: number,
): "sent" | "delivered" | "read" {
  if (peerReadWatermark >= createdAt) return "read";
  if (peerDeliveredWatermark >= createdAt) return "delivered";
  return "sent";
}

/** Studio tab online — connect/visibility only; stale after 3 minutes. */
const STUDIO_ONLINE_STALE_MS = 3 * 60 * 1000;

function isStudioOnline(
  user: Pick<Doc<"users">, "studioOnline" | "studioOnlineAt"> | null | undefined,
  now: number,
): boolean {
  if (!user?.studioOnline) return false;
  const at = user.studioOnlineAt ?? 0;
  return now - at < STUDIO_ONLINE_STALE_MS;
}

function sortPair(a: Id<"users">, b: Id<"users">) {
  return String(a) < String(b)
    ? { low: a, high: b }
    : { low: b, high: a };
}

function peerIdOf(conversation: Doc<"dmConversations">, me: Id<"users">) {
  return conversation.userLowId === me
    ? conversation.userHighId
    : conversation.userLowId;
}

async function notifyDmPeer(
  ctx: MutationCtx,
  args: {
    conversation: Doc<"dmConversations">;
    senderId: Id<"users">;
    body: string;
  },
) {
  const peerId = peerIdOf(args.conversation, args.senderId);
  if (peerId === args.senderId) return;
  const title = await resolveActorDisplayName(ctx, args.senderId);
  const body =
    args.body.length > DM_PREVIEW_MAX
      ? `${args.body.slice(0, DM_PREVIEW_MAX)}…`
      : args.body;
  await createNotificationAndPush(ctx, {
    userId: peerId,
    kind: "dm_message",
    title,
    body: body || "Sent you a message",
    conversationId: args.conversation._id,
  });
}

function peerTypingAtOf(
  conversation: Doc<"dmConversations">,
  me: Id<"users">,
): number | undefined {
  const at =
    conversation.userLowId === me
      ? conversation.highTypingAt
      : conversation.lowTypingAt;
  return at && at > 0 ? at : undefined;
}

function myTypingPatch(
  conversation: Doc<"dmConversations">,
  me: Id<"users">,
  typingAt: number,
) {
  return conversation.userLowId === me
    ? { lowTypingAt: typingAt }
    : { highTypingAt: typingAt };
}

async function memberConversations(ctx: QueryCtx, me: Id<"users">) {
  const [asLow, asHigh] = await Promise.all([
    ctx.db
      .query("dmConversations")
      .withIndex("by_low_and_time", (q) => q.eq("userLowId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX),
    ctx.db
      .query("dmConversations")
      .withIndex("by_high_and_time", (q) => q.eq("userHighId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX),
  ]);
  return [...asLow, ...asHigh]
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    .slice(0, CONVERSATIONS_MAX);
}

function myReadAt(conversation: Doc<"dmConversations">, me: Id<"users">) {
  return conversation.userLowId === me
    ? conversation.lowLastReadAt
    : conversation.highLastReadAt;
}

async function requireMemberConversation(
  ctx: QueryCtx,
  conversationId: Id<"dmConversations">,
  me: Id<"users">,
): Promise<Doc<"dmConversations">> {
  const conversation = await ctx.db.get("dmConversations", conversationId);
  if (!conversation) throw new Error("Conversation not found");
  if (conversation.userLowId !== me && conversation.userHighId !== me) {
    throw new Error("You are not part of this conversation");
  }
  return conversation;
}


function isDmHiddenForUser(
  row: Doc<"dmMessages">,
  userId: Id<"users">,
): boolean {
  return (row.hiddenForUserIds ?? []).some((id) => id === userId);
}

function conversationPreviewFromMessage(row: Doc<"dmMessages">): string {
  if (row.deletedAt) return DELETED_MESSAGE_PREVIEW;
  const kind = row.kind ?? "text";
  if (kind === "voice") return VOICE_PREVIEW;
  if (kind === "post") return feedShareListPreview("post", row.body);
  if (kind === "comment") return feedShareListPreview("comment", row.body);
  if (kind === "image") {
    const caption = row.body.trim();
    if (!caption) return IMAGE_PREVIEW;
    return caption.length > DM_PREVIEW_MAX
      ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
      : caption;
  }
  if (kind === "video") {
    const caption = row.body.trim();
    if (!caption) return VIDEO_PREVIEW;
    return caption.length > DM_PREVIEW_MAX
      ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
      : caption;
  }
  if (kind === "studio_share") {
    const note = row.body.trim();
    if (note) {
      return note.length > DM_PREVIEW_MAX
        ? `${note.slice(0, DM_PREVIEW_MAX)}…`
        : note;
    }
    const count = row.sharedItems?.length ?? 0;
    if (count === 1) {
      const name = row.sharedItems?.[0]?.name?.trim();
      if (name) {
        return name.length > DM_PREVIEW_MAX
          ? `${name.slice(0, DM_PREVIEW_MAX)}…`
          : name;
      }
    }
    if (count > 1) return `${count} shared items`;
    return STUDIO_SHARE_PREVIEW;
  }
  const body = row.body.trim();
  if (!body) return "";
  return body.length > DM_PREVIEW_MAX
    ? `${body.slice(0, DM_PREVIEW_MAX)}…`
    : body;
}

async function isLatestConversationMessage(
  ctx: { db: MutationCtx["db"] },
  conversationId: Id<"dmConversations">,
  messageId: Id<"dmMessages">,
): Promise<boolean> {
  const latest = await ctx.db
    .query("dmMessages")
    .withIndex("by_conversation_and_created", (q) =>
      q.eq("conversationId", conversationId),
    )
    .order("desc")
    .first();
  return latest?._id === messageId;
}

type StudioShareCard = {
  items: Array<{
    itemKind: StudioShareItemKind;
    itemId: string;
    name: string;
    thumbnailUrl?: string;
    unavailable?: boolean;
    assetKind?: "image" | "video" | "audio" | "document";
  }>;
};

type ListedDmMessage = {
  _id: Id<"dmMessages">;
  body: string;
  kind: "text" | "voice" | "image" | "video" | "post" | "comment" | "studio_share";
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  contentType?: string;
  durationSec?: number;
  fromMe: boolean;
  receipt: "sent" | "delivered" | "read";
  replyTo?: {
    _id: Id<"dmMessages">;
    body: string;
    kind: "text" | "voice" | "image" | "video" | "post" | "comment" | "studio_share";
    fromMe: boolean;
    audioUrl?: string;
    imageUrl?: string;
    videoUrl?: string;
    durationSec?: number;
  };
  feedShare?: FeedShareCard;
  studioShare?: StudioShareCard;
  createdAt: number;
  editedAt?: number;
  deleted?: boolean;
};

async function listConversationMessages(
  ctx: QueryCtx,
  args: {
    conversation: Doc<"dmConversations">;
    viewerId: Id<"users">;
    limit: number;
    expiresUnix: number;
  },
): Promise<ListedDmMessage[]> {
  const peerReadWatermark = peerReadAt(args.conversation, args.viewerId);
  const peerDeliveredWatermark = peerDeliveredAt(
    args.conversation,
    args.viewerId,
  );
  const expiresUnix = args.expiresUnix;
  const limit = Math.min(Math.max(args.limit, 1), MESSAGES_PAGE_MAX);
  const raw = await ctx.db
    .query("dmMessages")
    .withIndex("by_conversation_and_created", (q) =>
      q.eq("conversationId", args.conversation._id),
    )
    .order("desc")
    .take(MESSAGES_PAGE_MAX);
  const visible = raw
    .filter((row) => !isDmHiddenForUser(row, args.viewerId))
    .slice(0, limit);
  const chronological = visible.reverse();
  const replyIds = [
    ...new Set(
      chronological
        .map((row) => row.replyToMessageId)
        .filter((id): id is Id<"dmMessages"> => Boolean(id)),
    ),
  ];
  const replyDocs = await Promise.all(replyIds.map((id) => ctx.db.get(id)));
  const replyById = new Map<
    Id<"dmMessages">,
    NonNullable<ListedDmMessage["replyTo"]>
  >();
  await Promise.all(
    replyDocs.map(async (doc) => {
      if (!doc) return;
      const deleted = Boolean(doc.deletedAt);
      const media = deleted
        ? {}
        : await resolveDmMediaUrls(ctx, doc, expiresUnix);
      replyById.set(doc._id, {
        _id: doc._id,
        body: replyPreviewBody(doc),
        kind: deleted ? "text" : (doc.kind ?? "text"),
        fromMe: doc.senderId === args.viewerId,
        audioUrl: media.audioUrl,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        durationSec: deleted ? undefined : doc.durationSec,
      });
    }),
  );
  return await Promise.all(
    chronological.map(async (row) => {
      const deleted = Boolean(row.deletedAt);
      const fromMe = row.senderId === args.viewerId;
      if (deleted) {
        return {
          _id: row._id,
          body: "",
          kind: "text" as const,
          fromMe,
          receipt: fromMe
            ? receiptFor(
                row.createdAt,
                peerReadWatermark,
                peerDeliveredWatermark,
              )
            : ("sent" as const),
          replyTo: row.replyToMessageId
            ? replyById.get(row.replyToMessageId)
            : undefined,
          createdAt: row.createdAt,
          deleted: true,
        };
      }
      const media = await resolveDmMediaUrls(ctx, row, expiresUnix);
      const feedShare = await hydrateFeedShareCard(ctx, row, expiresUnix);
      const studioShare = await hydrateStudioShareCard(
        ctx,
        row,
        expiresUnix,
        args.viewerId,
        peerIdOf(args.conversation, row.senderId),
      );
      return {
        _id: row._id,
        body: row.body,
        kind: row.kind ?? "text",
        audioUrl: media.audioUrl,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        contentType: media.contentType,
        durationSec: row.durationSec,
        fromMe,
        receipt: fromMe
          ? receiptFor(
              row.createdAt,
              peerReadWatermark,
              peerDeliveredWatermark,
            )
          : ("sent" as const),
        replyTo: row.replyToMessageId
          ? replyById.get(row.replyToMessageId)
          : undefined,
        feedShare,
        studioShare,
        createdAt: row.createdAt,
        ...(row.editedAt !== undefined ? { editedAt: row.editedAt } : {}),
      };
    }),
  );
}

const conversationLabelReturn = v.object({
  labelId: v.id("dmLabels"),
  name: v.string(),
  icon: v.string(),
});

const sellerTagReturn = v.optional(
  v.union(v.literal("freelancer"), v.literal("business")),
);

const searchPersonReturn = v.object({
  userId: v.id("users"),
  profileId: v.id("profiles"),
  username: v.string(),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  following: v.boolean(),
  hasChat: v.boolean(),
  sellerTag: sellerTagReturn,
});

const searchPeerReturn = v.object({
  userId: v.id("users"),
  profileId: v.id("profiles"),
  username: v.string(),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  sellerTag: sellerTagReturn,
});

const conversationRowReturn = v.object({
  conversationId: v.id("dmConversations"),
  peer: v.object({
    userId: v.id("users"),
    profileId: v.id("profiles"),
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    sellerTag: sellerTagReturn,
  }),
  labels: v.array(conversationLabelReturn),
  lastMessagePreview: v.optional(v.string()),
  lastMessageAt: v.number(),
  lastMessageFromMe: v.boolean(),
  /** Receipt for the latest outbound message (mine only; ignored otherwise). */
  lastMessageReceipt: receiptStatus,
  /** Peer has Studio open (connect/visibility; stale after ~3 min). */
  peerOnline: v.boolean(),
  /** Peer last typing ping (ms); client treats older than ~4s as idle. */
  peerTypingAt: v.optional(v.number()),
  unread: v.boolean(),
});

/** Open (or create) the single conversation between the viewer and a username. */
export const openConversation = authedMutation({
  args: { username: v.string() },
  returns: v.object({
    conversationId: v.id("dmConversations"),
    username: v.string(),
  }),
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase().replace(/^@/, "");
    if (!username) throw new Error("Username required");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile || !profile.isPublic) throw new Error("Profile not found");
    if (profile.userId === ctx.user._id) {
      throw new Error("You cannot message yourself");
    }

    const pair = sortPair(ctx.user._id, profile.userId);
    const existing = await ctx.db
      .query("dmConversations")
      .withIndex("by_pair", (q) =>
        q.eq("userLowId", pair.low).eq("userHighId", pair.high),
      )
      .unique();
    if (existing) {
      return { conversationId: existing._id, username };
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("dmConversations", {
      userLowId: pair.low,
      userHighId: pair.high,
      lastMessageAt: now,
      lowLastReadAt: now,
      highLastReadAt: now,
      lowLastDeliveredAt: 0,
      highLastDeliveredAt: 0,
      createdAt: now,
    });
    return { conversationId, username };
  },
});

/** Chat-list sidebar: newest-first conversations with peer identity + unread flag. */
export const listMyConversations = authedQuery({
  args: {
    expiresUnix: v.optional(v.number()),
    /** When set, only chats whose peer is in this owned label. */
    labelId: v.optional(v.id("dmLabels")),
  },
  returns: v.array(conversationRowReturn),
  handler: async (ctx, args) => {
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const me = ctx.user._id;

    const labelFilter = args.labelId
      ? await peerIdsInLabel(ctx, me, args.labelId)
      : undefined;
    if (args.labelId && !labelFilter) {
      throw new Error("Label not found");
    }

    const asLow = await ctx.db
      .query("dmConversations")
      .withIndex("by_low_and_time", (q) => q.eq("userLowId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    const asHigh = await ctx.db
      .query("dmConversations")
      .withIndex("by_high_and_time", (q) => q.eq("userHighId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    let conversations = [...asLow, ...asHigh]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, CONVERSATIONS_MAX);

    if (labelFilter) {
      conversations = conversations.filter((conversation) =>
        labelFilter.has(peerIdOf(conversation, me)),
      );
    }

    const peerProfiles: Array<Doc<"profiles"> | null> = await Promise.all(
      conversations.map((conversation) =>
        ctx.db
          .query("profiles")
          .withIndex("by_user", (q) =>
            q.eq("userId", peerIdOf(conversation, me)),
          )
          .unique(),
      ),
    );

    const visible: Array<{
      conversation: Doc<"dmConversations">;
      profile: Doc<"profiles">;
    }> = [];
    for (let i = 0; i < conversations.length; i++) {
      const profile = peerProfiles[i];
      if (profile) visible.push({ conversation: conversations[i]!, profile });
    }

    const peers = await hydrateSocialPeople(
      ctx,
      visible.map((row) => row.profile),
      expiresUnix,
    );

    return await Promise.all(
      visible.map(async (row, i) => {
        const { conversation, profile } = row;
        const lastMessageFromMe = conversation.lastMessageSenderId === me;
        const peerUser = await ctx.db.get("users", profile.userId);
        const memberships = await ctx.db
          .query("dmLabelMembers")
          .withIndex("by_owner_and_peer", (q) =>
            q.eq("ownerUserId", me).eq("peerUserId", profile.userId),
          )
          .collect();
        const labelDocs = await Promise.all(
          memberships.map((m) => ctx.db.get("dmLabels", m.labelId)),
        );
        const labels = labelDocs
          .filter((label): label is Doc<"dmLabels"> => Boolean(label))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((label) => ({
            labelId: label._id,
            name: label.name,
            icon: label.icon,
          }));
        const person = peers[i]!;
        const now = Date.now();
        const sellerTag = await sellerTagForUser(ctx, profile.userId);
        return {
          conversationId: conversation._id,
          peer: {
            userId: profile.userId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTag ?? undefined,
          },
          labels,
          lastMessagePreview: conversation.lastMessagePreview,
          lastMessageAt: conversation.lastMessageAt,
          lastMessageFromMe,
          lastMessageReceipt: lastMessageFromMe
            ? receiptFor(
                conversation.lastMessageAt,
                peerReadAt(conversation, me),
                peerDeliveredAt(conversation, me),
              )
            : "sent",
          peerOnline: isStudioOnline(peerUser, now),
          peerTypingAt: peerTypingAtOf(conversation, me),
          unread: Boolean(
            conversation.lastMessageSenderId &&
              conversation.lastMessageSenderId !== me &&
              conversation.lastMessageAt > myReadAt(conversation, me),
          ),
        };
      }),
    );
  },
});

/** WhatsApp-style typing ping — throttled by the client (~2s while drafting). */
export const setTyping = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    typing: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const now = Date.now();
    const nextAt = args.typing ? now : 0;
    const isLow = conversation.userLowId === ctx.user._id;
    const prev = isLow
      ? (conversation.lowTypingAt ?? 0)
      : (conversation.highTypingAt ?? 0);
    // Avoid write storms: skip identical clear; throttle online pings <1.2s.
    if (!args.typing && prev <= 0) return null;
    if (args.typing && prev > 0 && now - prev < 1200) return null;
    await ctx.db.patch(
      conversation._id,
      myTypingPatch(conversation, ctx.user._id, nextAt),
    );
    return null;
  },
});

/**
 * Unified DM sidebar search. Returns multiple full-width result groups:
 * people/friends, existing chats, message matches, and owned labels.
 * Self is excluded server-side because DMs cannot target the signed-in user.
 */
export const searchSidebar = authedQuery({
  args: {
    query: v.string(),
    expiresUnix: v.number(),
    now: v.number(),
  },
  returns: v.object({
    people: v.array(searchPersonReturn),
    chats: v.array(
      v.object({
        conversationId: v.id("dmConversations"),
        peer: searchPeerReturn,
        labels: v.array(conversationLabelReturn),
        lastMessagePreview: v.optional(v.string()),
        lastMessageAt: v.number(),
        peerOnline: v.boolean(),
      }),
    ),
    messages: v.array(
      v.object({
        messageId: v.id("dmMessages"),
        conversationId: v.id("dmConversations"),
        peer: searchPeerReturn,
        body: v.string(),
        createdAt: v.number(),
        fromMe: v.boolean(),
      }),
    ),
    labels: v.array(
      v.object({
        labelId: v.id("dmLabels"),
        name: v.string(),
        icon: v.string(),
        memberCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const rawQuery = args.query.trim().slice(0, 80);
    const needle = rawQuery.replace(/^@+/, "").toLowerCase();
    if (!needle) {
      return { people: [], chats: [], messages: [], labels: [] };
    }

    const me = ctx.user._id;
    const conversations = await memberConversations(ctx, me);
    const conversationById = new Map(
      conversations.map((conversation) => [
        String(conversation._id),
        conversation,
      ]),
    );

    const peerProfiles = (
      await Promise.all(
        conversations.map(async (conversation) => {
          return await ctx.db
            .query("profiles")
            .withIndex("by_user", (q) =>
              q.eq("userId", peerIdOf(conversation, me)),
            )
            .unique();
        }),
      )
    ).filter((profile): profile is Doc<"profiles"> => Boolean(profile));

    const follows = await ctx.db
      .query("profileFollows")
      .withIndex("by_follower", (q) => q.eq("followerUserId", me))
      .take(200);
    const followingIds = new Set(
      follows.map((follow) => String(follow.followingProfileId)),
    );
    const followedProfiles = (
      await Promise.all(
        follows.map((follow) =>
          ctx.db.get("profiles", follow.followingProfileId),
        ),
      )
    ).filter((profile): profile is Doc<"profiles"> => Boolean(profile));

    const upper = `${needle}\uffff`;
    const usernameProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) =>
        q.gte("username", needle).lt("username", upper),
      )
      .take(SEARCH_PEOPLE_MAX * 2);

    const candidateById = new Map<string, Doc<"profiles">>();
    for (const profile of [
      ...peerProfiles,
      ...followedProfiles,
      ...usernameProfiles,
    ]) {
      if (!profile.isPublic || profile.userId === me) continue;
      candidateById.set(String(profile._id), profile);
    }
    const candidateProfiles = [...candidateById.values()];
    const hydratedCandidates = await hydrateSocialPeople(
      ctx,
      candidateProfiles,
      args.expiresUnix,
    );
    const candidatePersonByProfileId = new Map(
      hydratedCandidates.map((person) => [String(person.profileId), person]),
    );
    const profileByUserId = new Map(
      peerProfiles.map((profile) => [String(profile.userId), profile]),
    );
    const personByUserId = new Map<
      string,
      {
        profileId: Id<"profiles">;
        username: string;
        displayName?: string;
        avatarUrl?: string;
      }
    >();
    for (const profile of candidateProfiles) {
      const person = candidatePersonByProfileId.get(String(profile._id));
      if (person) personByUserId.set(String(profile.userId), person);
    }

    const chatUserIds = new Set(
      conversations.map((conversation) =>
        String(peerIdOf(conversation, me)),
      ),
    );
    const sellerTagByUserId = new Map<string, "freelancer" | "business">();
    for (const profile of candidateProfiles) {
      const tag = await sellerTagForUser(ctx, profile.userId);
      if (tag) sellerTagByUserId.set(String(profile.userId), tag);
    }

    const people = candidateProfiles
      .map((profile) => {
        const person = candidatePersonByProfileId.get(String(profile._id));
        if (!person) return null;
        const haystack =
          `${person.username} ${person.displayName ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return null;
        return {
          userId: profile.userId,
          profileId: person.profileId,
          username: person.username,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
          following: followingIds.has(String(profile._id)),
          hasChat: chatUserIds.has(String(profile.userId)),
          sellerTag: sellerTagByUserId.get(String(profile.userId)),
        };
      })
      .filter((person): person is NonNullable<typeof person> => Boolean(person))
      .sort((a, b) => {
        if (a.following !== b.following) return a.following ? -1 : 1;
        if (a.hasChat !== b.hasChat) return a.hasChat ? -1 : 1;
        return a.username.localeCompare(b.username);
      })
      .slice(0, SEARCH_PEOPLE_MAX);

    const ownedLabels = await ctx.db
      .query("dmLabels")
      .withIndex("by_owner_and_order", (q) => q.eq("ownerUserId", me))
      .collect();
    const labelMembers = await Promise.all(
      ownedLabels.map((label) =>
        ctx.db
          .query("dmLabelMembers")
          .withIndex("by_label", (q) => q.eq("labelId", label._id))
          .take(501),
      ),
    );
    const labels = ownedLabels
      .map((label, index) => ({
        labelId: label._id,
        name: label.name,
        icon: label.icon,
        memberCount: Math.min(labelMembers[index]?.length ?? 0, 500),
      }))
      .filter((label) => label.name.toLowerCase().includes(needle));

    const labelByPeerUserId = new Map<
      string,
      Array<{ labelId: Id<"dmLabels">; name: string; icon: string }>
    >();
    for (let index = 0; index < ownedLabels.length; index++) {
      const label = ownedLabels[index]!;
      for (const membership of labelMembers[index] ?? []) {
        const key = String(membership.peerUserId);
        const rows = labelByPeerUserId.get(key) ?? [];
        rows.push({ labelId: label._id, name: label.name, icon: label.icon });
        labelByPeerUserId.set(key, rows);
      }
    }

    const chats = conversations
      .map((conversation) => {
        const peerUserId = peerIdOf(conversation, me);
        const profile = profileByUserId.get(String(peerUserId));
        const person = personByUserId.get(String(peerUserId));
        if (!profile || !person) return null;
        const peerLabels = labelByPeerUserId.get(String(peerUserId)) ?? [];
        const haystack = [
          person.username,
          person.displayName ?? "",
          conversation.lastMessagePreview ?? "",
          ...peerLabels.map((label) => label.name),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return null;
        return {
          conversationId: conversation._id,
          peer: {
            userId: peerUserId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTagByUserId.get(String(peerUserId)),
          },
          labels: peerLabels,
          lastMessagePreview: conversation.lastMessagePreview,
          lastMessageAt: conversation.lastMessageAt,
          peerOnline: false,
        };
      })
      .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))
      .slice(0, SEARCH_CHATS_MAX);

    for (const chat of chats) {
      const peerUser = await ctx.db.get("users", chat.peer.userId);
      chat.peerOnline = isStudioOnline(peerUser, args.now);
    }

    const searchedMessages =
      rawQuery.length >= 2
        ? await ctx.db
            .query("dmMessages")
            .withSearchIndex("search_body", (q) =>
              q.search("body", rawQuery),
            )
            .take(SEARCH_MESSAGE_SCAN_MAX)
        : [];
    const messages = searchedMessages
      .map((message) => {
        if (message.deletedAt) return null;
        if (isDmHiddenForUser(message, me)) return null;
        const conversation = conversationById.get(
          String(message.conversationId),
        );
        if (!conversation) return null;
        const peerUserId = peerIdOf(conversation, me);
        const person = personByUserId.get(String(peerUserId));
        if (!person) return null;
        return {
          messageId: message._id,
          conversationId: conversation._id,
          peer: {
            userId: peerUserId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTagByUserId.get(String(peerUserId)),
          },
          body: message.body.slice(0, 240),
          createdAt: message.createdAt,
          fromMe: message.senderId === me,
        };
      })
      .filter((message): message is NonNullable<typeof message> =>
        Boolean(message),
      )
      .slice(0, SEARCH_MESSAGES_MAX);

    return {
      people,
      chats,
      messages,
      labels,
    };
  },
});

const listMessagesReturn = v.array(
  v.object({
    _id: v.id("dmMessages"),
    body: v.string(),
    kind: dmMessageKind,
    audioUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    contentType: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    fromMe: v.boolean(),
    /**
     * WhatsApp-style receipt for outbound messages:
     * sent (1 tick) → delivered (2 gray, peer ACK) → read (2 colored).
     */
    receipt: receiptStatus,
    replyTo: v.optional(replySnippet),
    feedShare: v.optional(feedShareCard),
    studioShare: v.optional(studioShareCard),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    deleted: v.optional(v.boolean()),
  }),
);

/** Messages for one conversation, oldest → newest (reactive). */
export const listMessages = authedQuery({
  args: {
    conversationId: v.id("dmConversations"),
    limit: v.optional(v.number()),
    /** Bunny URL expiry — membership-signed for peer playback. */
    expiresUnix: v.number(),
  },
  returns: listMessagesReturn,
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    return await listConversationMessages(ctx, {
      conversation,
      viewerId: ctx.user._id,
      limit: args.limit ?? 120,
      expiresUnix: args.expiresUnix,
    });
  },
});

export const sendMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    body: v.string(),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    await assertCanMessagePeer(
      ctx,
      ctx.user._id,
      peerIdOf(conversation, ctx.user._id),
    );
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");
    if (body.length > DM_BODY_MAX) {
      throw new Error(`Message must be at most ${DM_BODY_MAX} characters`);
    }
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body,
      kind: "text",
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview:
        body.length > DM_PREVIEW_MAX ? `${body.slice(0, DM_PREVIEW_MAX)}…` : body,
      lastMessageSenderId: ctx.user._id,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: ctx.user._id,
      body,
    });
    return messageId;
  },
});

/** Share a public feed post (or comment on it) into a DM as a reply-style card. */
export const sendFeedShare = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    postId: v.id("profilePosts"),
    commentId: v.optional(v.id("profileComments")),
    note: v.optional(v.string()),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    await assertCanMessagePeer(
      ctx,
      ctx.user._id,
      peerIdOf(conversation, ctx.user._id),
    );

    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.unpublishedAt) {
      throw new Error("Post not found");
    }

    let kind: "post" | "comment" = "post";
    /** User note only — never duplicate the post caption / comment text here. */
    let body = (args.note ?? "").trim();
    let sharedCommentId: Id<"profileComments"> | undefined;
    let previewFallback = (post.caption ?? "").trim();

    if (args.commentId) {
      const comment = await ctx.db.get("profileComments", args.commentId);
      if (
        !comment ||
        comment.deletedAt ||
        comment.postId !== post._id
      ) {
        throw new Error("Comment not found");
      }
      kind = "comment";
      sharedCommentId = comment._id;
      previewFallback = comment.body.trim();
    }

    if (body.length > DM_BODY_MAX) {
      body = `${body.slice(0, DM_BODY_MAX - 1)}…`;
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body,
      kind,
      sharedPostId: post._id,
      ...(sharedCommentId ? { sharedCommentId } : {}),
      createdAt: now,
    });

    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: feedShareListPreview(
        kind,
        body || previewFallback,
      ),
      lastMessageSenderId: ctx.user._id,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });

    // Count as a post share when the payload is the post itself.
    if (kind === "post") {
      await ctx.db.patch(post._id, {
        shareCount: (post.shareCount ?? 0) + 1,
      });
    }

    await notifyDmPeer(ctx, {
      conversation,
      senderId: ctx.user._id,
      body: feedShareListPreview(kind, body || previewFallback),
    });
    return messageId;
  },
});

export const sendVoiceMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    /** Billable Studio audio asset in the sender's Messages folder. */
    assetId: v.id("assets"),
    durationSec: v.number(),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    await assertCanMessagePeer(
      ctx,
      ctx.user._id,
      peerIdOf(conversation, ctx.user._id),
    );
    if (
      !Number.isFinite(args.durationSec) ||
      args.durationSec <= 0 ||
      args.durationSec > VOICE_NOTE_MAX_SECONDS
    ) {
      throw new Error("Voice notes must be between 1 second and 5 minutes");
    }
    await requireOwnedReadyAsset(ctx, ctx.user._id, args.assetId, "audio");
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body: "",
      kind: "voice",
      assetId: args.assetId,
      durationSec: Math.round(args.durationSec * 10) / 10,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: VOICE_PREVIEW,
      lastMessageSenderId: ctx.user._id,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: ctx.user._id,
      body: VOICE_PREVIEW,
    });
    return messageId;
  },
});

export const sendImageMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    /** Billable Studio image asset in the sender's Messages folder. */
    assetId: v.id("assets"),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    await assertCanMessagePeer(
      ctx,
      ctx.user._id,
      peerIdOf(conversation, ctx.user._id),
    );
    const asset = await requireOwnedReadyAsset(ctx, ctx.user._id, args.assetId, "image");
    const contentType = (asset.mimeType || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
    }
    if ((asset.byteSize ?? 0) > IMAGE_MAX_BYTES) {
      throw new Error("Images must be 10 MB or smaller");
    }
    const caption = (args.caption ?? "").trim();
    if (caption.length > DM_BODY_MAX) {
      throw new Error(`Caption must be at most ${DM_BODY_MAX} characters`);
    }
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body: caption,
      kind: "image",
      assetId: args.assetId,
      contentType,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    const preview = caption
      ? caption.length > DM_PREVIEW_MAX
        ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
        : caption
      : IMAGE_PREVIEW;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: ctx.user._id,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: ctx.user._id,
      body: preview,
    });
    return messageId;
  },
});

export const sendVideoMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    assetId: v.id("assets"),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    await assertCanMessagePeer(
      ctx,
      ctx.user._id,
      peerIdOf(conversation, ctx.user._id),
    );
    const asset = await requireOwnedReadyAsset(
      ctx,
      ctx.user._id,
      args.assetId,
      "video",
    );
    const contentType = (asset.mimeType || "").toLowerCase();
    if (contentType && !contentType.startsWith("video/")) {
      throw new Error("Only video files can be sent as videos");
    }
    if ((asset.byteSize ?? 0) > VIDEO_MAX_BYTES) {
      throw new Error("Videos must be 200 MB or smaller");
    }
    const caption = (args.caption ?? "").trim();
    if (caption.length > DM_BODY_MAX) {
      throw new Error(`Caption must be at most ${DM_BODY_MAX} characters`);
    }
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body: caption,
      kind: "video",
      assetId: args.assetId,
      contentType: contentType || asset.mimeType,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    const preview = caption
      ? caption.length > DM_PREVIEW_MAX
        ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
        : caption
      : VIDEO_PREVIEW;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: ctx.user._id,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: ctx.user._id,
      body: preview,
    });
    return messageId;
  },
});

export const editMessage = authedMutation({
  args: {
    messageId: v.id("dmMessages"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.deletedAt) throw new Error("Cannot edit a deleted message");
    if (message.senderId !== ctx.user._id) {
      throw new Error("You can only edit your own messages");
    }
    const conversation = await requireMemberConversation(
      ctx,
      message.conversationId,
      ctx.user._id,
    );
    const kind = message.kind ?? "text";
    if (kind !== "text" && kind !== "image") {
      throw new Error("Only text and photo captions can be edited");
    }
    const body = args.body.trim();
    if (kind === "text" && !body) {
      throw new Error("Message cannot be empty");
    }
    if (body.length > DM_BODY_MAX) {
      throw new Error(`Message must be at most ${DM_BODY_MAX} characters`);
    }
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      body,
      editedAt: now,
    });
    if (await isLatestConversationMessage(ctx, conversation._id, args.messageId)) {
      await ctx.db.patch(conversation._id, {
        lastMessagePreview: conversationPreviewFromMessage({
          ...message,
          body,
          deletedAt: undefined,
        }),
      });
    }
    return null;
  },
});

export const deleteMessageForMe = authedMutation({
  args: { messageId: v.id("dmMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    await requireMemberConversation(
      ctx,
      message.conversationId,
      ctx.user._id,
    );
    const hidden = message.hiddenForUserIds ?? [];
    if (hidden.includes(ctx.user._id)) return null;
    await ctx.db.patch(args.messageId, {
      hiddenForUserIds: [...hidden, ctx.user._id],
    });
    return null;
  },
});

export const deleteMessageForEveryone = authedMutation({
  args: { messageId: v.id("dmMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== ctx.user._id) {
      throw new Error("You can only delete your own messages for everyone");
    }
    const conversation = await requireMemberConversation(
      ctx,
      message.conversationId,
      ctx.user._id,
    );
    if (message.deletedAt) return null;
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      deletedAt: now,
      body: "",
    });
    if (await isLatestConversationMessage(ctx, conversation._id, args.messageId)) {
      await ctx.db.patch(conversation._id, {
        lastMessagePreview: DELETED_MESSAGE_PREVIEW,
      });
    }
    return null;
  },
});


export const editMessageForApi = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("dmMessages"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.deletedAt) throw new Error("Cannot edit a deleted message");
    if (message.senderId !== args.userId) {
      throw new Error("You can only edit your own messages");
    }
    const conversation = await requireMemberConversation(
      ctx,
      message.conversationId,
      args.userId,
    );
    const kind = message.kind ?? "text";
    if (kind !== "text" && kind !== "image") {
      throw new Error("Only text and photo captions can be edited");
    }
    const body = args.body.trim();
    if (kind === "text" && !body) {
      throw new Error("Message cannot be empty");
    }
    if (body.length > DM_BODY_MAX) {
      throw new Error(`Message must be at most ${DM_BODY_MAX} characters`);
    }
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      body,
      editedAt: now,
    });
    if (await isLatestConversationMessage(ctx, conversation._id, args.messageId)) {
      await ctx.db.patch(conversation._id, {
        lastMessagePreview: conversationPreviewFromMessage({
          ...message,
          body,
          deletedAt: undefined,
        }),
      });
    }
    return null;
  },
});

export const deleteMessageForMeForApi = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("dmMessages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    await requireMemberConversation(
      ctx,
      message.conversationId,
      args.userId,
    );
    const hidden = message.hiddenForUserIds ?? [];
    if (hidden.includes(args.userId)) return null;
    await ctx.db.patch(args.messageId, {
      hiddenForUserIds: [...hidden, args.userId],
    });
    return null;
  },
});

export const deleteMessageForEveryoneForApi = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("dmMessages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const message = await ctx.db.get("dmMessages", args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== args.userId) {
      throw new Error("You can only delete your own messages for everyone");
    }
    const conversation = await requireMemberConversation(
      ctx,
      message.conversationId,
      args.userId,
    );
    if (message.deletedAt) return null;
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      deletedAt: now,
      body: "",
    });
    if (await isLatestConversationMessage(ctx, conversation._id, args.messageId)) {
      await ctx.db.patch(conversation._id, {
        lastMessagePreview: DELETED_MESSAGE_PREVIEW,
      });
    }
    return null;
  },
});

/**
 * Recipient device ACK — advances my delivery watermark so the sender sees
 * double gray ticks. Idempotent: only moves forward.
 * Soft-fails on missing/non-member (stale session cache after account switch).
 */
export const ackDelivered = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    upToCreatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("dmConversations", args.conversationId);
    if (!conversation) return null;
    if (
      conversation.userLowId !== ctx.user._id &&
      conversation.userHighId !== ctx.user._id
    ) {
      return null;
    }
    if (!Number.isFinite(args.upToCreatedAt) || args.upToCreatedAt <= 0) {
      return null;
    }
    const current = myDeliveredAt(conversation, ctx.user._id);
    if (args.upToCreatedAt <= current) return null;
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      ...(isLow
        ? { lowLastDeliveredAt: args.upToCreatedAt }
        : { highLastDeliveredAt: args.upToCreatedAt }),
    });
    return null;
  },
});

export const markRead = authedMutation({
  args: { conversationId: v.id("dmConversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const now = Date.now();
    const isLow = conversation.userLowId === ctx.user._id;
    const delivered = Math.max(myDeliveredAt(conversation, ctx.user._id), now);
    await ctx.db.patch(conversation._id, {
      ...(isLow
        ? { lowLastReadAt: now, lowLastDeliveredAt: delivered }
        : { highLastReadAt: now, highLastDeliveredAt: delivered }),
    });
    return null;
  },
});

/** Total conversations with unseen messages — for a sidebar/tab badge. */
export const unreadConversationCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const me = ctx.user._id;
    const asLow = await ctx.db
      .query("dmConversations")
      .withIndex("by_low_and_time", (q) => q.eq("userLowId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    const asHigh = await ctx.db
      .query("dmConversations")
      .withIndex("by_high_and_time", (q) => q.eq("userHighId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    let count = 0;
    for (const conversation of [...asLow, ...asHigh]) {
      if (
        conversation.lastMessageSenderId &&
        conversation.lastMessageSenderId !== me &&
        conversation.lastMessageAt > myReadAt(conversation, me)
      ) {
        count += 1;
      }
    }
    return count;
  },
});


async function requireApiUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("User not found");
  return user;
}

const openConversationReturn = v.object({
  conversationId: v.id("dmConversations"),
  username: v.string(),
});


const searchSidebarReturn = v.object({
  people: v.array(searchPersonReturn),
  chats: v.array(
    v.object({
      conversationId: v.id("dmConversations"),
      peer: searchPeerReturn,
      labels: v.array(conversationLabelReturn),
      lastMessagePreview: v.optional(v.string()),
      lastMessageAt: v.number(),
      peerOnline: v.boolean(),
    }),
  ),
  messages: v.array(
    v.object({
      messageId: v.id("dmMessages"),
      conversationId: v.id("dmConversations"),
      peer: searchPeerReturn,
      body: v.string(),
      createdAt: v.number(),
      fromMe: v.boolean(),
    }),
  ),
  labels: v.array(
    v.object({
      labelId: v.id("dmLabels"),
      name: v.string(),
      icon: v.string(),
      memberCount: v.number(),
    }),
  ),
});

// ─── API key surface (Studio HTTP / MCP) ─────────────────────────────────────

export const openConversationForApi = internalMutation({
  args: {
    userId: v.id("users"),
    username: v.string(),
  },
  returns: openConversationReturn,
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const username = args.username.trim().toLowerCase().replace(/^@/, "");
    if (!username) throw new Error("Username required");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile || !profile.isPublic) throw new Error("Profile not found");
    if (profile.userId === args.userId) {
      throw new Error("You cannot message yourself");
    }

    const pair = sortPair(args.userId, profile.userId);
    const existing = await ctx.db
      .query("dmConversations")
      .withIndex("by_pair", (q) =>
        q.eq("userLowId", pair.low).eq("userHighId", pair.high),
      )
      .unique();
    if (existing) {
      return { conversationId: existing._id, username };
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("dmConversations", {
      userLowId: pair.low,
      userHighId: pair.high,
      lastMessageAt: now,
      lowLastReadAt: now,
      highLastReadAt: now,
      lowLastDeliveredAt: 0,
      highLastDeliveredAt: 0,
      createdAt: now,
    });
    return { conversationId, username };
  },
});

export const listMyConversationsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    expiresUnix: v.optional(v.number()),
    labelId: v.optional(v.id("dmLabels")),
  },
  returns: v.array(conversationRowReturn),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const me = args.userId;

    const labelFilter = args.labelId
      ? await peerIdsInLabel(ctx, me, args.labelId)
      : undefined;
    if (args.labelId && !labelFilter) {
      throw new Error("Label not found");
    }

    const asLow = await ctx.db
      .query("dmConversations")
      .withIndex("by_low_and_time", (q) => q.eq("userLowId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    const asHigh = await ctx.db
      .query("dmConversations")
      .withIndex("by_high_and_time", (q) => q.eq("userHighId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    let conversations = [...asLow, ...asHigh]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, CONVERSATIONS_MAX);

    if (labelFilter) {
      conversations = conversations.filter((conversation) =>
        labelFilter.has(peerIdOf(conversation, me)),
      );
    }

    const peerProfiles: Array<Doc<"profiles"> | null> = await Promise.all(
      conversations.map((conversation) =>
        ctx.db
          .query("profiles")
          .withIndex("by_user", (q) =>
            q.eq("userId", peerIdOf(conversation, me)),
          )
          .unique(),
      ),
    );

    const visible: Array<{
      conversation: Doc<"dmConversations">;
      profile: Doc<"profiles">;
    }> = [];
    for (let i = 0; i < conversations.length; i++) {
      const profile = peerProfiles[i];
      if (profile) visible.push({ conversation: conversations[i]!, profile });
    }

    const peers = await hydrateSocialPeople(
      ctx,
      visible.map((row) => row.profile),
      expiresUnix,
    );

    return await Promise.all(
      visible.map(async (row, i) => {
        const { conversation, profile } = row;
        const lastMessageFromMe = conversation.lastMessageSenderId === me;
        const peerUser = await ctx.db.get("users", profile.userId);
        const memberships = await ctx.db
          .query("dmLabelMembers")
          .withIndex("by_owner_and_peer", (q) =>
            q.eq("ownerUserId", me).eq("peerUserId", profile.userId),
          )
          .collect();
        const labelDocs = await Promise.all(
          memberships.map((m) => ctx.db.get("dmLabels", m.labelId)),
        );
        const labels = labelDocs
          .filter((label): label is Doc<"dmLabels"> => Boolean(label))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((label) => ({
            labelId: label._id,
            name: label.name,
            icon: label.icon,
          }));
        const person = peers[i]!;
        const now = Date.now();
        const sellerTag = await sellerTagForUser(ctx, profile.userId);
        return {
          conversationId: conversation._id,
          peer: {
            userId: profile.userId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTag ?? undefined,
          },
          labels,
          lastMessagePreview: conversation.lastMessagePreview,
          lastMessageAt: conversation.lastMessageAt,
          lastMessageFromMe,
          lastMessageReceipt: lastMessageFromMe
            ? receiptFor(
                conversation.lastMessageAt,
                peerReadAt(conversation, me),
                peerDeliveredAt(conversation, me),
              )
            : "sent",
          peerOnline: isStudioOnline(peerUser, now),
          peerTypingAt: peerTypingAtOf(conversation, me),
          unread: Boolean(
            conversation.lastMessageSenderId &&
              conversation.lastMessageSenderId !== me &&
              conversation.lastMessageAt > myReadAt(conversation, me),
          ),
        };
      }),
    );
  },
});

export const searchSidebarForApi = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    expiresUnix: v.number(),
    now: v.number(),
  },
  returns: searchSidebarReturn,
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const rawQuery = args.query.trim().slice(0, 80);
    const needle = rawQuery.replace(/^@+/, "").toLowerCase();
    if (!needle) {
      return { people: [], chats: [], messages: [], labels: [] };
    }

    const me = args.userId;
    const conversations = await memberConversations(ctx, me);
    const conversationById = new Map(
      conversations.map((conversation) => [
        String(conversation._id),
        conversation,
      ]),
    );

    const peerProfiles = (
      await Promise.all(
        conversations.map(async (conversation) => {
          return await ctx.db
            .query("profiles")
            .withIndex("by_user", (q) =>
              q.eq("userId", peerIdOf(conversation, me)),
            )
            .unique();
        }),
      )
    ).filter((profile): profile is Doc<"profiles"> => Boolean(profile));

    const follows = await ctx.db
      .query("profileFollows")
      .withIndex("by_follower", (q) => q.eq("followerUserId", me))
      .take(200);
    const followingIds = new Set(
      follows.map((follow) => String(follow.followingProfileId)),
    );
    const followedProfiles = (
      await Promise.all(
        follows.map((follow) =>
          ctx.db.get("profiles", follow.followingProfileId),
        ),
      )
    ).filter((profile): profile is Doc<"profiles"> => Boolean(profile));

    const upper = `${needle}\uffff`;
    const usernameProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) =>
        q.gte("username", needle).lt("username", upper),
      )
      .take(SEARCH_PEOPLE_MAX * 2);

    const candidateById = new Map<string, Doc<"profiles">>();
    for (const profile of [
      ...peerProfiles,
      ...followedProfiles,
      ...usernameProfiles,
    ]) {
      if (!profile.isPublic || profile.userId === me) continue;
      candidateById.set(String(profile._id), profile);
    }
    const candidateProfiles = [...candidateById.values()];
    const hydratedCandidates = await hydrateSocialPeople(
      ctx,
      candidateProfiles,
      args.expiresUnix,
    );
    const candidatePersonByProfileId = new Map(
      hydratedCandidates.map((person) => [String(person.profileId), person]),
    );
    const profileByUserId = new Map(
      peerProfiles.map((profile) => [String(profile.userId), profile]),
    );
    const personByUserId = new Map<
      string,
      {
        profileId: Id<"profiles">;
        username: string;
        displayName?: string;
        avatarUrl?: string;
      }
    >();
    for (const profile of candidateProfiles) {
      const person = candidatePersonByProfileId.get(String(profile._id));
      if (person) personByUserId.set(String(profile.userId), person);
    }

    const chatUserIds = new Set(
      conversations.map((conversation) =>
        String(peerIdOf(conversation, me)),
      ),
    );
    const sellerTagByUserId = new Map<string, "freelancer" | "business">();
    for (const profile of candidateProfiles) {
      const tag = await sellerTagForUser(ctx, profile.userId);
      if (tag) sellerTagByUserId.set(String(profile.userId), tag);
    }

    const people = candidateProfiles
      .map((profile) => {
        const person = candidatePersonByProfileId.get(String(profile._id));
        if (!person) return null;
        const haystack =
          `${person.username} ${person.displayName ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return null;
        return {
          userId: profile.userId,
          profileId: person.profileId,
          username: person.username,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
          following: followingIds.has(String(profile._id)),
          hasChat: chatUserIds.has(String(profile.userId)),
          sellerTag: sellerTagByUserId.get(String(profile.userId)),
        };
      })
      .filter((person): person is NonNullable<typeof person> => Boolean(person))
      .sort((a, b) => {
        if (a.following !== b.following) return a.following ? -1 : 1;
        if (a.hasChat !== b.hasChat) return a.hasChat ? -1 : 1;
        return a.username.localeCompare(b.username);
      })
      .slice(0, SEARCH_PEOPLE_MAX);

    const ownedLabels = await ctx.db
      .query("dmLabels")
      .withIndex("by_owner_and_order", (q) => q.eq("ownerUserId", me))
      .collect();
    const labelMembers = await Promise.all(
      ownedLabels.map((label) =>
        ctx.db
          .query("dmLabelMembers")
          .withIndex("by_label", (q) => q.eq("labelId", label._id))
          .take(501),
      ),
    );
    const labels = ownedLabels
      .map((label, index) => ({
        labelId: label._id,
        name: label.name,
        icon: label.icon,
        memberCount: Math.min(labelMembers[index]?.length ?? 0, 500),
      }))
      .filter((label) => label.name.toLowerCase().includes(needle));

    const labelByPeerUserId = new Map<
      string,
      Array<{ labelId: Id<"dmLabels">; name: string; icon: string }>
    >();
    for (let index = 0; index < ownedLabels.length; index++) {
      const label = ownedLabels[index]!;
      for (const membership of labelMembers[index] ?? []) {
        const key = String(membership.peerUserId);
        const rows = labelByPeerUserId.get(key) ?? [];
        rows.push({ labelId: label._id, name: label.name, icon: label.icon });
        labelByPeerUserId.set(key, rows);
      }
    }

    const chats = conversations
      .map((conversation) => {
        const peerUserId = peerIdOf(conversation, me);
        const profile = profileByUserId.get(String(peerUserId));
        const person = personByUserId.get(String(peerUserId));
        if (!profile || !person) return null;
        const peerLabels = labelByPeerUserId.get(String(peerUserId)) ?? [];
        const haystack = [
          person.username,
          person.displayName ?? "",
          conversation.lastMessagePreview ?? "",
          ...peerLabels.map((label) => label.name),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return null;
        return {
          conversationId: conversation._id,
          peer: {
            userId: peerUserId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTagByUserId.get(String(peerUserId)),
          },
          labels: peerLabels,
          lastMessagePreview: conversation.lastMessagePreview,
          lastMessageAt: conversation.lastMessageAt,
          peerOnline: false,
        };
      })
      .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))
      .slice(0, SEARCH_CHATS_MAX);

    for (const chat of chats) {
      const peerUser = await ctx.db.get("users", chat.peer.userId);
      chat.peerOnline = isStudioOnline(peerUser, args.now);
    }

    const searchedMessages =
      rawQuery.length >= 2
        ? await ctx.db
            .query("dmMessages")
            .withSearchIndex("search_body", (q) =>
              q.search("body", rawQuery),
            )
            .take(SEARCH_MESSAGE_SCAN_MAX)
        : [];
    const messages = searchedMessages
      .map((message) => {
        if (message.deletedAt) return null;
        if (isDmHiddenForUser(message, me)) return null;
        const conversation = conversationById.get(
          String(message.conversationId),
        );
        if (!conversation) return null;
        const peerUserId = peerIdOf(conversation, me);
        const person = personByUserId.get(String(peerUserId));
        if (!person) return null;
        return {
          messageId: message._id,
          conversationId: conversation._id,
          peer: {
            userId: peerUserId,
            profileId: person.profileId,
            username: person.username,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
            sellerTag: sellerTagByUserId.get(String(peerUserId)),
          },
          body: message.body.slice(0, 240),
          createdAt: message.createdAt,
          fromMe: message.senderId === me,
        };
      })
      .filter((message): message is NonNullable<typeof message> =>
        Boolean(message),
      )
      .slice(0, SEARCH_MESSAGES_MAX);

    return {
      people,
      chats,
      messages,
      labels,
    };
  },
});

export const listMessagesForApi = internalQuery({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
    limit: v.optional(v.number()),
    expiresUnix: v.number(),
  },
  returns: listMessagesReturn,
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    return await listConversationMessages(ctx, {
      conversation,
      viewerId: args.userId,
      limit: args.limit ?? 120,
      expiresUnix: args.expiresUnix,
    });
  },
});

export const sendMessageForApi = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
    body: v.string(),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    await assertCanMessagePeer(
      ctx,
      args.userId,
      peerIdOf(conversation, args.userId),
    );
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");
    if (body.length > DM_BODY_MAX) {
      throw new Error(`Message must be at most ${DM_BODY_MAX} characters`);
    }
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: args.userId,
      body,
      kind: "text",
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === args.userId;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview:
        body.length > DM_PREVIEW_MAX ? `${body.slice(0, DM_PREVIEW_MAX)}…` : body,
      lastMessageSenderId: args.userId,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: args.userId,
      body,
    });
    return messageId;
  },
});

export const sendFeedShareForApi = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
    postId: v.id("profilePosts"),
    commentId: v.optional(v.id("profileComments")),
    note: v.optional(v.string()),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    await assertCanMessagePeer(
      ctx,
      args.userId,
      peerIdOf(conversation, args.userId),
    );

    const post = await ctx.db.get("profilePosts", args.postId);
    if (!post || post.unpublishedAt) {
      throw new Error("Post not found");
    }

    let kind: "post" | "comment" = "post";
    let body = (args.note ?? "").trim();
    let sharedCommentId: Id<"profileComments"> | undefined;
    let previewFallback = (post.caption ?? "").trim();

    if (args.commentId) {
      const comment = await ctx.db.get("profileComments", args.commentId);
      if (
        !comment ||
        comment.deletedAt ||
        comment.postId !== post._id
      ) {
        throw new Error("Comment not found");
      }
      kind = "comment";
      sharedCommentId = comment._id;
      previewFallback = comment.body.trim();
    }

    if (body.length > DM_BODY_MAX) {
      body = `${body.slice(0, DM_BODY_MAX - 1)}…`;
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: args.userId,
      body,
      kind,
      sharedPostId: post._id,
      ...(sharedCommentId ? { sharedCommentId } : {}),
      createdAt: now,
    });

    const isLow = conversation.userLowId === args.userId;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: feedShareListPreview(
        kind,
        body || previewFallback,
      ),
      lastMessageSenderId: args.userId,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });

    if (kind === "post") {
      await ctx.db.patch(post._id, {
        shareCount: (post.shareCount ?? 0) + 1,
      });
    }

    await notifyDmPeer(ctx, {
      conversation,
      senderId: args.userId,
      body: feedShareListPreview(kind, body || previewFallback),
    });
    return messageId;
  },
});

export const sendImageMessageForApi = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
    assetId: v.id("assets"),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    await assertCanMessagePeer(
      ctx,
      args.userId,
      peerIdOf(conversation, args.userId),
    );
    const asset = await requireOwnedReadyAsset(
      ctx,
      args.userId,
      args.assetId,
      "image",
    );
    const contentType = (asset.mimeType || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
    }
    if ((asset.byteSize ?? 0) > IMAGE_MAX_BYTES) {
      throw new Error("Images must be 10 MB or smaller");
    }
    const caption = (args.caption ?? "").trim();
    if (caption.length > DM_BODY_MAX) {
      throw new Error(`Caption must be at most ${DM_BODY_MAX} characters`);
    }
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: args.userId,
      body: caption,
      kind: "image",
      assetId: args.assetId,
      contentType,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === args.userId;
    const preview = caption
      ? caption.length > DM_PREVIEW_MAX
        ? `${caption.slice(0, DM_PREVIEW_MAX)}…`
        : caption
      : IMAGE_PREVIEW;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: args.userId,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: args.userId,
      body: preview,
    });
    return messageId;
  },
});


export const sendVoiceMessageForApi = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
    assetId: v.id("assets"),
    durationSec: v.number(),
    replyToMessageId: v.optional(v.id("dmMessages")),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    await assertCanMessagePeer(
      ctx,
      args.userId,
      peerIdOf(conversation, args.userId),
    );
    if (
      !Number.isFinite(args.durationSec) ||
      args.durationSec <= 0 ||
      args.durationSec > VOICE_NOTE_MAX_SECONDS
    ) {
      throw new Error("Voice notes must be between 1 second and 5 minutes");
    }
    await requireOwnedReadyAsset(ctx, args.userId, args.assetId, "audio");
    const replyToMessageId = await resolveReplyToMessageId(
      ctx,
      conversation._id,
      args.replyToMessageId,
    );

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: args.userId,
      body: "",
      kind: "voice",
      assetId: args.assetId,
      durationSec: Math.round(args.durationSec * 10) / 10,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      createdAt: now,
    });
    const isLow = conversation.userLowId === args.userId;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: VOICE_PREVIEW,
      lastMessageSenderId: args.userId,
      ...(isLow
        ? { lowLastReadAt: now, lowTypingAt: 0 }
        : { highLastReadAt: now, highTypingAt: 0 }),
    });
    await notifyDmPeer(ctx, {
      conversation,
      senderId: args.userId,
      body: VOICE_PREVIEW,
    });
    return messageId;
  },
});

export const markReadForApi = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("dmConversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      args.userId,
    );
    const now = Date.now();
    const isLow = conversation.userLowId === args.userId;
    const delivered = Math.max(myDeliveredAt(conversation, args.userId), now);
    await ctx.db.patch(conversation._id, {
      ...(isLow
        ? { lowLastReadAt: now, lowLastDeliveredAt: delivered }
        : { highLastReadAt: now, highLastDeliveredAt: delivered }),
    });
    return null;
  },
});

export const unreadConversationCountForApi = internalQuery({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireApiUser(ctx, args.userId);
    const me = args.userId;
    const asLow = await ctx.db
      .query("dmConversations")
      .withIndex("by_low_and_time", (q) => q.eq("userLowId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    const asHigh = await ctx.db
      .query("dmConversations")
      .withIndex("by_high_and_time", (q) => q.eq("userHighId", me))
      .order("desc")
      .take(CONVERSATIONS_MAX);
    let count = 0;
    for (const conversation of [...asLow, ...asHigh]) {
      if (
        conversation.lastMessageSenderId &&
        conversation.lastMessageSenderId !== me &&
        conversation.lastMessageAt > myReadAt(conversation, me)
      ) {
        count += 1;
      }
    }
    return count;
  },
});
