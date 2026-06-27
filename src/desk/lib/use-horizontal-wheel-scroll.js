/** Wheel over horizontal overflow → scroll sideways (no Shift). */
import { useEffect } from "react";

function canScrollX(el, delta) {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return false;
  if (delta > 0) return el.scrollLeft < max - 1;
  if (delta < 0) return el.scrollLeft > 0;
  return false;
}

export function bindHorizontalWheelScroll(el) {
  if (!el) return () => {};
  const onWheel = (e) => {
    const delta =
      Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    if (!canScrollX(el, delta)) return;
    e.preventDefault();
    el.scrollLeft += delta;
  };
  const opts = { passive: false };
  el.addEventListener("wheel", onWheel, opts);
  return () => el.removeEventListener("wheel", onWheel, opts);
}

export function useHorizontalWheelScroll(containerRef) {
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return undefined;
    return bindHorizontalWheelScroll(el);
  });
}
