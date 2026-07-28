/**
 * Generic live-or-cached session store for Studio surfaces.
 * Prefer live Convex data; paint last-known while undefined — never flash "Loading…".
 */

type CacheEntry<T> = { at: number; value: T };

const mem = new Map<string, CacheEntry<unknown>>();

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

export function rememberStudioLive<T>(key: string, value: T | undefined | null) {
  if (!key || value == null) return;
  mem.set(key, { at: Date.now(), value });
  writeSession(key, value);
}

export function readStudioLive<T>(key: string): T | null {
  if (!key) return null;
  const hit = mem.get(key);
  if (hit) return hit.value as T;
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
