/** Explicit cache reset only — never auto-reloads on build mismatch (that caused _ysFresh loops). */
export function getDeskBuildGuardInlineScript() {
  return `
(() => {
  try {
    const params = new URLSearchParams(location.search);
    const dirty =
      params.has("_ysFresh") ||
      params.has("_mosFresh") ||
      params.has("resetStudio") ||
      params.has("clearStudioCache") ||
      params.has("resetDesk") ||
      params.has("clearDeskCache");
    if (!dirty) return;

    const wantsReset =
      params.has("resetStudio") ||
      params.has("clearStudioCache") ||
      params.has("resetDesk") ||
      params.has("clearDeskCache");

    const cleanUrl = () => {
      const url = new URL(location.href);
      [
        "_ysFresh",
        "_mosFresh",
        "resetStudio",
        "clearStudioCache",
        "resetDesk",
        "clearDeskCache",
      ].forEach((key) => url.searchParams.delete(key));
      const next = url.pathname + url.search + url.hash;
      if (next !== location.pathname + location.search + location.hash) {
        history.replaceState(null, "", next);
      }
    };

    if (!wantsReset) {
      cleanUrl();
      return;
    }

    const jobs = [];
    try {
      localStorage.removeItem("yatishara-studio-build");
      localStorage.removeItem("mercuryos-desk-build");
      sessionStorage.removeItem("yatishara-studio-reloaded-build");
      sessionStorage.removeItem("mercuryos-desk-reloaded-build");
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
              .filter(
                (k) =>
                  k.startsWith("mercuryos-desk-") ||
                  k.startsWith("yatishara-studio-"),
              )
              .map((k) => caches.delete(k)),
          ),
        ),
      );
    }
    Promise.allSettled(jobs).finally(() => {
      cleanUrl();
      location.reload();
    });
  } catch {}
})();
`;
}
