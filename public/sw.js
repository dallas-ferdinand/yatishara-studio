/* MercuryOS Desk — network-first; never throw from fetch handler (breaks page load). */
const CACHE_PREFIX = "mercuryos-desk-";

/** @type {string} */
let buildVersion = "dev";

async function loadBuildVersion() {
  if (buildVersion !== "dev") return buildVersion;
  try {
    const res = await fetch("./version.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      buildVersion = String(data.deskBuildId ?? data.build ?? "dev");
    }
  } catch {
    /* ignore */
  }
  return buildVersion;
}

function cacheName() {
  return `${CACHE_PREFIX}${buildVersion}`;
}

const SHELL_ASSETS = ["./", "./index.html", "./version.json", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      await loadBuildVersion();
      const cache = await caches.open(cacheName());
      try {
        await cache.addAll(SHELL_ASSETS);
      } catch {
        /* offline install — ok */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      await loadBuildVersion();
      const keep = cacheName();
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== keep).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isDeskAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/dash") &&
    !url.pathname.startsWith("/login") &&
    !url.pathname.startsWith("/reports") &&
    !url.pathname.startsWith("/legal") &&
    !url.pathname.startsWith("/hub") &&
    !url.pathname.startsWith("/install")
  );
}

function isApi(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/dash");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isDeskAsset(url) || isApi(url)) return;

  // Never cache JS/CSS chunks — build id changes every deploy; stale chunks = old bugs.
  if (url.pathname.includes("/_next/static/")) {
    e.respondWith(fetch(req));
    return;
  }

  e.respondWith(
    (async () => {
      try {
        const net = await fetch(req);
        if (net.ok && req.mode === "navigate") {
          const cache = await caches.open(cacheName());
          void cache.put(req, net.clone());
        }
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        return Response.error();
      }
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
      icon: "./icon-192.png",
      badge: "./icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientsList.find((client) => "focus" in client);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow("./");
    })(),
  );
});
