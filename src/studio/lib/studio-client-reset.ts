/** Keys / prefixes that sticky Studio tabs, panels, and build stamps live under. */
const STUDIO_STORAGE_PREFIXES = [
  "yatishara-studio",
  "mercuryos-studio",
  "mercuryos-desk",
  "mos-desk",
  "react-resizable-panels:studio",
] as const;

const STUDIO_STORAGE_EXACT = [
  "yatishara-studio-open-tabs-v1",
  "yatishara-studio-main-panel-sizes",
  "yatishara-studio-custom-cursor",
  "yatishara-studio-build",
  "mercuryos-desk-build",
  "mos-desk-build-id",
  "mercuryos-studio-composer-style-mode-v1",
  "mercuryos-studio-active-style-sheet-v1",
] as const;

const STUDIO_SESSION_KEYS = [
  "yatishara-studio-reloaded-build",
  "mercuryos-desk-reloaded-build",
  "mos-desk-purged-build",
] as const;

function storageKeyMatches(key: string): boolean {
  if (STUDIO_STORAGE_EXACT.includes(key as (typeof STUDIO_STORAGE_EXACT)[number])) {
    return true;
  }
  if (key.includes("studio-main")) return true;
  return STUDIO_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Wipe sticky Studio shell state so a crashed boot can remount clean. */
export function clearStudioClientState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && storageKeyMatches(key)) keys.push(key);
    }
    for (const key of new Set([...keys, ...STUDIO_STORAGE_EXACT])) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    for (const key of STUDIO_SESSION_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Full recovery navigation: clear state, bust caches via build-guard params. */
export function resetStudioClient(reason = "manual"): void {
  clearStudioClientState();
  const url = new URL(window.location.origin);
  url.pathname = "/";
  url.searchParams.set("resetStudio", "1");
  url.searchParams.set("clearStudioCache", "1");
  url.searchParams.set("_ysFresh", `${Date.now()}`);
  url.searchParams.set("_ysReset", reason);
  window.location.replace(url.toString());
}

export function studioResetHref(): string {
  return `/?resetStudio=1&clearStudioCache=1&_ysFresh=1`;
}
