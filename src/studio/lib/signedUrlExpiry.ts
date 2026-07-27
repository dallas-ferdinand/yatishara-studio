"use client";

import { useState } from "react";

/** Sticky CDN signature window — keeps image `src` stable across Convex re-renders. */
export function useStickySignedUrlExpiry(ttlSec = 12 * 60 * 60): number {
  const [expiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + ttlSec,
  );
  return expiresUnix;
}
