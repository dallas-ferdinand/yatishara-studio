/** Post/comment times: relative ago · short date (e.g. "12d ago · Jul 14"). */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatShortDate(ts: number, now: number): string {
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? null : { year: "numeric" }),
  });
}

function formatRelativeAgo(ts: number, now: number): string {
  const delta = Math.max(0, now - ts);
  if (delta < MINUTE_MS) return "just now";
  if (delta < HOUR_MS) {
    const mins = Math.floor(delta / MINUTE_MS);
    return `${mins}m ago`;
  }
  if (delta < DAY_MS) {
    const hours = Math.floor(delta / HOUR_MS);
    return `${hours}h ago`;
  }
  const days = Math.floor(delta / DAY_MS);
  return `${days}d ago`;
}

/**
 * @param ts — epoch ms
 * @param now — optional clock (tests)
 */
export function formatPostWhen(ts: number, now: number = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const ago = formatRelativeAgo(ts, now);
  const date = formatShortDate(ts, now);
  return `${ago} · ${date}`;
}
