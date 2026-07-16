/** Register push-only service worker. Disabled on preview/local so updates stay live. */
function isPreviewHost() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname || "";
  return host.includes("preview.") || host === "localhost" || host === "127.0.0.1";
}

export async function registerDeskServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    // Never keep a sticky SW on preview — it only fights hot reload.
    if (isPreviewHost()) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      return;
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith("mercuryos-desk-") ||
              k.startsWith("yatishara-studio-") ||
              k.startsWith("mos-desk"),
          )
          .map((k) => caches.delete(k)),
      );
    }
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    if (reg.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage({ type: "skip-waiting" });
    }
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "skip-waiting" });
        }
      });
    });
  } catch (err) {
    console.warn("[desk2] SW register failed:", err?.message ?? err);
  }
}
