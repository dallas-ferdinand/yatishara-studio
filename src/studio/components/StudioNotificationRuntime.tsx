"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  capacitorPlugin,
  emitStudioToast,
  isNativeAndroid,
  setNativeBadge,
  triggerHaptic,
} from "@/studio/lib/capacitorBridge";
import { registerDeskServiceWorker } from "@/desk/lib/register-sw.js";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function notificationId(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(index)) | 0;
  }
  return 20_000 + (Math.abs(hash) % 2_000_000_000);
}

async function ensureLocalNotificationPermission() {
  const local = capacitorPlugin("LocalNotifications");
  if (!local?.checkPermissions || !local.requestPermissions) return false;
  const current = await local.checkPermissions() as
    | { display?: "granted" | "denied" | "prompt" | "prompt-with-rationale" }
    | undefined;
  let display = current?.display;
  if (display !== "granted") {
    const requested = await local.requestPermissions() as
      | { display?: "granted" | "denied" }
      | undefined;
    display = requested?.display;
  }
  return display === "granted";
}

async function showLocalStudioNotification(options: {
  id: string;
  title: string;
  body: string;
  url: string;
}) {
  if (!isNativeAndroid()) return false;
  const local = capacitorPlugin("LocalNotifications");
  if (!local?.schedule) return false;
  const allowed = await ensureLocalNotificationPermission();
  if (!allowed) return false;
  await local.schedule({
    notifications: [
      {
        id: notificationId(options.id),
        title: options.title,
        body: options.body,
        channelId: options.title.toLowerCase().includes("fail")
          ? "studio_generation"
          : options.title.toLowerCase().includes("payment")
            ? "studio_billing"
            : "studio_default",
        autoCancel: true,
        smallIcon: "ic_stat_studio",
        extra: { url: options.url },
      },
    ],
  });
  return true;
}

/**
 * Browser: real Web Push via VAPID.
 * Capacitor APK (no FCM): when Studio is open, Convex realtime updates become
 * local OS notifications. Cold-start push while killed is not available without FCM.
 */
export function StudioNotificationRuntime() {
  const savePushSubscription = useMutation(api.notifications.savePushSubscription);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const notifications = useQuery(api.notifications.listMine);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const unreadCount = useMemo(
    () => notifications?.filter((notification) => !notification.readAt).length ?? 0,
    [notifications],
  );

  useEffect(() => {
    void setNativeBadge(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    const app = capacitorPlugin("App");
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    const clearWhenActive = () => {
      if (disposed || document.visibilityState !== "visible") return;
      void setNativeBadge(0);
      void markAllRead({}).catch(() => {});
    };
    const timer = window.setTimeout(clearWhenActive, 900);
    if (app?.addListener) {
      void app.addListener("appStateChange", (event) => {
        if (event.isActive === true) clearWhenActive();
      }).then((handle) => {
        remove = () => handle.remove();
      });
    }
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      void remove?.();
    };
  }, [markAllRead]);

  useEffect(() => {
    if (!notifications) return;
    const params = new URLSearchParams(window.location.search);
    const notificationIdParam = params.get("notification");
    if (!notificationIdParam) return;
    const notification = notifications.find((item) => item._id === notificationIdParam);
    if (!notification || notification.readAt) return;
    void markRead({ notificationId: notification._id as Id<"notifications"> }).then(() => {
      params.delete("notification");
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }).catch(() => {});
  }, [markRead, notifications]);

  // Native APK: surface new Convex notifications locally while the app is alive.
  useEffect(() => {
    if (!notifications || !isNativeAndroid()) return;
    const ids = new Set(notifications.map((item) => item._id));
    if (!seenIdsRef.current) {
      seenIdsRef.current = ids;
      return;
    }
    const fresh = notifications.filter((item) => !seenIdsRef.current?.has(item._id));
    seenIdsRef.current = ids;
    for (const item of fresh) {
      if (document.visibilityState === "visible") {
        emitStudioToast(
          item.body || item.title,
          item.kind === "generation_failed" ? "error" : "info",
        );
        void triggerHaptic(item.kind === "generation_failed" ? "error" : "warning");
        continue;
      }
      const params = new URLSearchParams({
        notification: String(item._id),
        ...(item.generationJobId ? { job: String(item.generationJobId) } : {}),
      });
      void showLocalStudioNotification({
        id: item._id,
        title: item.title,
        body: item.body,
        url: `/?${params.toString()}`,
      });
    }
  }, [notifications]);

  useEffect(() => {
    if (isNativeAndroid()) {
      // Request local-notification permission once; no FCM registration.
      void ensureLocalNotificationPermission().catch(() => {});
      return;
    }

    const registerBrowser = async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return;
      }
      const registration = await registerDeskServiceWorker();
      if (!registration) return;
      const vapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 240),
      });
    };

    const onFirstInteraction = () => {
      window.removeEventListener("pointerup", onFirstInteraction, true);
      window.removeEventListener("keydown", onFirstInteraction, true);
      void registerBrowser().catch((error) => {
        console.warn("Web Push registration failed", error);
      });
    };
    window.addEventListener("pointerup", onFirstInteraction, {
      capture: true,
      once: true,
    });
    window.addEventListener("keydown", onFirstInteraction, {
      capture: true,
      once: true,
    });
    void registerDeskServiceWorker();

    return () => {
      window.removeEventListener("pointerup", onFirstInteraction, true);
      window.removeEventListener("keydown", onFirstInteraction, true);
    };
  }, [savePushSubscription]);

  return null;
}
