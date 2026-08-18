/**
 * Studio alert prefs — browser push category filters (local + SW cache).
 */

export const STUDIO_ALERT_PREFS_KEY = "yatishara.studio.alertPrefs.v1";
export const STUDIO_ALERT_PREFS_CACHE = "studio-alert-prefs-v1";
export const STUDIO_ALERT_PREFS_URL = "/__studio-alert-prefs";

export type StudioAlertPrefs = {
  generations: boolean;
  messages: boolean;
  follows: boolean;
  payments: boolean;
};

export const DEFAULT_STUDIO_ALERT_PREFS: StudioAlertPrefs = {
  generations: true,
  messages: true,
  follows: true,
  payments: true,
};

const KIND_TO_PREF: Record<string, keyof StudioAlertPrefs> = {
  generation_completed: "generations",
  generation_failed: "generations",
  dm_message: "messages",
  followed_post: "follows",
  help_answer_posted: "follows",
  help_answer_unlocked: "payments",
  payment_status: "payments",
};

function normalize(raw: unknown): StudioAlertPrefs {
  const next = { ...DEFAULT_STUDIO_ALERT_PREFS };
  if (!raw || typeof raw !== "object") return next;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(next) as Array<keyof StudioAlertPrefs>) {
    if (typeof obj[key] === "boolean") next[key] = obj[key];
  }
  return next;
}

export function readStudioAlertPrefs(): StudioAlertPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_STUDIO_ALERT_PREFS };
  try {
    const raw = window.localStorage.getItem(STUDIO_ALERT_PREFS_KEY);
    if (!raw) return { ...DEFAULT_STUDIO_ALERT_PREFS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STUDIO_ALERT_PREFS };
  }
}

export async function writeStudioAlertPrefs(prefs: StudioAlertPrefs): Promise<void> {
  if (typeof window === "undefined") return;
  const next = normalize(prefs);
  window.localStorage.setItem(STUDIO_ALERT_PREFS_KEY, JSON.stringify(next));
  try {
    const cache = await caches.open(STUDIO_ALERT_PREFS_CACHE);
    await cache.put(
      STUDIO_ALERT_PREFS_URL,
      new Response(JSON.stringify(next), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* SW cache optional */
  }
}

export function studioAlertAllowsKind(
  kind: string | undefined,
  prefs: StudioAlertPrefs = readStudioAlertPrefs(),
): boolean {
  if (!kind) return true;
  const key = KIND_TO_PREF[kind];
  if (!key) return true;
  return Boolean(prefs[key]);
}
