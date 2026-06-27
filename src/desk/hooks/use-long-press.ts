"use client";

import { useCallback, useRef } from "react";

const DEFAULT_DELAY = 450;
const MOVE_THRESHOLD = 12;

/** Touch long-press for mobile context menus (does not block normal taps). */
export function useLongPress(
  onLongPress: (() => void) | undefined,
  { delay = DEFAULT_DELAY }: { delay?: number } = {}
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!onLongPress) return;
      firedRef.current = false;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [clear, delay, onLongPress]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!timerRef.current) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - startRef.current.x);
      const dy = Math.abs(t.clientY - startRef.current.y);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) clear();
    },
    [clear]
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  return {
    longPressHandlers: onLongPress
      ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }
      : {},
    longPressFired: () => firedRef.current,
    clearLongPressFired: () => {
      firedRef.current = false;
    },
  };
}
