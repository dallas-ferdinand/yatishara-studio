/** Desk2 web update — compare running desk build vs gateway /api/client/version. */
import * as api from "@mos-app/api.js";

const DISMISS_KEY = "desk2-update-dismiss";
const BUILD_KEY = "mos-desk-build-id";
const POLL_MS = 45_000;

let pollTimer = null;

function basePath() {
  if (typeof window === "undefined") return "/";
  return "/";
}

/** Build id of the JS bundle actually running (not server version.json). */
export function getRunningDeskBuildId() {
  try {
    const stored = localStorage.getItem(BUILD_KEY);
    if (stored) return String(stored).trim();
  } catch {
    /* ignore */
  }
  try {
    if (typeof __DESK_BUILD__ !== "undefined" && __DESK_BUILD__) {
      return String(__DESK_BUILD__).trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export async function fetchLocalDesk2Version() {
  try {
    const res = await fetch(`${basePath()}version.json`, { cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return { deskBuildId: "", versionName: "0.0.0" };
}

export async function checkDesk2Update() {
  if (!api.getSession()?.token) return null;
  const remote = await api.fetchClientVersion().catch(() => null);
  if (!remote?.deskBuildId) return null;
  const localId = getRunningDeskBuildId();
  const remoteId = String(remote.deskBuildId ?? "").trim();
  if (!remoteId || !localId || remoteId === localId) return null;
  return {
    deskBuildId: remoteId,
    versionName: remote.versionName ?? remote.version ?? remoteId.slice(0, 8),
    localBuildId: localId,
  };
}

export function dismissDesk2Update(deskBuildId) {
  try {
    sessionStorage.setItem(DISMISS_KEY, deskBuildId);
  } catch {
    /* ignore */
  }
}

export function isDesk2UpdateDismissed(deskBuildId) {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === deskBuildId;
  } catch {
    return false;
  }
}

export async function applyDesk2Update() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    try {
      sessionStorage.removeItem("mos-desk-purged-build");
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(BUILD_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** True when any chat tab is actively streaming — defer hard reload on deploy. */
export function deskHasLiveChat(state) {
  return state?.chats?.some((c) => c.status === "streaming" || c.status === "awaiting");
}

export function startDesk2UpdatePoll(onUpdate) {
  stopDesk2UpdatePoll();
  const tick = async () => {
    if (!api.getSession()?.token) return;
    try {
      const offer = await checkDesk2Update();
      if (offer && isDesk2UpdateDismissed(offer.deskBuildId)) {
        onUpdate?.(null);
        return;
      }
      onUpdate?.(offer);
    } catch {
      onUpdate?.(null);
    }
  };
  void tick();
  pollTimer = setInterval(tick, POLL_MS);
}

export function stopDesk2UpdatePoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
