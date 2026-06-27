/** Sync with gateway files.mjs uploadLimits — 0 = unlimited. */
import { getSession } from "@mos-app/api.js";

let maxUploadBytes = 0;
let limitsFetched = false;

function fetchSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  window.setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export function getMaxExplorerUploadBytes() {
  return maxUploadBytes;
}

export function maxExplorerUploadLabel() {
  if (!maxUploadBytes || maxUploadBytes <= 0) return "unlimited";
  if (maxUploadBytes >= 1024 * 1024 * 1024) {
    return `${(maxUploadBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(maxUploadBytes / (1024 * 1024))} MB`;
}

export function assertExplorerUploadSize(file) {
  const size = file?.size ?? 0;
  if (maxUploadBytes > 0 && size > maxUploadBytes) {
    throw new Error(`File too large (max ${maxExplorerUploadLabel()})`);
  }
}

/** Fetch server cap once per session (non-blocking for uploads if it fails). */
export async function syncExplorerUploadLimits() {
  if (limitsFetched) return maxUploadBytes;
  limitsFetched = true;
  try {
    const session = getSession();
    if (!session?.gatewayUrl) return maxUploadBytes;
    const headers = {};
    if (session.token && !session.cookieAuth) {
      headers.Authorization = `Bearer ${session.token}`;
    }
    const res = await fetch(`${session.gatewayUrl}/api/files/limits`, {
      credentials: session.cookieAuth ? "include" : "same-origin",
      headers,
      signal: fetchSignal(4000),
    });
    if (!res.ok) return maxUploadBytes;
    const data = await res.json();
    if (data.ok && Number.isFinite(data.maxUploadBytes)) {
      maxUploadBytes = Math.max(0, data.maxUploadBytes);
    }
  } catch {
    /* server is authoritative on reject */
  }
  return maxUploadBytes;
}
