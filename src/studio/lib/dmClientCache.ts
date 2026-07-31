/**
 * Client-side DM cache so opening Messages / a chat paints last-known data
 * instantly while Convex catches up — never flash "Loading…".
 *
 * Scoped by authenticated userId. Cross-account session leftovers must not
 * drive mutations (ackDelivered / markRead) or paint the wrong inbox.
 */

type CacheEntry<T> = { at: number; value: T };

const OWNER_KEY = "ys-dm-cache-owner-v1";
const CONVERSATIONS_PREFIX = "ys-dm-conversations-v1:";
const MESSAGES_PREFIX = "ys-dm-messages-v1:";
const MESSAGE_SESSION_CAP = 60;
const MESSAGE_SESSION_KEYS = "ys-dm-messages-keys-v1";
const MESSAGE_SESSION_KEY_LIMIT = 12;

const messagesById = new Map<string, CacheEntry<unknown>>();
const conversationsMem = new Map<string, CacheEntry<unknown>>();
let boundOwnerId: string | null = null;

function conversationsKey(labelId?: string | null) {
  return `${CONVERSATIONS_PREFIX}${labelId ?? "all"}`;
}

function messagesKey(conversationId: string) {
  return `${MESSAGES_PREFIX}${conversationId}`;
}

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ at: Date.now(), value } satisfies CacheEntry<T>),
    );
  } catch {
    /* quota / private mode */
  }
}

function removeSession(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drop in-memory + session DM cache (call on account switch / sign-out). */
export function clearDmClientCache() {
  messagesById.clear();
  conversationsMem.clear();
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(MESSAGE_SESSION_KEYS);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    for (const id of ids) {
      removeSession(messagesKey(id));
    }
    removeSession(MESSAGE_SESSION_KEYS);
    for (const key of Object.keys(window.sessionStorage)) {
      if (
        key.startsWith(CONVERSATIONS_PREFIX) ||
        key.startsWith(MESSAGES_PREFIX)
      ) {
        removeSession(key);
      }
    }
    removeSession(OWNER_KEY);
  } catch {
    /* ignore */
  }
  boundOwnerId = null;
}

/**
 * Bind cache to the signed-in user. Clears when the owner changes or clears.
 * Returns false until a userId is known (do not ACK from cache meanwhile).
 */
export function bindDmCacheOwner(userId: string | null | undefined): boolean {
  if (!userId) {
    if (boundOwnerId != null) clearDmClientCache();
    return false;
  }
  if (typeof window !== "undefined") {
    try {
      const prev = window.sessionStorage.getItem(OWNER_KEY);
      if (prev && prev !== userId) {
        clearDmClientCache();
      }
      window.sessionStorage.setItem(OWNER_KEY, userId);
    } catch {
      /* ignore */
    }
  } else if (boundOwnerId && boundOwnerId !== userId) {
    clearDmClientCache();
  }
  boundOwnerId = userId;
  return true;
}

function touchMessageSessionKey(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(MESSAGE_SESSION_KEYS);
    const prev = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [
      conversationId,
      ...prev.filter((id) => id !== conversationId),
    ].slice(0, MESSAGE_SESSION_KEY_LIMIT);
    window.sessionStorage.setItem(MESSAGE_SESSION_KEYS, JSON.stringify(next));
    for (const id of prev) {
      if (!next.includes(id)) {
        window.sessionStorage.removeItem(messagesKey(id));
      }
    }
  } catch {
    /* ignore */
  }
}

export function rememberDmConversations<T>(
  value: T | undefined | null,
  labelId?: string | null,
) {
  if (value == null || !boundOwnerId) return;
  const key = conversationsKey(labelId);
  conversationsMem.set(key, { at: Date.now(), value });
  writeSession(key, value);
}

export function readDmConversations<T>(labelId?: string | null): T | null {
  if (!boundOwnerId) return null;
  const key = conversationsKey(labelId);
  const mem = conversationsMem.get(key);
  if (mem) return mem.value as T;
  if (typeof window !== "undefined") {
    try {
      const owner = window.sessionStorage.getItem(OWNER_KEY);
      if (owner && owner !== boundOwnerId) return null;
    } catch {
      /* ignore */
    }
  }
  const fromSession = readSession<T>(key);
  if (fromSession != null) {
    conversationsMem.set(key, { at: Date.now(), value: fromSession });
  }
  return fromSession;
}

export function rememberDmMessages<T>(
  conversationId: string,
  value: T | undefined | null,
) {
  if (!conversationId || value == null || !boundOwnerId) return;
  const capped = Array.isArray(value)
    ? (value.slice(-MESSAGE_SESSION_CAP) as T)
    : value;
  messagesById.set(conversationId, { at: Date.now(), value: capped });
  writeSession(messagesKey(conversationId), capped);
  touchMessageSessionKey(conversationId);
}

export function readDmMessages<T>(conversationId: string): T | null {
  if (!conversationId || !boundOwnerId) return null;
  const hit = messagesById.get(conversationId);
  if (hit) return hit.value as T;
  if (typeof window !== "undefined") {
    try {
      const owner = window.sessionStorage.getItem(OWNER_KEY);
      if (owner && owner !== boundOwnerId) return null;
    } catch {
      /* ignore */
    }
  }
  const fromSession = readSession<T>(messagesKey(conversationId));
  if (fromSession != null) {
    messagesById.set(conversationId, { at: Date.now(), value: fromSession });
  }
  return fromSession;
}

/** Prefer live Convex data; fall back to cache while undefined. */
export function dmLiveOrCached<T>(
  live: T | undefined,
  cached: T | null,
): { data: T | null; pending: boolean } {
  if (live !== undefined) return { data: live, pending: false };
  if (cached != null) return { data: cached, pending: true };
  return { data: null, pending: true };
}
