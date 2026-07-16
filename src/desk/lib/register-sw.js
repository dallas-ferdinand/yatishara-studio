/** Register desk2 service worker + precache shell assets. */
export async function registerDeskServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("mercuryos-desk-") && !k.endsWith("-shell"))
          .map((k) => caches.delete(k)),
      );
    }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
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
    return reg;
  } catch (err) {
    console.warn("[desk2] SW register failed:", err?.message ?? err);
    return null;
  }
}
