"use node";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

let firebaseMessaging: Messaging | null | undefined;

function getFirebaseMessaging(): Messaging | null {
  if (firebaseMessaging !== undefined) return firebaseMessaging;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.warn("FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    firebaseMessaging = null;
    return null;
  }
  try {
    const json = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const serviceAccount = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error("service account JSON is missing required fields");
    }
    const app = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
      projectId: serviceAccount.project_id,
    });
    firebaseMessaging = getMessaging(app);
    return firebaseMessaging;
  } catch (error) {
    console.warn("FCM disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    firebaseMessaging = null;
    return null;
  }
}

function channelFor(kind: string) {
  if (kind === "payment_status") return "studio_billing";
  if (kind.startsWith("generation_")) return "studio_generation";
  return "studio_default";
}

export const sendPushForNotification = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.notifications.getPushDelivery, {
      notificationId: args.notificationId,
    });
    let sent = 0;

    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:support@yatishara.com";
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const payload = JSON.stringify({
        title: delivery.notification.title,
        body: delivery.notification.body,
        data: {
          notificationId: args.notificationId,
          kind: delivery.notification.kind,
          url: delivery.targetPath,
        },
      });
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
    } else if (delivery.subscriptions.length > 0) {
      console.warn("Web push VAPID env not configured");
    }

    const messaging = getFirebaseMessaging();
    if (messaging && delivery.fcmTokens.length > 0) {
      const invalidTokens: string[] = [];
      for (let offset = 0; offset < delivery.fcmTokens.length; offset += 500) {
        const tokens = delivery.fcmTokens.slice(offset, offset + 500);
        const result = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: delivery.notification.title,
            body: delivery.notification.body,
          },
          data: {
            notificationId: String(args.notificationId),
            kind: delivery.notification.kind,
            url: delivery.targetPath,
            generationJobId: delivery.notification.generationJobId
              ? String(delivery.notification.generationJobId)
              : "",
          },
          android: {
            priority: "high",
            notification: {
              channelId: channelFor(delivery.notification.kind),
              notificationCount: Math.max(1, delivery.unreadCount),
              defaultSound: true,
              defaultVibrateTimings: true,
              icon: "ic_stat_studio",
              color: "#FFFFFF",
              tag: delivery.notification.generationJobId
                ? `generation-${delivery.notification.generationJobId}`
                : `notification-${delivery.notification._id}`,
            },
          },
        });
        sent += result.successCount;
        result.responses.forEach((response, index) => {
          if (response.success) return;
          const code = response.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(tokens[index]);
          } else {
            console.warn("FCM send failed", {
              code,
              error: response.error?.message ?? "Unknown error",
            });
          }
        });
      }
      if (invalidTokens.length > 0) {
        await ctx.runMutation(internal.notifications.removeInvalidFcmTokens, {
          tokens: invalidTokens,
        });
      }
    }

    return sent;
  },
});
