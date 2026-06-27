/** Notifications — background system alerts; in-app toasts when visible. */
import { sound } from "./sounds.js";
import { haptic } from "./haptics.js";
import { previewText } from "./markdown.js";

const KEY = "mercuryos-perms-asked-v1";
const TOAST_MS = 6000;
let toastTimer;
let toastWired = false;
let toastStartY = 0;

function notifyPlugin() {
  return window.Capacitor?.Plugins?.MercuryNotify ?? null;
}

export function needsPermissionPrompt() {
  if (localStorage.getItem(KEY) === "done") return false;
  if (!("Notification" in window)) return true;
  if (Notification.permission === "default") return true;
  return false;
}

export async function requestAllPermissions(onStatus) {
  onStatus?.("Allow notifications for replies when you're away…");
  if ("Notification" in window && Notification.permission !== "granted") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") await registerSw();
  localStorage.setItem(KEY, "done");
}

async function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "skip-waiting" });
    }
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "skip-waiting" });
        }
      });
    });
  } catch {
    /* ignore */
  }
}

/** PWA install prompt (Chrome / Edge). */
export function initPwaInstall() {
  if (!("serviceWorker" in navigator)) return;
  void registerSw();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__mercuryPwaInstall = e;
    document.dispatchEvent(new CustomEvent("mercury-pwa-installable"));
  });
}

export async function promptPwaInstall() {
  const ev = window.__mercuryPwaInstall;
  if (!ev) return { ok: false, reason: "not_available" };
  await ev.prompt();
  const choice = await ev.userChoice;
  window.__mercuryPwaInstall = null;
  return { ok: choice.outcome === "accepted", outcome: choice.outcome };
}

export async function initNotifications() {
  await registerSw();
  return true;
}

async function nativeShow({ title, body, tag = "mercuryos-reply", subtitle = "" }) {
  const p = notifyPlugin();
  if (!p?.show) return false;
  try {
    await p.show({ title, body, tag, subtitle });
    return true;
  } catch {
    return false;
  }
}

export function hideToast() {
  const el = document.querySelector("#toast");
  if (!el) return;
  clearTimeout(toastTimer);
  toastTimer = null;
  el.classList.add("hidden");
  el.classList.remove("is-dragging");
  el.style.transform = "";
}

export function showToast(title, body, meta = "") {
  const el = document.querySelector("#toast");
  const tEl = document.querySelector("#toast-title");
  const mEl = document.querySelector("#toast-meta");
  const bEl = document.querySelector("#toast-body");
  if (!el) return;
  if (tEl) tEl.textContent = title ?? "MercuryOS";
  if (mEl) mEl.textContent = meta ?? "";
  if (bEl) bEl.textContent = body ?? "";
  el.classList.remove("hidden", "is-dragging");
  el.style.transform = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

/** Close button, tap body, swipe up — wired once at boot. */
export function initToast() {
  if (toastWired) return;
  const el = document.querySelector("#toast");
  const closeBtn = document.querySelector("#toast-close");
  if (!el) return;
  toastWired = true;

  closeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    haptic.tap();
    hideToast();
  });

  el.addEventListener("click", (e) => {
    if (e.target.closest("#toast-close")) return;
    haptic.tap();
    hideToast();
  });

  el.addEventListener(
    "touchstart",
    (e) => {
      toastStartY = e.touches[0]?.clientY ?? 0;
      el.classList.add("is-dragging");
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      const y = e.touches[0]?.clientY ?? toastStartY;
      const dy = y - toastStartY;
      if (dy < 0) el.style.transform = `translateY(${dy}px)`;
    },
    { passive: true }
  );

  el.addEventListener(
    "touchend",
    (e) => {
      const y = e.changedTouches[0]?.clientY ?? toastStartY;
      const dy = y - toastStartY;
      el.classList.remove("is-dragging");
      el.style.transform = "";
      if (dy < -36) {
        haptic.tap();
        hideToast();
      }
    },
    { passive: true }
  );
}

export async function startAgentTask(title = "Agent working…") {
  const p = notifyPlugin();
  if (!p?.startTask) return;
  try {
    await p.startTask({ title });
  } catch {
    /* ignore */
  }
}

export async function stopAgentTask() {
  const p = notifyPlugin();
  if (!p?.stopTask) return;
  try {
    await p.stopTask();
  } catch {
    /* ignore */
  }
}

/** In-app toast when foreground; system notification only when backgrounded. */
export async function notifyReply({ chatTitle, preview, kind = "reply" }) {
  sound.notify();
  haptic.notify();

  const chat = chatTitle?.trim() || "MercuryOS";
  const snippet = previewText(preview, 240);
  const isError = kind === "error";
  const meta = isError ? "Something went wrong" : "Reply ready";
  const title = isError ? `${chat} · error` : chat;

  if (document.visibilityState === "visible") {
    showToast(title, snippet, meta);
    return;
  }

  await nativeShow({
    title: chat,
    body: snippet,
    subtitle: meta,
    tag: isError ? "mercuryos-error" : "mercuryos-reply",
  });
}

export async function notifyUpdateAvailable(update) {
  sound.notify();
  haptic.notify();
  const title = "Update ready";
  const body = `Version ${update.versionName} — open MercuryOS and tap Install`;
  const meta = "In-app update";
  if (document.visibilityState === "visible") {
    showToast(title, body, meta);
    return;
  }

  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    sw.postMessage({
      type: "notify-update",
      title,
      body,
      versionCode: update.versionCode,
    });
  }
  await nativeShow({ title, body, subtitle: meta, tag: "mercuryos-update" });
}

export function resetPermissionPrompt() {
  localStorage.removeItem(KEY);
}
