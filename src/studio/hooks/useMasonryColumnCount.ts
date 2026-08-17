"use client";

import { useEffect, useState } from "react";

/** Desktop Create/profile masonry is always 3 columns; mobile is always 2. */
export function columnCountForWidth(_width: number, isMobile?: boolean): number {
  if (isMobile) return 2;
  return 3;
}

export function useMasonryColumnCount(isMobile?: boolean) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(isMobile ? 2 : 3);

  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => setCols(columnCountForWidth(el.clientWidth, isMobile));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, isMobile]);

  return { ref: setEl, cols };
}
