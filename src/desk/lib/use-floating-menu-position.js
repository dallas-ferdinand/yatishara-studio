import { useLayoutEffect, useState } from "react";
import { applyFloatingMenuPosition } from "./context-menu-position.js";

export function useFloatingMenuPosition(x, y, menuRef, active, deps = []) {
  const [pos, setPos] = useState({ left: x ?? 0, top: y ?? 0 });

  useLayoutEffect(() => {
    if (!active) return;
    const el = menuRef?.current;
    if (!el) return;
    setPos(applyFloatingMenuPosition(el, x, y));
  }, [x, y, active, menuRef, ...deps]);

  return pos;
}
