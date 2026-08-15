/** Element media is stored by asset id — folder moves must not drop the link. */

export function elementReferenceIds(entry: {
  referenceAssetIds?: string[];
  sourceAssetIds?: string[];
} | null | undefined): string[] {
  return entry?.referenceAssetIds ?? entry?.sourceAssetIds ?? [];
}

export function matchElementReferenceRow<T extends { _id?: string; studioId?: string }>(
  assetId: string,
  pool: T[] = [],
  nested: T[] = [],
): T | null {
  const fromPool = pool.find((item) => item?._id === assetId || item?.studioId === assetId);
  if (fromPool) return fromPool;
  return nested.find((item) => item?.studioId === assetId || item?._id === assetId) ?? null;
}

/** Empty editor lookup must not PATCH [] over still-valid ids. */
export function shouldSkipEmptyElementMediaPersist(
  nextIds: string[],
  knownIds: string[],
  userCleared: boolean,
): boolean {
  return !userCleared && nextIds.length === 0 && knownIds.length > 0;
}

export function prioritizeAssetIds(preferred: string[], rest: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...preferred, ...rest]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
