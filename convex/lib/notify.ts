import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type NotificationKind =
  | "generation_completed"
  | "generation_failed"
  | "payment_status"
  | "dm_message"
  | "followed_post";

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
