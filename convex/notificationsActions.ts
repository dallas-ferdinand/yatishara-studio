"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Browser / PWA Web Push only. The Capacitor APK intentionally does not use
 * FCM; while the app is open it surfaces Convex updates via local notifications.
 */
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
    const payload = JSON.stringify({
      title: delivery.notification.title,
      body: delivery.notification.body,
      data: {
        notificationId: args.notificationId,
        kind: delivery.notification.kind,
        url: delivery.targetPath,
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
        console.warn("Web push send failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return sent;
  },
});
