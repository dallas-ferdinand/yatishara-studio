/** Wheel over horizontal overflow → scroll sideways (no Shift). */
import { useEffect } from "react";

function canScrollX(el, delta) {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return false;
  if (delta > 0) return el.scrollLeft < max - 1;
  if (delta < 0) return el.scrollLeft > 0;
  return false;
}

function isHorizontalMenuStrip(el) {
  if (!(el instanceof Element)) return false;
  if (el.hasAttribute("data-no-h-wheel")) return false;
  if (el.hasAttribute("data-h-scroll")) return true;
  const style = getComputedStyle(el);
  const ox = style.overflowX;
  const oy = style.overflowY;
  if (ox !== "auto" && ox !== "scroll") return false;
  // Tab/chip strips hide Y; chat tables keep overflow-y:visible so vertical wheel stays with chat.
  return oy === "hidden" || oy === "clip";
}

export function findHorizontalMenuScrollParent(start) {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.documentElement) {
    if (isHorizontalMenuStrip(el) && el.scrollWidth > el.clientWidth + 1) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function bindHorizontalWheelScroll(el) {
  if (!el) return () => {};
  const onWheel = (e) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
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

/** App-wide: any overflow-x strip with overflow-y hidden/clip pans on vertical wheel. */
export function installGlobalHorizontalWheelScroll(root = document) {
  const onWheel = (e) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.defaultPrevented) return;
    const delta =
      Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    const el = findHorizontalMenuScrollParent(e.target);
    if (!el || !canScrollX(el, delta)) return;
    e.preventDefault();
    el.scrollLeft += delta;
  };
  const opts = { passive: false, capture: true };
  root.addEventListener("wheel", onWheel, opts);
  return () => root.removeEventListener("wheel", onWheel, opts);
}

export function useHorizontalWheelScroll(containerRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let detach = () => {};
    let cancelled = false;
    let tries = 0;
    const attach = () => {
      if (cancelled) return;
      detach();
      const el = containerRef?.current;
      if (el) {
        detach = bindHorizontalWheelScroll(el);
        return;
      }
      if (tries++ < 60) {
        requestAnimationFrame(attach);
      }
    };
    attach();
    return () => {
      cancelled = true;
      detach();
    };
  }, [containerRef, enabled]);
}
