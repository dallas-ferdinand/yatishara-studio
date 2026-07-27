"use client";

import { useCallback, useRef } from "react";

const DEFAULT_DELAY = 450;
const DEFAULT_PICKUP_DELAY = 220;
/** Cancel pickup/menu if finger moves before pickup arms. */
const PRE_PICKUP_MOVE = 14;
/**
 * After pickup, only cancel the context-menu arm once the finger clearly
 * starts a drag. Keep this tight so drag feels instant after the short hold.
 */
const POST_PICKUP_DRAG_MOVE = 18;

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
  /** Fires when the context-menu hold arms (before release). */
  onMenuArmed?: (coords: Coords) => void;
};

/**
 * Touch long-press for mobile.
 * - Short `onPickup` (drag arm) then longer menu arm if still.
 * - Context menu opens on **touchend** after arming (avoids synthetic click
 *   dismissing a sheet that opened under the still-down finger).
 * - Moving after pickup → drag intent, menu cancelled.
 * - Does not block normal taps.
 */
export function useLongPress(
  onLongPress: ((coords: Coords) => void) | undefined,
  {
    delay = DEFAULT_DELAY,
    pickupDelay = DEFAULT_PICKUP_DELAY,
    onPickup,
    onDragIntent,
    onMenuArmed,
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
  const onMenuArmedRef = useRef(onMenuArmed);
  onLongPressRef.current = onLongPress;
  onPickupRef.current = onPickup;
  onDragIntentRef.current = onDragIntent;
  onMenuArmedRef.current = onMenuArmed;

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
          onMenuArmedRef.current?.({
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
        if (dist > PRE_PICKUP_MOVE) {
          firedRef.current = false;
          clear();
        }
        return;
      }

      // Pickup armed — stay still long enough for context menu; only drag cancels it.
      if (dist <= POST_PICKUP_DRAG_MOVE) return;

      clearMenu();
      firedRef.current = false;
      if (!dragIntentFiredRef.current) {
        dragIntentFiredRef.current = true;
        onDragIntentRef.current?.({ x: t.clientX, y: t.clientY });
      }
    },
    [clear, clearMenu],
  );

  const onTouchEnd = useCallback(() => {
    clear();
    // Open context menu on release so the sheet isn't dismissed by the
    // same gesture's synthetic mousedown/click.
    if (
      firedRef.current &&
      !dragIntentFiredRef.current &&
      !document.body.classList.contains("is-touch-file-drag")
    ) {
      onLongPressRef.current?.({
        x: startRef.current.x,
        y: startRef.current.y,
      });
    }
    firedRef.current = false;
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    firedRef.current = false;
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
