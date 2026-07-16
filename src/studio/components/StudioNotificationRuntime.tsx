"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import {
  capacitorPlugin,
  emitStudioToast,
  isNativeAndroid,
  setNativeBadge,
  triggerHaptic,
} from "@/studio/lib/capacitorBridge";
import { registerDeskServiceWorker } from "@/desk/lib/register-sw.js";

const PROMPTED_KEY = "yatishara-studio-push-prompt-v1";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function StudioNotificationRuntime() {
  const saveFcmToken = useMutation(api.notifications.saveFcmToken);
  const savePushSubscription = useMutation(api.notifications.savePushSubscription);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const notifications = useQuery(api.notifications.listMine);
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
    const notificationId = params.get("notification");
    if (!notificationId) return;
    const notification = notifications.find((item) => item._id === notificationId);
    if (!notification || notification.readAt) return;
    void markRead({ notificationId: notification._id }).then(() => {
      params.delete("notification");
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }).catch(() => {});
  }, [markRead, notifications]);

  useEffect(() => {
    let cancelled = false;
    const removers: Array<() => void | Promise<void>> = [];
    const push = capacitorPlugin("PushNotifications");

    if (isNativeAndroid() && push?.addListener) {
      void push.addListener("registration", (event) => {
        const token = String(event.value ?? "");
        if (!token || cancelled) return;
        void saveFcmToken({
          token,
          deviceName: navigator.userAgent.slice(0, 240),
        }).catch((error) => {
          console.warn("Could not save Android push token", error);
        });
      }).then((handle) => removers.push(() => handle.remove()));

      void push.addListener("registrationError", (event) => {
        console.warn("Android push registration failed", event);
      }).then((handle) => removers.push(() => handle.remove()));

      void push.addListener("pushNotificationReceived", (event) => {
        const notification = event as {
          title?: string;
          body?: string;
        };
        emitStudioToast(
          notification.body || notification.title || "New Studio update",
          "info",
        );
        void triggerHaptic("warning");
      }).then((handle) => removers.push(() => handle.remove()));
    }

    const registerNative = async () => {
      if (!push || localStorage.getItem(PROMPTED_KEY) === "denied") return;
      const current = await push.checkPermissions?.() as
        | { receive?: "prompt" | "prompt-with-rationale" | "granted" | "denied" }
        | undefined;
      let receive = current?.receive;
      if (receive !== "granted") {
        localStorage.setItem(PROMPTED_KEY, "asked");
        const requested = await push.requestPermissions?.() as
          | { receive?: "granted" | "denied" }
          | undefined;
        receive = requested?.receive;
      }
      if (receive === "granted") {
        await push.register?.();
      } else if (receive === "denied") {
        localStorage.setItem(PROMPTED_KEY, "denied");
      }
    };

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
      void (isNativeAndroid() ? registerNative() : registerBrowser()).catch((error) => {
        console.warn("Notification registration failed", error);
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

    // Register the SW immediately; the permission prompt still waits for a
    // user gesture. This also enables browser notification click routing.
    if (!isNativeAndroid()) void registerDeskServiceWorker();

    return () => {
      cancelled = true;
      window.removeEventListener("pointerup", onFirstInteraction, true);
      window.removeEventListener("keydown", onFirstInteraction, true);
      for (const remove of removers) void remove();
    };
  }, [saveFcmToken, savePushSubscription]);

  return null;
}
