/**
 * Person-to-person direct messages (WhatsApp-style).
 * Exactly one conversation exists per user pair — enforced by the sorted-pair
 * index on dmConversations (userLowId < userHighId by id string).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { peerIdsInLabel } from "./dmLabels";
import {
  assertCanMessagePeer,
  sellerTagForUser,
} from "./dmPeerPanel";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { hydrateSocialPeople } from "./profiles";

const DM_BODY_MAX = 4000;
const DM_PREVIEW_MAX = 120;
const REPLY_BODY_MAX = 120;
const VOICE_NOTE_MAX_SECONDS = 300;
const VOICE_PREVIEW = "Voice message";
const IMAGE_PREVIEW = "Photo";
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const dmMessageKind = v.union(
  v.literal("text"),
  v.literal("voice"),
  v.literal("image"),
);

const replySnippet = v.object({
  _id: v.id("dmMessages"),
  body: v.string(),
  kind: dmMessageKind,
  fromMe: v.boolean(),
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

function replyPreviewBody(row: Doc<"dmMessages">): string {
  const kind = row.kind ?? "text";
  if (kind === "voice") return VOICE_PREVIEW;
  if (kind === "image") {
    const caption = row.body.trim();
    if (!caption) return IMAGE_PREVIEW;
    const clipped =
      caption.length > REPLY_BODY_MAX
        ? `${caption.slice(0, REPLY_BODY_MAX)}…`
        : caption;
    return `${IMAGE_PREVIEW} · ${clipped}`;
  }
  const body = row.body.trim();
  if (!body) return "";
  return body.length > REPLY_BODY_MAX
    ? `${body.slice(0, REPLY_BODY_MAX)}…`
    : body;
}
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
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
      kind: dmMessageKind,
      audioUrl: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      contentType: v.optional(v.string()),
      durationSec: v.optional(v.number()),
      fromMe: v.boolean(),
      /**
       * WhatsApp-style receipt for outbound messages:
       * sent (1 tick) → delivered (2 gray, peer ACK) → read (2 colored).
       */
      receipt: receiptStatus,
      replyTo: v.optional(replySnippet),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
    const peerReadWatermark = peerReadAt(conversation, ctx.user._id);
    const peerDeliveredWatermark = peerDeliveredAt(
      conversation,
      ctx.user._id,
    );
    const limit = Math.min(Math.max(args.limit ?? 120, 1), MESSAGES_PAGE_MAX);
    const rows = await ctx.db
      .query("dmMessages")
      .withIndex("by_conversation_and_created", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .take(limit);
    const chronological = rows.reverse();
    const replyIds = [
      ...new Set(
        chronological
          .map((row) => row.replyToMessageId)
          .filter((id): id is Id<"dmMessages"> => Boolean(id)),
      ),
    ];
    const replyDocs = await Promise.all(
      replyIds.map((id) => ctx.db.get(id)),
    );
    const replyById = new Map(
      replyDocs
        .filter((doc): doc is Doc<"dmMessages"> => doc !== null)
        .map((doc) => [doc._id, doc]),
    );
    return await Promise.all(
      chronological.map(async (row) => {
        const audioUrl = row.audioStorageId
          ? ((await ctx.storage.getUrl(row.audioStorageId)) ?? undefined)
          : undefined;
        const imageUrl = row.imageStorageId
          ? ((await ctx.storage.getUrl(row.imageStorageId)) ?? undefined)
          : undefined;
        const fromMe = row.senderId === ctx.user._id;
        const replyDoc = row.replyToMessageId
          ? replyById.get(row.replyToMessageId)
          : undefined;
        return {
          _id: row._id,
          body: row.body,
          kind: row.kind ?? "text",
          audioUrl,
          imageUrl,
          contentType: row.contentType,
          durationSec: row.durationSec,
          fromMe,
          receipt: fromMe
            ? receiptFor(
                row.createdAt,
                peerReadWatermark,
                peerDeliveredWatermark,
              )
            : "sent",
          replyTo: replyDoc
            ? {
                _id: replyDoc._id,
                body: replyPreviewBody(replyDoc),
                kind: replyDoc.kind ?? "text",
                fromMe: replyDoc.senderId === ctx.user._id,
              }
            : undefined,
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
      audioStorageId: args.storageId,
      durationSec: Math.round(args.durationSec * 10) / 10,
      ...(replyToMessageId ? { replyToMessageId } : {}),
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
      imageStorageId: args.storageId,
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
      ...(isLow ? { lowLastReadAt: now } : { highLastReadAt: now }),
    });
    return messageId;
  },
});

/**
 * Recipient device ACK — advances my delivery watermark so the sender sees
 * double gray ticks. Idempotent: only moves forward.
 */
export const ackDelivered = authedMutation({
  args: {
    conversationId: v.id("dmConversations"),
    upToCreatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await requireMemberConversation(
      ctx,
      args.conversationId,
      ctx.user._id,
    );
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
