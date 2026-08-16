/**
 * Per-account localStorage keys for Studio shell state.
 * Unscoped keys bleed tabs / recents / folders across users on the same browser.
 */

export const STUDIO_OPEN_TABS_BASE = "yatishara-studio-open-tabs-v1";
export const STUDIO_COMPOSER_CONTEXTS_BASE = "yatishara-studio-composer-contexts-v1";
export const STUDIO_DEFAULT_TAB_BASE = "yatishara-studio-default-tab-v1";

export function studioAccountStorageKey(
  base: string,
  userId: string | null | undefined,
): string | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) return null;
  return `${base}:${id}`;
}

export function studioOpenTabsKey(userId: string | null | undefined): string | null {
  return studioAccountStorageKey(STUDIO_OPEN_TABS_BASE, userId);
}

export function studioComposerContextsKey(
  userId: string | null | undefined,
): string | null {
  return studioAccountStorageKey(STUDIO_COMPOSER_CONTEXTS_BASE, userId);
}

export function studioDefaultTabKey(userId: string | null | undefined): string | null {
  return studioAccountStorageKey(STUDIO_DEFAULT_TAB_BASE, userId);
}

/** Drop legacy unscoped keys that mixed accounts on one browser. */
export function purgeLegacyUnscopedStudioShellKeys(): void {
  if (typeof window === "undefined") return;
  const legacy = [
    STUDIO_OPEN_TABS_BASE,
    STUDIO_COMPOSER_CONTEXTS_BASE,
    // Do not delete STUDIO_DEFAULT_TAB_BASE — that unscoped key is still the
    // live default-tab preference (scoped studioDefaultTabKey is unused).
    "yatishara-studio-file-access",
    "yatishara-studio-folder-access",
    "mercuryos-explorer-pins",
  ];
  for (const key of legacy) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Remove every open-tabs blob (all accounts) — crash recovery / Reset Studio. */
export function purgeAllStudioOpenTabSessions(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key === STUDIO_OPEN_TABS_BASE || key.startsWith(`${STUDIO_OPEN_TABS_BASE}:`)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Crash recovery: strip document: tabs from the active user's session
 * (and legacy unscoped key if still present).
 */
export function stripDocumentTabsFromOpenSession(userId?: string | null): void {
  if (typeof window === "undefined") return;
  const keys = [
    studioOpenTabsKey(userId),
    STUDIO_OPEN_TABS_BASE,
  ].filter(Boolean) as string[];
  for (const storageKey of keys) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const openTabs = Array.isArray(parsed?.openTabs)
        ? parsed.openTabs.filter(
            (tab: unknown) =>
              typeof tab === "string" && !tab.startsWith("document:"),
          )
        : [];
      const activeTab =
        typeof parsed?.activeTab === "string" &&
        !String(parsed.activeTab).startsWith("document:")
          ? parsed.activeTab
          : openTabs[0] || "composer";
      const prevSnapshots =
        parsed?.snapshots && typeof parsed.snapshots === "object"
          ? parsed.snapshots
          : {};
      const snapshots: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(prevSnapshots)) {
        if (!key.startsWith("document:")) snapshots[key] = value;
      }
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...parsed,
          openTabs,
          activeTab,
          snapshots,
        }),
      );
    } catch {
      /* ignore */
    }
  }
}
