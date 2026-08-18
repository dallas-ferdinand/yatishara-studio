import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import {
  assetThumbnailPath,
  signBunnyCdnUrls,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  notificationPushTag,
  STUDIO_PUSH_BADGE,
  STUDIO_PUSH_ICON,
  type NotificationKind,
} from "./lib/notify";

const PUSH_AVATAR_TTL_SECONDS = 60 * 60;

const notificationKind = v.union(
  v.literal("generation_completed"),
  v.literal("generation_failed"),
  v.literal("payment_status"),
  v.literal("dm_message"),
  v.literal("followed_post"),
  v.literal("help_answer_posted"),
  v.literal("help_answer_unlocked"),
);

const notificationReturn = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  userId: v.id("users"),
  kind: notificationKind,
  title: v.string(),
  body: v.string(),
  readAt: v.optional(v.number()),
  generationJobId: v.optional(v.id("generationJobs")),
  paymentId: v.optional(v.id("payments")),
  conversationId: v.optional(v.id("dmConversations")),
  postId: v.optional(v.id("profilePosts")),
  createdAt: v.number(),
});

export const listMine = authedQuery({
  args: {},
  returns: v.array(notificationReturn),
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
  },
});

/** Lightweight live feed for in-app chimes (not full activity history). */
export const watchRecent = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      kind: notificationKind,
      conversationId: v.optional(v.id("dmConversations")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(24);
    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
    }));
  },
});

export const markRead = authedMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (!notification || notification.userId !== ctx.user._id) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(notification._id, { readAt: Date.now() });
    return null;
  },
});

export const savePushSubscription = authedMutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: ctx.user._id,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", {
      userId: ctx.user._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removePushSubscription = authedMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing && existing.userId === ctx.user._id) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

async function signAssetThumbUrl(
  asset: Doc<"assets"> | null,
  expiresUnix: number,
): Promise<string | undefined> {
  if (!asset || asset.deletedAt || !asset.bunnyPath) return undefined;
  const thumbPath = assetThumbnailPath(asset) ?? asset.bunnyPath;
  if (!thumbPath) return undefined;
  try {
    const signed = await signBunnyCdnUrls(
      [thumbPath],
      expiresUnix,
      THUMB_TRANSFORM,
    );
    return signed.get(thumbPath);
  } catch {
    return undefined;
  }
}

async function resolveActorAvatarUrl(
  ctx: QueryCtx,
  actorUserId: Id<"users">,
  expiresUnix: number,
): Promise<string | undefined> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", actorUserId))
    .unique();
  if (!profile?.avatarAssetId) return undefined;
  const avatar = await ctx.db.get("assets", profile.avatarAssetId);
  return signAssetThumbUrl(avatar, expiresUnix);
}

async function resolvePushChrome(
  ctx: QueryCtx,
  notification: Doc<"notifications">,
): Promise<{
  icon: string;
  brandIcon: string;
  badge: string;
  image?: string;
  tag: string;
}> {
  const expiresUnix = Math.floor(Date.now() / 1000) + PUSH_AVATAR_TTL_SECONDS;
  const kind = notification.kind as NotificationKind;
  const tag = notificationPushTag({
    kind,
    conversationId: notification.conversationId,
    postId: notification.postId,
    generationJobId: notification.generationJobId,
    paymentId: notification.paymentId,
    notificationId: notification._id,
  });

  let actorUserId: Id<"users"> | undefined;
  let image: string | undefined;

  if (kind === "dm_message" && notification.conversationId) {
    const conversation = await ctx.db.get(
      "dmConversations",
      notification.conversationId,
    );
    if (conversation) {
      actorUserId =
        conversation.userLowId === notification.userId
          ? conversation.userHighId
          : conversation.userLowId;
    }
  } else if (
    (kind === "followed_post" ||
      kind === "help_answer_posted" ||
      kind === "help_answer_unlocked") &&
    notification.postId
  ) {
    const post = await ctx.db.get("profilePosts", notification.postId);
    if (post) {
      actorUserId = post.ownerId;
      const asset = await ctx.db.get("assets", post.assetId);
      image = await signAssetThumbUrl(asset, expiresUnix);
    }
  }

  const avatarUrl = actorUserId
    ? await resolveActorAvatarUrl(ctx, actorUserId, expiresUnix)
    : undefined;

  // Prefer a face/photo when we have one; brand icon is the reliable fallback
  // (Chrome shows a blank tile if a signed CDN icon 404s).
  return {
    icon: avatarUrl ?? STUDIO_PUSH_ICON,
    brandIcon: STUDIO_PUSH_ICON,
    badge: STUDIO_PUSH_BADGE,
    image,
    tag,
  };
}

export const getPushDelivery = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.object({
    notification: notificationReturn,
    chrome: v.object({
      icon: v.string(),
      brandIcon: v.string(),
      badge: v.string(),
      image: v.optional(v.string()),
      tag: v.string(),
    }),
    subscriptions: v.array(
      v.object({
        _id: v.id("pushSubscriptions"),
        endpoint: v.string(),
        p256dh: v.string(),
        auth: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }
    const [subscriptions, chrome] = await Promise.all([
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", notification.userId))
        .collect(),
      resolvePushChrome(ctx, notification),
    ]);
    return {
      notification,
      chrome,
      subscriptions: subscriptions.map((subscription) => ({
        _id: subscription._id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      })),
    };
  },
});

export const deletePushSubscriptionById = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscriptionId);
    if (row) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

// --- Studio HTTP/MCP ForApi (Wave 4) ---
// Intended routes (mount via studioApiAccountExtra / later http.ts):
//   GET  /api/v1/notifications              -> listMineForApi   (scope: social)
//   POST /api/v1/notifications/:id/read    -> markReadForApi   (scope: social)

export const listMineForApi = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(notificationReturn),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const markReadForApi = internalMutation({
  args: {
    userId: v.id("users"),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (!notification || notification.userId !== args.userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(notification._id, { readAt: Date.now() });
    return null;
  },
});
