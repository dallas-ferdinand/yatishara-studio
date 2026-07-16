"use client";

import { useEffect, useRef, useState } from "react";
import {
  capacitorPlugin,
  navigateToStudioPath,
  stopGenerationNotification,
  triggerHaptic,
} from "@/studio/lib/capacitorBridge";

type ToastState = {
  message: string;
  tone: "info" | "success" | "error";
} | null;

const ACTIONABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "select",
  "input[type='button']",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='range']",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[data-haptic]",
].join(",");

function notificationUrl(event: Record<string, unknown>) {
  const notification = event.notification as Record<string, unknown> | undefined;
  const data = notification?.data as Record<string, unknown> | undefined;
  const extra = notification?.extra as Record<string, unknown> | undefined;
  return String(data?.url ?? extra?.url ?? "");
}

/**
 * Native/web mobile behavior that is intentionally independent of auth:
 * deep-link routing, connectivity UI, meaningful-action haptics and a
 * long-press bridge for every existing right-click/context-menu handler.
 */
export function MobileExperienceRuntime() {
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const removers: Array<() => void | Promise<void>> = [];

    const app = capacitorPlugin("App");
    if (app?.addListener) {
      void app.addListener("appUrlOpen", (event) => {
        navigateToStudioPath(String(event.url ?? ""));
      }).then((handle) => removers.push(() => handle.remove()));
      void app.getLaunchUrl?.().then((result) => {
        const launch = result as { url?: string } | undefined;
        navigateToStudioPath(launch?.url);
      }).catch(() => {});
    }

    const push = capacitorPlugin("PushNotifications");
    if (push?.addListener) {
      void push.addListener("pushNotificationReceived", (event) => {
        const data = event.data as Record<string, unknown> | undefined;
        const jobId = String(data?.generationJobId ?? "");
        if (jobId) void stopGenerationNotification(jobId);
      }).then((handle) => removers.push(() => handle.remove()));
      void push.addListener("pushNotificationActionPerformed", (event) => {
        const notification = event.notification as Record<string, unknown> | undefined;
        const data = notification?.data as Record<string, unknown> | undefined;
        const jobId = String(data?.generationJobId ?? "");
        if (jobId) void stopGenerationNotification(jobId);
        navigateToStudioPath(notificationUrl(event));
      }).then((handle) => removers.push(() => handle.remove()));
    }

    const local = capacitorPlugin("LocalNotifications");
    if (local?.addListener) {
      void local.addListener("localNotificationActionPerformed", (event) => {
        navigateToStudioPath(notificationUrl(event));
      }).then((handle) => removers.push(() => handle.remove()));
    }

    const network = capacitorPlugin("Network");
    const updateNetwork = (status: Record<string, unknown>) => {
      setOffline(status.connected === false);
    };
    if (network) {
      void network.getStatus?.().then((status) => {
        updateNetwork((status ?? {}) as Record<string, unknown>);
      }).catch(() => {});
      if (network.addListener) {
        void network.addListener("networkStatusChange", updateNetwork)
          .then((handle) => removers.push(() => handle.remove()));
      }
    } else {
      const updateBrowserNetwork = () => setOffline(!navigator.onLine);
      updateBrowserNetwork();
      window.addEventListener("online", updateBrowserNetwork);
      window.addEventListener("offline", updateBrowserNetwork);
      removers.push(() => {
        window.removeEventListener("online", updateBrowserNetwork);
        window.removeEventListener("offline", updateBrowserNetwork);
      });
    }

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastState>).detail;
      if (!detail?.message) return;
      setToast(detail);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener("studio:native-toast", onToast);
    removers.push(() => window.removeEventListener("studio:native-toast", onToast));

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTarget: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let longPressFired = false;
    let suppressClickUntil = 0;

    const clearLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressTarget = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || event.button !== 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        !target ||
        target.closest("[data-long-press-managed='true']") ||
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      longPressFired = false;
      longPressTarget = target;
      startX = event.clientX;
      startY = event.clientY;
      longPressTimer = setTimeout(() => {
        const currentTarget = longPressTarget;
        longPressTimer = null;
        if (!currentTarget?.isConnected) return;
        const handled = !currentTarget.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
            button: 2,
            buttons: 0,
          }),
        );
        if (handled) {
          longPressFired = true;
          suppressClickUntil = Date.now() + 700;
          void triggerHaptic("heavy");
        }
      }, 520);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (
        longPressTimer &&
        (Math.abs(event.clientX - startX) > 12 ||
          Math.abs(event.clientY - startY) > 12)
      ) {
        clearLongPress();
      }
    };
    const onPointerEnd = () => clearLongPress();
    const onClickCapture = (event: MouseEvent) => {
      if (longPressFired && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        longPressFired = false;
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented && event.sourceCapabilities?.firesTouchEvents) {
        clearLongPress();
        suppressClickUntil = Date.now() + 700;
        void triggerHaptic("heavy");
      }
    };
    const onActionPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || longPressFired) return;
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(ACTIONABLE_SELECTOR)
        : null;
      if (
        !target ||
        target.matches(":disabled") ||
        target.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      void triggerHaptic(target.matches("[role='menuitem'], [role='tab']")
        ? "selection"
        : "light");
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    document.addEventListener("pointerup", onActionPointerUp, false);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    removers.push(() => {
      clearLongPress();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      document.removeEventListener("pointerup", onActionPointerUp, false);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
    });

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      for (const remove of removers) void remove();
    };
  }, []);

  return (
    <>
      {offline ? (
        <div className="studio-connectivity-banner" role="status" aria-live="polite">
          You’re offline. Studio will reconnect automatically.
        </div>
      ) : null}
      {toast ? (
        <div
          className={`studio-native-toast is-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
