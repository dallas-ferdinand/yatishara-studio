/**
 * Hard signed-URL budgets per surface — keep Convex queries under the 1s limit
 * and avoid CDN signature stampedes. Thumbs/LQIP first; full playable is lazy.
 */

export const SIGNED_URL_BUDGET = {
  /** Folder grid / list thumbnails that may need a full-read fallback. */
  folderPreviewFallback: 24,
  /** Newest chat result video/audio that may lazy-sign for playback. */
  chatPlayable: 12,
  /** History thread card thumbs. */
  historyThumbs: 12,
} as const;

/** Keep first `budget` ids (caller should pass newest-first when order matters). */
export function takeSignedUrlBudget<T>(items: T[], budget: number): T[] {
  if (budget <= 0 || items.length === 0) return [];
  if (items.length <= budget) return items;
  return items.slice(0, budget);
}
