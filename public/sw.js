/* Yatishara Studio service worker: push only, network-first. */
const LEGACY_CACHE_PREFIXES = ["mercuryos-desk-", "yatishara-studio-"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("push", (e) => {
  let payload = {
    title: "Yatishara Studio",
    body: "New Studio update.",
    data: {},
  };
  try {
    payload = { ...payload, ...(e.data?.json() ?? {}) };
  } catch {
    /* ignore malformed push payload */
  }
  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
      icon: "./branding/yatishara-appicon-192.png",
      badge: "./branding/yatishara-appicon-maskable-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const requestedUrl = e.notification.data?.url;
  const targetUrl = new URL(
    typeof requestedUrl === "string" ? requestedUrl : "/",
    self.location.origin,
  );
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = `${self.location.origin}/`;
  }
  e.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientsList.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing) await existing.navigate(targetUrl.href);
        await existing.focus();
        return;
      }
      await self.clients.openWindow(targetUrl.href);
    })(),
  );
});
