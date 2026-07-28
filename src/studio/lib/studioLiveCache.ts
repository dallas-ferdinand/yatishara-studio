/**
 * In-memory live-or-cached store for Studio surfaces.
 *
 * Heavy payloads (feed, folders, threads) must NOT sync-stringify into
 * sessionStorage on the Convex update / tab-switch path — that blocked mobile
 * taps. Memory Map is enough for same-session instant reopen; optional idle
 * persist is only for tiny keys when explicitly requested.
 */

type CacheEntry<T> = { at: number; value: T };

const mem = new Map<string, CacheEntry<unknown>>();
const pendingSessionWrites = new Map<string, unknown>();
let sessionFlushScheduled = false;

function scheduleSessionFlush() {
  if (sessionFlushScheduled || typeof window === "undefined") return;
  sessionFlushScheduled = true;
  const run = () => {
    sessionFlushScheduled = false;
    for (const [key, value] of pendingSessionWrites) {
      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({ at: Date.now(), value } satisfies CacheEntry<unknown>),
        );
      } catch {
        /* quota / private mode */
      }
    }
    pendingSessionWrites.clear();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 400);
  }
}

/** Feed/folder/thread blobs — never JSON.parse on the tap path. */
function isHeavyLiveKey(key: string) {
  return (
    key.startsWith("ys-feed-") ||
    key.startsWith("ys-folder-") ||
    key.startsWith("ys-thread-") ||
    key.startsWith("ys-history-") ||
    key.startsWith("ys-cn-listings-")
  );
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

/** Drop legacy heavy session blobs that used to sync-stringify on every update. */
function purgeHeavySessionKey(key: string) {
  if (typeof window === "undefined" || !isHeavyLiveKey(key)) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Remember live data in memory (sync, cheap).
 * `persist: true` queues an idle sessionStorage write — only for small snapshots.
 * Heavy keys ignore persist even if requested.
 */
export function rememberStudioLive<T>(
  key: string,
  value: T | undefined | null,
  opts?: { persist?: boolean },
) {
  if (!key || value == null) return;
  mem.set(key, { at: Date.now(), value });
  if (opts?.persist && !isHeavyLiveKey(key)) {
    pendingSessionWrites.set(key, value);
    scheduleSessionFlush();
  }
}

/** Sync memory read. Session hydrate only for small keys on cold mem miss. */
export function readStudioLive<T>(key: string): T | null {
  if (!key) return null;
  const hit = mem.get(key);
  if (hit) return hit.value as T;
  if (isHeavyLiveKey(key)) {
    purgeHeavySessionKey(key);
    return null;
  }
  const fromSession = readSession<T>(key);
  if (fromSession != null) {
    mem.set(key, { at: Date.now(), value: fromSession });
  }
  return fromSession;
}

/** Prefer live Convex data; fall back to cache while undefined. */
export function studioLiveOrCached<T>(
  live: T | undefined,
  cached: T | null,
): { data: T | null; pending: boolean } {
  if (live !== undefined) return { data: live, pending: false };
  if (cached != null) return { data: cached, pending: true };
  return { data: null, pending: true };
}

export function folderAssetsCacheKey(folderId: string) {
  return `ys-folder-assets-v1:${folderId}`;
}

export function folderChildrenCacheKey(folderId: string) {
  return `ys-folder-children-v1:${folderId}`;
}

export function folderDocumentsCacheKey(folderId: string) {
  return `ys-folder-docs-v1:${folderId}`;
}

export function threadEventsCacheKey(threadId: string) {
  return `ys-thread-events-v1:${threadId}`;
}

export function historyRangeCacheKey(range: string) {
  return `ys-history-range-v1:${range}`;
}

export function cnListingsCacheKey(audioType: string, search: string) {
  return `ys-cn-listings-v1:${audioType}:${search}`;
}

export function feedCacheKey(mode: string, seed?: string | null) {
  return `ys-feed-v1:${mode}:${seed ?? "home"}`;
}
