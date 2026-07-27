"use client";

import { useCallback, useRef } from "react";

const DEFAULT_DELAY = 450;
const DEFAULT_PICKUP_DELAY = 220;
/** Cancel pickup/menu if finger moves before pickup arms. */
const PRE_PICKUP_MOVE = 14;
/**
 * After pickup, only cancel the context-menu timer once the finger clearly
 * starts a drag. Small tremor must not kill the second (longer) hold.
 */
const POST_PICKUP_DRAG_MOVE = 28;

type Coords = { x: number; y: number };

type UseLongPressOptions = {
  /** Context-menu / action delay (ms). */
  delay?: number;
  /** Optional earlier “pickup” delay for drag-arming (ms). */
  pickupDelay?: number;
  /** Fires once at pickupDelay while still held — drag can begin after this. */
  onPickup?: (coords: Coords) => void;
  /**
   * Fires once when the finger moves past the drag threshold after pickup.
   * Use this to start a touch-drag session (HTML5 DnD does not work on mobile).
   */
  onDragIntent?: (coords: Coords) => void;
};

/**
 * Touch long-press for mobile.
 * - Short `onPickup` (drag arm) then longer `onLongPress` (context menu) if still.
 * - Still finger → both fire. Moving after pickup → drag intent, menu cancelled.
 * - Does not block normal taps.
 */
export function useLongPress(
  onLongPress: ((coords: Coords) => void) | undefined,
  {
    delay = DEFAULT_DELAY,
    pickupDelay = DEFAULT_PICKUP_DELAY,
    onPickup,
    onDragIntent,
  }: UseLongPressOptions = {},
) {
  const menuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const pickupFiredRef = useRef(false);
  const dragIntentFiredRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  const onPickupRef = useRef(onPickup);
  const onDragIntentRef = useRef(onDragIntent);
  onLongPressRef.current = onLongPress;
  onPickupRef.current = onPickup;
  onDragIntentRef.current = onDragIntent;

  const clearMenu = useCallback(() => {
    if (menuTimerRef.current) clearTimeout(menuTimerRef.current);
    menuTimerRef.current = null;
  }, []);

  const clearPickup = useCallback(() => {
    if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
    pickupTimerRef.current = null;
  }, []);

  const clear = useCallback(() => {
    clearMenu();
    clearPickup();
  }, [clearMenu, clearPickup]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!onLongPressRef.current && !onPickupRef.current) return;
      firedRef.current = false;
      pickupFiredRef.current = false;
      dragIntentFiredRef.current = false;
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY };
      clear();

      if (onPickupRef.current) {
        pickupTimerRef.current = setTimeout(() => {
          pickupFiredRef.current = true;
          onPickupRef.current?.({
            x: startRef.current.x,
            y: startRef.current.y,
          });
        }, pickupDelay);
      }

      if (onLongPressRef.current) {
        menuTimerRef.current = setTimeout(() => {
          // If a drag already started, skip the context menu.
          if (dragIntentFiredRef.current) return;
          firedRef.current = true;
          onLongPressRef.current?.({
            x: startRef.current.x,
            y: startRef.current.y,
          });
        }, delay);
      }
    },
    [clear, delay, pickupDelay],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!menuTimerRef.current && !pickupTimerRef.current && !pickupFiredRef.current) {
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startRef.current.x);
      const dy = Math.abs(t.clientY - startRef.current.y);
      const dist = Math.max(dx, dy);

      if (!pickupFiredRef.current) {
        if (dist > PRE_PICKUP_MOVE) clear();
        return;
      }

      // Pickup armed — stay still long enough for context menu; only drag cancels it.
      if (dist <= POST_PICKUP_DRAG_MOVE) return;

      clearMenu();
      if (!dragIntentFiredRef.current) {
        dragIntentFiredRef.current = true;
        onDragIntentRef.current?.({ x: t.clientX, y: t.clientY });
      }
    },
    [clear, clearMenu],
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  const active = Boolean(onLongPress || onPickup || onDragIntent);

  return {
    longPressHandlers: active
      ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }
      : {},
    longPressFired: () => firedRef.current,
    clearLongPressFired: () => {
      firedRef.current = false;
    },
    pickupFired: () => pickupFiredRef.current,
    dragIntentFired: () => dragIntentFiredRef.current,
    cancelMenu: clearMenu,
  };
}
