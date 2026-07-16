export function getDeskBuildGuardInlineScript() {
  return `
(() => {
  const BUILD_KEY = "yatishara-studio-build";
  const RELOAD_KEY = "yatishara-studio-reloaded-build";
  const LEGACY_BUILD_KEY = "mercuryos-desk-build";
  const LEGACY_RELOAD_KEY = "mercuryos-desk-reloaded-build";
  const CACHE_PREFIXES = ["mercuryos-desk-", "yatishara-studio-"];

  const clearClientCaches = () => {
    const jobs = [];
    try {
      localStorage.removeItem(BUILD_KEY);
      localStorage.removeItem(LEGACY_BUILD_KEY);
      sessionStorage.removeItem(RELOAD_KEY);
      sessionStorage.removeItem(LEGACY_RELOAD_KEY);
    } catch {}
    if ("serviceWorker" in navigator) {
      jobs.push(
        navigator.serviceWorker.getRegistrations?.().then((regs) =>
          Promise.allSettled(regs.map((r) => r.unregister?.())),
        ),
      );
    }
    if ("caches" in window) {
      jobs.push(
        caches.keys?.().then((keys) =>
          Promise.allSettled(
            keys
              .filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)) || k.includes("next") || k.includes("workbox"))
              .map((k) => caches.delete(k)),
          ),
        ),
      );
    }
    return Promise.allSettled(jobs);
  };

  const remember = (build, opts = {}) => {
    if (!build) return;
    const prev = localStorage.getItem(BUILD_KEY) || localStorage.getItem(LEGACY_BUILD_KEY);
    const allowReload = opts.reload !== false;
    if (allowReload && prev && prev !== build) {
      clearClientCaches().finally(() => {
        if (sessionStorage.getItem(RELOAD_KEY) !== build) {
          try { sessionStorage.setItem(RELOAD_KEY, build); } catch {}
          const url = new URL(location.href);
          url.searchParams.set("_ysFresh", build);
          location.replace(url.toString());
        }
      });
      return;
    }
    if (allowReload || !prev) {
      try { localStorage.setItem(BUILD_KEY, build); } catch {}
    }
  };

  try {
    const params = new URLSearchParams(location.search);
    if (
      params.has("resetStudio") ||
      params.has("clearStudioCache") ||
      params.has("resetDesk") ||
      params.has("clearDeskCache")
    ) {
      clearClientCaches().finally(() => {
        const url = new URL(location.href);
        url.searchParams.delete("resetStudio");
        url.searchParams.delete("clearStudioCache");
        url.searchParams.delete("resetDesk");
        url.searchParams.delete("clearDeskCache");
        url.searchParams.set("_ysFresh", Date.now().toString());
        location.replace(url.toString());
      });
      return;
    }

    const build =
      document.querySelector('meta[name="x-studio-build"]')?.content ||
      document.querySelector('meta[name="x-desk-build"]')?.content ||
      "";
    remember(build, { reload: true });
    fetch("/version.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => remember(String(data?.deskBuildId || data?.build || data?.studioBuildId || "")))
      .catch(() => {});
  } catch {}
})();
`;
}
