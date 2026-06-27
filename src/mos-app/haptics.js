/** Haptic feedback — native Vibrator on Android, navigator.vibrate fallback. */
const KEY = "mercuryos-haptics-v1";

function enabled() {
  return localStorage.getItem(KEY) !== "off";
}

function plugin() {
  return window.Capacitor?.Plugins?.MercuryHaptics ?? null;
}

function runNative(pattern) {
  const p = plugin();
  if (!p?.vibrate) return false;
  const arr = Array.isArray(pattern) ? pattern : [pattern];
  p.vibrate({ pattern: arr }).catch(() => {});
  return true;
}

function runWeb(pattern) {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function vibrate(pattern) {
  if (!enabled()) return;
  if (runNative(pattern)) return;
  runWeb(pattern);
}

export const haptic = {
  light: () => vibrate(15),
  tap: () => vibrate(25),
  selection: () => vibrate(20),
  medium: () => vibrate(45),
  heavy: () => vibrate(70),
  send: () => vibrate([25, 40, 55]),
  success: () => vibrate([30, 50, 35, 50, 45]),
  error: () => vibrate([80, 50, 80, 50, 100]),
  lock: () => vibrate([40, 30, 60, 30, 70]),
  notify: () => vibrate([120, 60, 120, 60, 180]),
  unlock: () => vibrate([30, 35, 45, 35, 60]),
};

export function setHaptics(on) {
  localStorage.setItem(KEY, on ? "on" : "off");
}
