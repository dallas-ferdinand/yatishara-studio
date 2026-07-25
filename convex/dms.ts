/**
 * Person-to-person direct messages (WhatsApp-style).
 * Exactly one conversation exists per user pair — enforced by the sorted-pair
 * index on dmConversations (userLowId < userHighId by id string).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { hydrateSocialPeople } from "./profiles";

const DM_BODY_MAX = 4000;
const DM_PREVIEW_MAX = 120;
const VOICE_NOTE_MAX_SECONDS = 300;
const VOICE_PREVIEW = "Voice message";
const IMAGE_PREVIEW = "Photo";
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const CONVERSATIONS_MAX = 60;
const MESSAGES_PAGE_MAX = 200;
const PUBLIC_URL_TTL_SECONDS = 60 * 60;

function peerReadAt(conversation: Doc<"dmConversations">, me: Id<"users">) {
  return conversation.userLowId === me
    ? conversation.highLastReadAt
    : conversation.lowLastReadAt;
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

const conversationRowReturn = v.object({
  conversationId: v.id("dmConversations"),
  peer: v.object({
    profileId: v.id("profiles"),
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }),
  lastMessagePreview: v.optional(v.string()),
  lastMessageAt: v.number(),
  lastMessageFromMe: v.boolean(),
  /** Peer has read the latest message (only meaningful when lastMessageFromMe). */
  lastMessageRead: v.boolean(),
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
      createdAt: now,
    });
    return { conversationId, username };
  },
});

/** Chat-list sidebar: newest-first conversations with peer identity + unread flag. */
export const listMyConversations = authedQuery({
  args: { expiresUnix: v.optional(v.number()) },
  returns: v.array(conversationRowReturn),
  handler: async (ctx, args) => {
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
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
    const conversations = [...asLow, ...asHigh]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, CONVERSATIONS_MAX);

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

    return visible.map((row, i) => {
      const { conversation } = row;
      const lastMessageFromMe = conversation.lastMessageSenderId === me;
      return {
        conversationId: conversation._id,
        peer: peers[i]!,
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageFromMe,
        lastMessageRead:
          lastMessageFromMe &&
          peerReadAt(conversation, me) >= conversation.lastMessageAt,
        unread: Boolean(
          conversation.lastMessageSenderId &&
            conversation.lastMessageSenderId !== me &&
            conversation.lastMessageAt > myReadAt(conversation, me),
        ),
      };
    });
  },
});

/** Messages for one conversation, oldest → newest (reactive). */
export const listMessages = authedQuery({
  args: {
    conversationId: v.id("dmConversations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("dmMessages"),
      body: v.string(),
      kind: v.union(
        v.literal("text"),
        v.literal("voice"),
        v.literal("image"),
      ),
      audioUrl: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      contentType: v.optional(v.string()),
      durationSec: v.optional(v.number()),
      fromMe: v.boolean(),
      /** WhatsApp-style: true when peer watermark is past this message (mine only). */
      read: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const peerWatermark = peerReadAt(conversation, ctx.user._id);
    const limit = Math.min(Math.max(args.limit ?? 120, 1), MESSAGES_PAGE_MAX);
    const rows = await ctx.db
      .query("dmMessages")
      .withIndex("by_conversation_and_created", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .take(limit);
    return await Promise.all(
      rows.reverse().map(async (row) => {
        const audioUrl = row.audioStorageId
          ? ((await ctx.storage.getUrl(row.audioStorageId)) ?? undefined)
          : undefined;
        const imageUrl = row.imageStorageId
          ? ((await ctx.storage.getUrl(row.imageStorageId)) ?? undefined)
          : undefined;
        const fromMe = row.senderId === ctx.user._id;
        return {
          _id: row._id,
          body: row.body,
          kind: row.kind ?? "text",
          audioUrl,
          imageUrl,
          contentType: row.contentType,
          durationSec: row.durationSec,
          fromMe,
          read: fromMe && peerWatermark >= row.createdAt,
          createdAt: row.createdAt,
        };
      }),
    );
  },
});

export const sendMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    body: v.string(),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");
    if (body.length > DM_BODY_MAX) {
      throw new Error(`Message must be at most ${DM_BODY_MAX} characters`);
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body,
      kind: "text",
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview:
        body.length > DM_PREVIEW_MAX ? `${body.slice(0, DM_PREVIEW_MAX)}…` : body,
      lastMessageSenderId: ctx.user._id,
      ...(isLow ? { lowLastReadAt: now } : { highLastReadAt: now }),
    });
    return messageId;
  },
});

/**
 * Short-lived Convex storage upload URL for a DM attachment
 * (voice note or image).
 */
export const prepareAttachmentUpload = authedMutation({
  args: { conversationId: v.id("dmConversations") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMemberConversation(ctx, args.conversationId, ctx.user._id);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Alias for voice-note clients — same upload URL as prepareAttachmentUpload. */
export const prepareVoiceUpload = authedMutation({
  args: { conversationId: v.id("dmConversations") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMemberConversation(ctx, args.conversationId, ctx.user._id);
    return await ctx.storage.generateUploadUrl();
  },
});

export const sendVoiceMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    storageId: v.id("_storage"),
    durationSec: v.number(),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    if (
      !Number.isFinite(args.durationSec) ||
      args.durationSec <= 0 ||
      args.durationSec > VOICE_NOTE_MAX_SECONDS
    ) {
      throw new Error("Voice notes must be between 1 second and 5 minutes");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body: "",
      kind: "voice",
      audioStorageId: args.storageId,
      durationSec: Math.round(args.durationSec * 10) / 10,
      createdAt: now,
    });
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      lastMessagePreview: VOICE_PREVIEW,
      lastMessageSenderId: ctx.user._id,
      ...(isLow ? { lowLastReadAt: now } : { highLastReadAt: now }),
    });
    return messageId;
  },
});

export const sendImageMessage = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  },
  returns: v.id("dmMessages"),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new Error("Image upload not found");
    const contentType = (meta.contentType || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
    }
    if (meta.size > IMAGE_MAX_BYTES) {
      throw new Error("Images must be 10 MB or smaller");
    }
    const caption = (args.caption ?? "").trim();
    if (caption.length > DM_BODY_MAX) {
      throw new Error(`Caption must be at most ${DM_BODY_MAX} characters`);
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      conversationId: conversation._id,
      senderId: ctx.user._id,
      body: caption,
      kind: "image",
      imageStorageId: args.storageId,
      contentType,
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
      ...(isLow ? { lowLastReadAt: now } : { highLastReadAt: now }),
    });
    return messageId;
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
    const isLow = conversation.userLowId === ctx.user._id;
    await ctx.db.patch(conversation._id, {
      ...(isLow
        ? { lowLastReadAt: Date.now() }
        : { highLastReadAt: Date.now() }),
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
