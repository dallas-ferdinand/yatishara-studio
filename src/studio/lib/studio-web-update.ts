/**
 * Studio live update — poll /version.json vs the build baked into this tab.
 * Apply keeps workspace tabs/local prefs; only drops SW + Cache Storage, then reloads.
 */

const DISMISS_KEY = "yatishara-studio-update-dismiss";
const BUILD_KEY = "yatishara-studio-build";
const POLL_MS = 30_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let onVisibility: (() => void) | null = null;

export type StudioUpdateOffer = {
  buildId: string;
  versionName: string;
  localBuildId: string;
};

/** Build id of the JS/HTML this tab is actually running. */
export function getRunningStudioBuildId(): string {
  try {
    const meta = document
      .querySelector('meta[name="x-studio-build"]')
      ?.getAttribute("content");
    if (meta?.trim()) return meta.trim();
  } catch {
    /* ignore */
  }
  const baked = String(process.env.NEXT_PUBLIC_DESK_BUILD ?? "").trim();
  if (baked) return baked;
  try {
    return String(localStorage.getItem(BUILD_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchStudioVersionJson(): Promise<{
  deskBuildId?: string;
  studioBuildId?: string;
  versionName?: string;
  build?: string;
}> {
  const res = await fetch("/version.json", { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

export async function checkStudioUpdate(): Promise<StudioUpdateOffer | null> {
  const localId = getRunningStudioBuildId();
  if (!localId || localId === "dev") return null;
  let remote: Awaited<ReturnType<typeof fetchStudioVersionJson>>;
  try {
    remote = await fetchStudioVersionJson();
  } catch {
    return null;
  }
  const remoteId = String(
    remote.studioBuildId || remote.deskBuildId || remote.build || "",
  ).trim();
  if (!remoteId || remoteId === localId) return null;
  return {
    buildId: remoteId,
    versionName: String(remote.versionName ?? remoteId.slice(0, 12)),
    localBuildId: localId,
  };
}

export function dismissStudioUpdate(buildId: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, buildId);
  } catch {
    /* ignore */
  }
}

export function isStudioUpdateDismissed(buildId: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === buildId;
  } catch {
    return false;
  }
}

/**
 * Soft apply: keep open tabs / prefs in localStorage. Purge SW + HTTP caches
 * so the next load gets new chunks, then reload the shell.
 */
export async function applyStudioUpdate(buildId?: string): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  try {
    if (buildId) localStorage.setItem(BUILD_KEY, buildId);
    sessionStorage.setItem("yatishara-studio-reloaded-build", buildId || "");
    sessionStorage.removeItem("yatishara-studio-chunk-reload");
  } catch {
    /* ignore */
  }
  // Full document reload is required for new Next chunks after deploy —
  // workspace tabs restore from persisted session (we do not clear them).
  window.location.reload();
}

export function startStudioUpdatePoll(
  onUpdate: (offer: StudioUpdateOffer | null) => void,
): void {
  stopStudioUpdatePoll();
  const tick = async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const offer = await checkStudioUpdate();
      if (offer && isStudioUpdateDismissed(offer.buildId)) {
        onUpdate(null);
        return;
      }
      onUpdate(offer);
    } catch {
      onUpdate(null);
    }
  };
  void tick();
  pollTimer = setInterval(() => void tick(), POLL_MS);
  if (typeof document !== "undefined") {
    onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
  }
}

export function stopStudioUpdatePoll(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (onVisibility && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibility);
    onVisibility = null;
  }
}
