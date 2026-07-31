/**
 * Intent → paint marks for Studio surfaces (Dallas perf HUD + DevTools).
 */

const INTENT_PREFIX = "studio-intent:";
const PAINT_PREFIX = "studio-paint:";

export type StudioPaintSurface =
  | "messages"
  | "feed"
  | "network"
  | "history"
  | "files"
  | "thread"
  | "composer"
  | "profile"
  | string;

export function markStudioIntent(surface: StudioPaintSurface) {
  if (typeof performance === "undefined") return;
  const name = `${INTENT_PREFIX}${surface}`;
  try {
    performance.clearMarks(name);
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function markStudioPaint(surface: StudioPaintSurface) {
  if (typeof performance === "undefined") return;
  const intent = `${INTENT_PREFIX}${surface}`;
  const paint = `${PAINT_PREFIX}${surface}`;
  try {
    performance.clearMarks(paint);
    performance.mark(paint);
    performance.clearMeasures(`studio:${surface}`);
    performance.measure(`studio:${surface}`, intent, paint);
  } catch {
    /* missing intent mark or unsupported */
  }
}

export function readStudioPaintMs(surface: StudioPaintSurface): number | null {
  if (typeof performance === "undefined") return null;
  try {
    const entries = performance.getEntriesByName(`studio:${surface}`, "measure");
    const last = entries[entries.length - 1];
    return last ? Math.round(last.duration) : null;
  } catch {
    return null;
  }
}

export function listRecentStudioPaints(limit = 8): Array<{ surface: string; ms: number }> {
  if (typeof performance === "undefined") return [];
  try {
    return performance
      .getEntriesByType("measure")
      .filter((entry) => entry.name.startsWith("studio:"))
      .slice(-limit)
      .reverse()
      .map((entry) => ({
        surface: entry.name.slice("studio:".length),
        ms: Math.round(entry.duration),
      }));
  } catch {
    return [];
  }
}

/** Map a Studio tab key to a paint surface name. */
export function surfaceFromTabKey(key: string | null | undefined): StudioPaintSurface | null {
  if (!key || typeof key !== "string") return null;
  if (key.startsWith("messages:")) return "messages";
  if (key.startsWith("files:")) return "files";
  if (key.startsWith("feed:")) return "feed";
  if (key.startsWith("network:") || key.startsWith("offers:")) return "network";
  if (key.startsWith("thread:")) return "thread";
  if (key.startsWith("composer:")) return "composer";
  if (key.startsWith("profile:") || key.startsWith("profilePost:")) return "profile";
  return null;
}
