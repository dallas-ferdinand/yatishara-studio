/**
 * Tracks which still images the GPU compositor is believed to already hold.
 *
 * Stills are uploaded once and then addressed by texture key alone, so the
 * preview and the worker keep two views of the same cache. The worker's view is
 * the only authoritative one: it holds nothing for a key that arrived without
 * pixels, and it evicts under pressure. Whenever the two disagree the lane is
 * dropped silently, which reads as an image layer that never renders.
 *
 * Two rules keep them in step, and both live here:
 *  - a key becomes resident only after pixels were actually sent for it;
 *  - a key the worker reports it could not bind stops being resident.
 */
export class StillResidency {
  private readonly resident = new Set<string>();

  /**
   * Whether this paint must attach real pixels for the key.
   * `hasPixels` is false while the bitmap is still decoding — the caller may
   * send the bare key so the lane keeps its slot, but must not call
   * {@link markSent} for it.
   */
  needsPixels(textureKey: string, hasPixels: boolean): boolean {
    return hasPixels && !this.resident.has(textureKey);
  }

  /** Record keys this paint actually carried pixels for. */
  markSent(textureKeys: Iterable<string>): void {
    for (const key of textureKeys) this.resident.add(key);
  }

  /** Worker could not bind these keys — it evicted them or never had them. */
  forget(textureKeys: Iterable<string>): void {
    for (const key of textureKeys) this.resident.delete(key);
  }

  /** Preview quality or signed URLs changed — every upload is stale. */
  clear(): void {
    this.resident.clear();
  }
}
