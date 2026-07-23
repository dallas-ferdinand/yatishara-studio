/**
 * Cache policy: prefer fresh loads over sticky shells.
 * Preview always nukes SW + Cache Storage. Explicit reset query params also purge.
 */
export function getDeskBuildGuardInlineScript() {
  return `
(() => {
  try {
    const host = String(location.hostname || "");
    const params = new URLSearchParams(location.search);
    const isPreview =
      host.includes("preview.") ||
      host === "localhost" ||
      host === "127.0.0.1";
    const wantsReset =
      params.has("resetStudio") ||
      params.has("clearStudioCache") ||
      params.has("resetDesk") ||
      params.has("clearDeskCache");
    const dirty =
      wantsReset ||
      params.has("_ysFresh") ||
      params.has("_mosFresh");

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

    const clearStudioLocalState = () => {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (
            key.startsWith("yatishara-studio") ||
            key.startsWith("mercuryos-studio") ||
            key.startsWith("mercuryos-desk") ||
            key.startsWith("mos-desk") ||
            key.startsWith("react-resizable-panels:studio") ||
            key.includes("studio-main")
          ) {
            keys.push(key);
          }
        }
        keys.push(
          "yatishara-studio-open-tabs-v1",
          "yatishara-studio-main-panel-sizes",
          "yatishara-studio-custom-cursor",
          "yatishara-studio-build",
          "mercuryos-studio-composer-style-mode-v1",
          "mercuryos-studio-active-style-sheet-v1",
        );
        for (const key of new Set(keys)) {
          try { localStorage.removeItem(key); } catch {}
        }
        sessionStorage.removeItem("yatishara-studio-reloaded-build");
        sessionStorage.removeItem("mercuryos-desk-reloaded-build");
        sessionStorage.removeItem("mos-desk-purged-build");
      } catch {}
    };

    const purge = () => {
      if (wantsReset) clearStudioLocalState();
      try {
        localStorage.removeItem("yatishara-studio-build");
        localStorage.removeItem("mercuryos-desk-build");
        localStorage.removeItem("mos-desk-build-id");
        sessionStorage.removeItem("yatishara-studio-reloaded-build");
        sessionStorage.removeItem("mercuryos-desk-reloaded-build");
        sessionStorage.removeItem("mos-desk-purged-build");
      } catch {}
      const jobs = [];
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
            Promise.allSettled(keys.map((k) => caches.delete(k))),
          ),
        );
      }
      return Promise.allSettled(jobs);
    };

    // Preview / local: always drop SW + Cache Storage so hot updates are never sticky.
    if (isPreview) {
      void purge().finally(() => {
        if (dirty) cleanUrl();
      });
      return;
    }

    if (!dirty) return;
    if (!wantsReset) {
      cleanUrl();
      return;
    }

    void purge().finally(() => {
      cleanUrl();
      location.reload();
    });
  } catch {}
})();
`;
}
