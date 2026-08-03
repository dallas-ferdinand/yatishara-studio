"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { notificationDeepLink } from "./lib/notify";

export const sendPushForNotification = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:support@yatishara.com";
    if (!publicKey || !privateKey) {
      console.warn("Web push VAPID env not configured");
      return 0;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const delivery = await ctx.runQuery(internal.notifications.getPushDelivery, {
      notificationId: args.notificationId,
    });
    const n = delivery.notification;
    const url = notificationDeepLink({
      kind: n.kind,
      conversationId: n.conversationId,
      postId: n.postId,
      generationJobId: n.generationJobId,
    });
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      data: {
        notificationId: args.notificationId,
        kind: n.kind,
        url,
        conversationId: n.conversationId,
        postId: n.postId,
        generationJobId: n.generationJobId,
        paymentId: n.paymentId,
      },
    });
    let sent = 0;
    for (const subscription of delivery.subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        const statusCode =
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.notifications.deletePushSubscriptionById, {
            subscriptionId: subscription._id,
          });
        }
        console.warn("Web push send failed", {
          statusCode,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return sent;
  },
});
