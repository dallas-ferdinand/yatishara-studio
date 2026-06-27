export function getDeskBuildGuardInlineScript() {
  return `
(() => {
  const remember = (build, opts = {}) => {
    if (!build) return;
    const KEY = "mercuryos-desk-build";
    const RELOAD_KEY = "mercuryos-desk-reloaded-build";
    const prev = localStorage.getItem(KEY);
    const allowReload = opts.reload !== false;
    if (allowReload && build && prev && prev !== build && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.update?.()));
      if ("caches" in window) {
        caches.keys?.().then((keys) => keys.filter((k) => k.startsWith("mercuryos-desk-")).forEach((k) => caches.delete(k)));
      }
      if (sessionStorage.getItem(RELOAD_KEY) !== build) {
        sessionStorage.setItem(RELOAD_KEY, build);
        const url = new URL(location.href);
        url.searchParams.set("_mosFresh", build);
        location.replace(url.toString());
        return;
      }
    }
    if (allowReload || !prev) localStorage.setItem(KEY, build);
  };
  try {
    const params = new URLSearchParams(location.search);
    if (params.has("resetDesk") || params.has("clearDeskCache")) {
      const resetJobs = [];
      try {
        localStorage.removeItem("mercuryos-desk-build");
        localStorage.removeItem("mos2-token");
        localStorage.removeItem("mos2-user-id");
        localStorage.removeItem("mos2-user-name");
        sessionStorage.removeItem("mercuryos-desk-reloaded-build");
      } catch {}
      if ("serviceWorker" in navigator) {
        resetJobs.push(navigator.serviceWorker.getRegistrations?.().then((regs) => Promise.allSettled(regs.map((r) => r.unregister?.()))));
      }
      if ("caches" in window) {
        resetJobs.push(caches.keys?.().then((keys) => Promise.allSettled(keys.filter((k) => k.startsWith("mercuryos-desk-")).map((k) => caches.delete(k)))));
      }
      Promise.allSettled(resetJobs).finally(() => {
        const url = new URL(location.href);
        url.searchParams.delete("resetDesk");
        url.searchParams.delete("clearDeskCache");
        url.searchParams.set("_mosFresh", Date.now().toString());
        location.replace(url.toString());
      });
      return;
    }
    const build = document.querySelector('meta[name="x-desk-build"]')?.content || "";
    remember(build, { reload: false });
    fetch("/version.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => remember(String(data?.deskBuildId || data?.build || "")))
      .catch(() => {});
  } catch {}
})();
`;
}
