"use node";

import { createSign } from "node:crypto";
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type FcmCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let fcmCredentials: FcmCredentials | null | undefined;
let fcmAccessToken: { value: string; expiresAt: number } | null = null;

function getFcmCredentials(): FcmCredentials | null {
  if (fcmCredentials !== undefined) return fcmCredentials;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.warn("FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    fcmCredentials = null;
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
    fcmCredentials = {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    };
    return fcmCredentials;
  } catch (error) {
    console.warn("FCM disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    fcmCredentials = null;
    return null;
  }
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getFcmAccessToken(credentials: FcmCredentials) {
  if (fcmAccessToken && fcmAccessToken.expiresAt > Date.now() + 60_000) {
    return fcmAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(credentials.privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description ?? `OAuth token request failed (${response.status})`);
  }
  fcmAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000,
  };
  return fcmAccessToken.value;
}

async function sendFcmMessage(options: {
  credentials: FcmCredentials;
  accessToken: string;
  token: string;
  title: string;
  body: string;
  kind: string;
  notificationId: string;
  targetPath: string;
  generationJobId?: string;
  unreadCount: number;
}) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(options.credentials.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: options.token,
          notification: {
            title: options.title,
            body: options.body,
          },
          data: {
            notificationId: options.notificationId,
            kind: options.kind,
            url: options.targetPath,
            generationJobId: options.generationJobId ?? "",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: channelFor(options.kind),
              notification_count: Math.max(1, options.unreadCount),
              default_sound: true,
              default_vibrate_timings: true,
              icon: "ic_stat_studio",
              color: "#FFFFFF",
              tag: options.generationJobId
                ? `generation-${options.generationJobId}`
                : `notification-${options.notificationId}`,
            },
          },
        },
      }),
    },
  );
  if (response.ok) return { sent: true, invalid: false };
  const error = await response.json().catch(() => ({})) as {
    error?: {
      status?: string;
      message?: string;
      details?: Array<{ errorCode?: string }>;
    };
  };
  const errorCode = error.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  const invalid =
    response.status === 404 ||
    error.error?.status === "NOT_FOUND" ||
    errorCode === "UNREGISTERED";
  return {
    sent: false,
    invalid,
    error: error.error?.message ?? `FCM request failed (${response.status})`,
  };
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

    const credentials = getFcmCredentials();
    if (credentials && delivery.fcmTokens.length > 0) {
      const invalidTokens: string[] = [];
      try {
        const accessToken = await getFcmAccessToken(credentials);
        for (let offset = 0; offset < delivery.fcmTokens.length; offset += 25) {
          const tokens = delivery.fcmTokens.slice(offset, offset + 25);
          const results = await Promise.all(tokens.map((token) =>
            sendFcmMessage({
              credentials,
              accessToken,
              token,
              title: delivery.notification.title,
              body: delivery.notification.body,
              kind: delivery.notification.kind,
              notificationId: String(args.notificationId),
              targetPath: delivery.targetPath,
              generationJobId: delivery.notification.generationJobId
                ? String(delivery.notification.generationJobId)
                : undefined,
              unreadCount: delivery.unreadCount,
            }),
          ));
          results.forEach((result, index) => {
            if (result.sent) sent += 1;
            else if (result.invalid) invalidTokens.push(tokens[index]);
            else console.warn("FCM send failed", { error: result.error });
          });
        }
      } catch (error) {
        console.warn("FCM delivery failed", {
          error: error instanceof Error ? error.message : "Unknown error",
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
