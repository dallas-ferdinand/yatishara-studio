import { useLayoutEffect, useState } from "react";
import { applyFloatingMenuPosition } from "./context-menu-position.js";

/**
 * Position a fixed menu near (x, y) and keep it inside the viewport.
 * Stays invisible until the first layout measure for these coords so the
 * menu never flashes at a previous open (or the raw click) then jumps.
 */
export function useFloatingMenuPosition(x, y, menuRef, active, deps = []) {
  const [pos, setPos] = useState({
    left: x ?? 0,
    top: y ?? 0,
    ready: false,
    anchorX: null,
    anchorY: null,
  });

  useLayoutEffect(() => {
    if (!active) {
      setPos({
        left: x ?? 0,
        top: y ?? 0,
        ready: false,
        anchorX: null,
        anchorY: null,
      });
      return;
    }
    const el = menuRef?.current;
    if (!el) return;

    const place = () => {
      const node = menuRef?.current;
      if (!node) return;
      const next = applyFloatingMenuPosition(node, x, y);
      setPos((prev) => {
        if (
          prev.ready &&
          prev.anchorX === x &&
          prev.anchorY === y &&
          prev.left === next.left &&
          prev.top === next.top
        ) {
          return prev;
        }
        return {
          ...next,
          ready: true,
          anchorX: x,
          anchorY: y,
        };
      });
    };

    place();

    // Icons/fonts can change size after first layout — update only if clamp moves.
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [x, y, active, menuRef, ...deps]);

  return {
    left: pos.left,
    top: pos.top,
    // Hide until this (x,y) has been measured — blocks stale previous open.
    ready: Boolean(active && pos.ready && pos.anchorX === x && pos.anchorY === y),
  };
}
