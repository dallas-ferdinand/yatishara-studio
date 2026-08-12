import {
  STUDIO_OPEN_TABS_BASE,
  STUDIO_COMPOSER_CONTEXTS_BASE,
  STUDIO_DEFAULT_TAB_BASE,
} from "@/studio/lib/studio-account-storage";

/** Keys / prefixes that sticky Studio tabs, panels, and build stamps live under. */
const STUDIO_STORAGE_PREFIXES = [
  "yatishara-studio",
  "mercuryos-studio",
  "mercuryos-desk",
  "mos-desk",
  "react-resizable-panels:studio",
] as const;

const STUDIO_STORAGE_EXACT = [
  STUDIO_OPEN_TABS_BASE,
  STUDIO_COMPOSER_CONTEXTS_BASE,
  STUDIO_DEFAULT_TAB_BASE,
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

/** Survives clearStudioClientState so the build-guard can finish a Reset. */
export const STUDIO_RESET_PENDING_KEY = "yatishara-studio-reset-pending";

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

/**
 * Full recovery navigation: clear sticky state, signal build-guard via
 * sessionStorage (no dirty query string left in the address bar).
 */
export function resetStudioClient(reason = "manual"): void {
  clearStudioClientState();
  try {
    sessionStorage.setItem(STUDIO_RESET_PENDING_KEY, reason);
  } catch {
    /* ignore */
  }
  window.location.replace(`${window.location.origin}/`);
}

/** Fallback href for Reset links (JS onClick runs the real reset). */
export function studioResetHref(): string {
  return "/";
}
