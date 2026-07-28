/** Left/right edge fade for horizontal overflow strips (matches tab-strip mask). */
import { useEffect } from "react";

const EDGE_EPS = 1;

/**
 * Sets `data-scroll-fade` on the element: "none" | "left" | "right" | "both".
 * Mask CSS should key off that attribute so edge items are fully visible when
 * scrolled flush to that side.
 */
export function bindHorizontalScrollFade(el) {
  if (!el) return () => {};

  const sync = () => {
    const max = el.scrollWidth - el.clientWidth;
    if (max <= EDGE_EPS) {
      el.dataset.scrollFade = "none";
      return;
    }
    const atStart = el.scrollLeft <= EDGE_EPS;
    const atEnd = el.scrollLeft >= max - EDGE_EPS;
    if (atStart && atEnd) el.dataset.scrollFade = "none";
    else if (atStart) el.dataset.scrollFade = "right";
    else if (atEnd) el.dataset.scrollFade = "left";
    else el.dataset.scrollFade = "both";
  };

  sync();
  el.addEventListener("scroll", sync, { passive: true });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
  ro?.observe(el);
  const mo =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(sync)
      : null;
  mo?.observe(el, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", sync);

  return () => {
    el.removeEventListener("scroll", sync);
    ro?.disconnect();
    mo?.disconnect();
    window.removeEventListener("resize", sync);
  };
}

export function useHorizontalScrollFade(containerRef) {
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return undefined;
    el.classList.add("cursor-h-scroll-fade");
    return bindHorizontalScrollFade(el);
  });
}
