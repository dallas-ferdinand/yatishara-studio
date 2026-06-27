import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const notificationKind = v.union(
  v.literal("generation_completed"),
  v.literal("generation_failed"),
  v.literal("payment_status"),
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

export const getPushDelivery = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.object({
    notification: notificationReturn,
    subscriptions: v.array(
      v.object({
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
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", notification.userId))
      .collect();
    return {
      notification,
      subscriptions: subscriptions.map((subscription) => ({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      })),
    };
  },
});
