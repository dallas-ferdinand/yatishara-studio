/** Preference keys for “default tab when you open Studio”. */
export const STUDIO_DEFAULT_TAB_VALUES = [
  "agent",
  "composer",
  "feed",
  "network",
  "messages",
] as const;

export type StudioDefaultTab = (typeof STUDIO_DEFAULT_TAB_VALUES)[number];

export const STUDIO_DEFAULT_TAB_LABELS: Record<StudioDefaultTab, string> = {
  agent: "Agent",
  composer: "Create",
  feed: "Feed",
  network: "Creative Network",
  messages: "Messages",
};

export const STUDIO_DEFAULT_TAB_STORAGE_KEY = "yatishara-studio-default-tab-v1";

/** Set by signup intent “Sell services” — CN tab opens seller registration. */
export const STUDIO_START_SELLER_APPLY_KEY = "yatishara.studio.start-seller-apply.v1";

/** Maps preference → workspace tab key. */
export function studioTabKeyForDefault(pref: StudioDefaultTab | null | undefined): string {
  switch (pref) {
    case "feed":
      return "feed:forYou:home";
    case "network":
      return "network:home";
    case "messages":
      return "messages:main";
    case "composer":
      return "composer:main";
    case "agent":
    default:
      return "agent:main";
  }
}

export function parseStudioDefaultTab(value: unknown): StudioDefaultTab | null {
  if (typeof value !== "string") return null;
  return (STUDIO_DEFAULT_TAB_VALUES as readonly string[]).includes(value)
    ? (value as StudioDefaultTab)
    : null;
}

export function readStoredStudioDefaultTab(): StudioDefaultTab | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStudioDefaultTab(
      window.localStorage.getItem(STUDIO_DEFAULT_TAB_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function writeStoredStudioDefaultTab(tab: StudioDefaultTab) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDIO_DEFAULT_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}
