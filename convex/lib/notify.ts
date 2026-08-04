import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getMarketplaceSellerForUser } from "./auth";
import {
  accountNameFromUser,
  resolvePublicDisplayName,
} from "./profileEnsure";

export type NotificationKind =
  | "generation_completed"
  | "generation_failed"
  | "payment_status"
  | "dm_message"
  | "followed_post";

/** Absolute Studio origin for OS notification icons (must be https). */
export const STUDIO_PUBLIC_ORIGIN =
  process.env.STUDIO_PUBLIC_ORIGIN ?? "https://studio.yatishara.com";

export const STUDIO_PUSH_ICON = `${STUDIO_PUBLIC_ORIGIN}/branding/yatishara-appicon-192.png`;
export const STUDIO_PUSH_BADGE = `${STUDIO_PUBLIC_ORIGIN}/branding/yatishara-appicon-maskable-192.png`;

const sendPushForNotificationRef = makeFunctionReference<
  "action",
  { notificationId: Id<"notifications"> },
  number
>("notificationsActions:sendPushForNotification") as unknown as FunctionReference<
  "action",
  "internal",
  { notificationId: Id<"notifications"> },
  number
>;

export async function createNotificationAndPush(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    kind: NotificationKind;
    title: string;
    body: string;
    generationJobId?: Id<"generationJobs">;
    paymentId?: Id<"payments">;
    conversationId?: Id<"dmConversations">;
    postId?: Id<"profilePosts">;
  },
): Promise<Id<"notifications">> {
  const notificationId = await ctx.db.insert("notifications", {
    userId: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
    generationJobId: args.generationJobId,
    paymentId: args.paymentId,
    conversationId: args.conversationId,
    postId: args.postId,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
    notificationId,
  });
  return notificationId;
}

/**
 * Human-friendly actor label for notifications: business name when opted in,
 * otherwise first+last, never a bare @username.
 */
export async function resolveActorDisplayName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<string> {
  const [user, profile, seller] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
    getMarketplaceSellerForUser(ctx, userId),
  ]);
  if (!profile) {
    return (
      accountNameFromUser(user) ||
      user?.name?.trim() ||
      "Someone"
    );
  }
  return resolvePublicDisplayName({
    username: profile.username,
    useSellerDisplayName: profile.useSellerDisplayName,
    user,
    seller,
  });
}

/** Deep-link path for SW / OS notification click. */
export function notificationDeepLink(args: {
  kind: NotificationKind;
  conversationId?: Id<"dmConversations">;
  postId?: Id<"profilePosts">;
  generationJobId?: Id<"generationJobs">;
}): string {
  if (args.kind === "dm_message" && args.conversationId) {
    return `/?open=messages&c=${args.conversationId}`;
  }
  if (args.kind === "followed_post" && args.postId) {
    return `/?open=post&p=${args.postId}`;
  }
  if (
    args.kind === "generation_completed" ||
    args.kind === "generation_failed"
  ) {
    return "/?open=activity";
  }
  if (args.kind === "payment_status") {
    return "/?open=settings&section=billing";
  }
  return "/?open=activity";
}

/** Coalesce OS notifications by conversation / post / job. */
export function notificationPushTag(args: {
  kind: NotificationKind;
  conversationId?: Id<"dmConversations">;
  postId?: Id<"profilePosts">;
  generationJobId?: Id<"generationJobs">;
  paymentId?: Id<"payments">;
  notificationId: Id<"notifications">;
}): string {
  if (args.kind === "dm_message" && args.conversationId) {
    return `dm:${args.conversationId}`;
  }
  if (args.kind === "followed_post" && args.postId) {
    return `post:${args.postId}`;
  }
  if (
    (args.kind === "generation_completed" ||
      args.kind === "generation_failed") &&
    args.generationJobId
  ) {
    return `gen:${args.generationJobId}`;
  }
  if (args.kind === "payment_status" && args.paymentId) {
    return `pay:${args.paymentId}`;
  }
  return `n:${args.notificationId}`;
}
