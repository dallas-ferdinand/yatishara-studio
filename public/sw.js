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
  const fallbackIcon = new URL(
    "./branding/yatishara-appicon-192.png",
    self.location.origin,
  ).href;
  const fallbackBadge = new URL(
    "./branding/yatishara-appicon-maskable-192.png",
    self.location.origin,
  ).href;
  let payload = {
    title: "Yatishara Studio",
    body: "New Studio update.",
    data: {},
    icon: fallbackIcon,
    badge: fallbackBadge,
  };
  try {
    payload = { ...payload, ...(e.data?.json() ?? {}) };
  } catch {
    /* ignore malformed push payload */
  }

  e.waitUntil(
    (async () => {
      const kind =
        (payload.data && payload.data.kind) ||
        (typeof payload.tag === "string" ? payload.tag.split(":")[0] : "");
      try {
        const cache = await caches.open("studio-alert-prefs-v1");
        const cached = await cache.match("/__studio-alert-prefs");
        if (cached) {
          const prefs = await cached.json();
          const map = {
            generation_completed: "generations",
            generation_failed: "generations",
            dm_message: "messages",
            followed_post: "follows",
            payment_status: "payments",
          };
          const key = map[kind];
          if (key && prefs && prefs[key] === false) return;
        }
      } catch {
        /* show notification if prefs unreadable */
      }

      const options = {
        body: payload.body,
        data: payload.data,
        icon: payload.icon || fallbackIcon,
        badge: payload.badge || fallbackBadge,
        tag: payload.tag || undefined,
        renotify: Boolean(payload.tag || payload.renotify),
      };
      if (payload.image) {
        options.image = payload.image;
      }
      await self.registration.showNotification(payload.title, options);
    })(),
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
