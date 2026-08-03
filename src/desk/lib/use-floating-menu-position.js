import { useLayoutEffect, useState } from "react";
import { applyFloatingMenuPosition } from "./context-menu-position.js";

/**
 * Position a fixed menu near (x, y) and keep it inside the viewport.
 * Remeasures once after paint so real width/height clamp correctly.
 */
export function useFloatingMenuPosition(x, y, menuRef, active, deps = []) {
  const [pos, setPos] = useState({ left: x ?? 0, top: y ?? 0 });

  useLayoutEffect(() => {
    if (!active) return;
    const el = menuRef?.current;
    if (!el) return;
    setPos(applyFloatingMenuPosition(el, x, y));
    const frame = window.requestAnimationFrame(() => {
      if (!menuRef?.current) return;
      setPos(applyFloatingMenuPosition(menuRef.current, x, y));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [x, y, active, menuRef, ...deps]);

  return pos;
}
