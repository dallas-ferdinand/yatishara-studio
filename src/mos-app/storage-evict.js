/** Free browser localStorage for session tokens (chats live in IndexedDB + gateway). */

import { idbSet } from "./idb-kv.js";

const CHAT_KEY_PREFIXES = ["mercuryos-chats-v", "mercuryos-chats-v4"];

const BULK_KEYS = new Set([
  "mercuryos-request-trace",
  "mercuryos-chats-v3",
  "mercuryos-chats-v4",
]);

function isChatLocalKey(key) {
  if (!key) return false;
  if (BULK_KEYS.has(key)) return true;
  return CHAT_KEY_PREFIXES.some((p) => key === p || key.startsWith(`${p}-`));
}

/** Move legacy chat blobs off localStorage into IndexedDB, then delete. */
export async function migrateChatBlobsOffLocalStorage() {
  if (typeof localStorage === "undefined") return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isChatLocalKey(k)) keys.push(k);
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      await idbSet(key, raw);
    } catch {
      /* keep trying other keys */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Drop bulky keys so mos2-* session writes succeed. */
export function evictBulkLocalStorage() {
  if (typeof localStorage === "undefined") return;
  const remove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (isChatLocalKey(k)) remove.push(k);
    if (k === "mercuryos-request-trace") remove.push(k);
  }
  for (const k of remove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function isQuotaError(err) {
  if (!err) return false;
  const name = err.name ?? "";
  const msg = String(err.message ?? err);
  return name === "QuotaExceededError" || /quota/i.test(msg);
}

export function safeLocalSetItem(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
    return;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
  }
  evictBulkLocalStorage();
  localStorage.setItem(key, value);
}
