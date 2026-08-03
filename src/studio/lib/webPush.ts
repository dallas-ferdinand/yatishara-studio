/**
 * Browser Web Push subscribe / unsubscribe for Yatishara Studio.
 * Skips preview, localhost, and Capacitor native shells (same policy as SW register).
 */

const VAPID_PUBLIC =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? ""
    : "";

function isPreviewHost() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname || "";
  return host.includes("preview.") || host === "localhost" || host === "127.0.0.1";
}

function isNativeShell() {
  if (typeof window === "undefined") return false;
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  const ua = String(navigator.userAgent || "");
  return /\bwv\b/i.test(ua) && /Android/i.test(ua);
}

export function isStudioWebPushAvailable() {
  if (typeof window === "undefined") return false;
  if (isPreviewHost() || isNativeShell()) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  if (!VAPID_PUBLIC) return false;
  return true;
}

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function getPushRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

/**
 * @param {{
 *   save: (args: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => Promise<unknown>;
 * }} opts
 */
export async function enableStudioWebPush({ save }) {
  if (!isStudioWebPushAvailable()) {
    throw new Error("Browser notifications are not available here");
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }
  const registration = await getPushRegistration();
  if (!registration) {
    throw new Error("Could not register the service worker");
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription was incomplete");
  }
  await save({
    endpoint,
    p256dh,
    auth,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  });
  return { endpoint };
}

/**
 * @param {{
 *   remove: (args: { endpoint: string }) => Promise<unknown>;
 * }} opts
 */
export async function disableStudioWebPush({ remove }) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { disabled: true };
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    if (endpoint) {
      await remove({ endpoint });
    }
  }
  return { disabled: true };
}

/** True when a PushManager subscription already exists for this browser. */
export async function hasStudioWebPushSubscription() {
  if (!isStudioWebPushAvailable()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription?.endpoint);
  } catch {
    return false;
  }
}
