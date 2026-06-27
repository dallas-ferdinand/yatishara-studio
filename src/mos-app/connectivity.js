/** Gateway connectivity banner + polling. */
import * as api from "./api.js";
import { refreshStatusStrip } from "./status-strip.js";

let online = true;
let timer;
let bannerEl;
let textEl;
/** @type {((ok: boolean) => void) | null} */
let onStatusChange = null;

export function initConnectivity() {
  bannerEl = document.querySelector("#offline-banner");
  textEl = document.querySelector("#offline-banner-text");
  document.querySelector("#offline-retry")?.addEventListener("click", () => {
    setOfflineMessage("Reconnecting…");
    void retryNow();
  });
}

function pollIntervalMs() {
  return document.hidden ? 20000 : 8000;
}

function scheduleConnectivityCheck() {
  clearInterval(timer);
  timer = setInterval(() => check(), pollIntervalMs());
}

export function startConnectivityPoll(onChange) {
  onStatusChange = onChange ?? null;
  stopConnectivityPoll();
  check();
  scheduleConnectivityCheck();
  if (!startConnectivityPoll.wired) {
    startConnectivityPoll.wired = true;
    document.addEventListener("visibilitychange", scheduleConnectivityCheck);
  }
}

export function stopConnectivityPoll() {
  clearInterval(timer);
}

export async function retryNow() {
  if (!api.getSession()) {
    updateUi(false);
    return false;
  }
  const health = await api.ping();
  const ok = Boolean(health.ok);
  online = ok;
  updateUi(ok);
  onStatusChange?.(ok);
  return ok;
}

async function check() {
  if (!api.getSession()) return;
  const prev = online;
  const health = await api.ping();
  online = Boolean(health.ok);
  updateUi(online);
  if (prev !== online) onStatusChange?.(online);
}

function updateUi(ok) {
  updateBanner(ok);
  updateTabDot(ok);
  refreshStatusStrip();
}

function updateBanner(ok) {
  if (!bannerEl) return;
  bannerEl.classList.toggle("hidden", ok);
  if (textEl) {
    const url = api.getSession()?.gatewayUrl ?? "";
    textEl.textContent = ok
      ? ""
      : url.includes("yatishara.com") || url.startsWith("https://")
        ? "Gateway unreachable — check internet, then Settings → Retry"
        : "Computer unreachable — same WiFi? Start the gateway on your PC";
  }
}

function updateTabDot(ok) {
  document.querySelector("#tab-settings")?.classList.toggle("has-offline", !ok);
}

export function isOnline() {
  return online;
}

export function setOfflineMessage(msg) {
  if (textEl) textEl.textContent = msg;
  bannerEl?.classList.remove("hidden");
  if (msg === "Reconnecting…") {
    setTimeout(() => {
      if (textEl?.textContent === "Reconnecting…") void retryNow();
    }, 1500);
  }
}
