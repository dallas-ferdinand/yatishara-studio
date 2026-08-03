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
  const rawUrl =
    (e.notification.data && e.notification.data.url) || "/?open=activity";
  const targetUrl = (() => {
    try {
      return new URL(rawUrl, self.location.origin).href;
    } catch {
      return new URL("/?open=activity", self.location.origin).href;
    }
  })();

  e.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if (!("focus" in client)) continue;
        try {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          } else {
            client.postMessage({ type: "studio-open-url", url: targetUrl });
          }
          return;
        } catch {
          /* try next client */
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
