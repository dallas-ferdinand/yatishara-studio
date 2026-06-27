/** Per-user UI prefs (desk) — show tool calls, etc. */

let scopeUserId = null;

const KEY_PREFIX = "mercuryos-user-prefs";

function storageKey(userId = scopeUserId) {
  const id = userId || scopeUserId;
  return id ? `${KEY_PREFIX}-${id}` : KEY_PREFIX;
}

export function defaultUserPrefs(userId) {
  const id = String(userId ?? "").toLowerCase();
  return {
    showToolCalls: id !== "shara",
    speakReplies: false,
  };
}

function normalize(raw, userId) {
  const base = defaultUserPrefs(userId);
  const p = raw ?? {};
  return {
    showToolCalls: p.showToolCalls !== false && p.showToolCalls !== true ? base.showToolCalls : p.showToolCalls === true,
    speakReplies: p.speakReplies === true,
  };
}

export function setUserPrefsScope(userId) {
  scopeUserId = userId || null;
}

export function getUserPrefsScope() {
  return scopeUserId;
}

export function loadUserPrefs(userId = scopeUserId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null");
    return normalize(raw, userId);
  } catch {
    return normalize(null, userId);
  }
}

export function saveUserPrefs(prefs, userId = scopeUserId) {
  localStorage.setItem(storageKey(userId), JSON.stringify(normalize(prefs, userId)));
}

export function updateUserPrefs(partial, userId = scopeUserId) {
  const next = normalize({ ...loadUserPrefs(userId), ...partial }, userId);
  saveUserPrefs(next, userId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mercuryos-user-prefs", { detail: next }));
  }
  return next;
}

export function showToolCallsEnabled(userId = scopeUserId) {
  return loadUserPrefs(userId).showToolCalls;
}

export function speakRepliesEnabled(userId = scopeUserId) {
  return loadUserPrefs(userId).speakReplies === true;
}
