"use client";

import { useEffect, useRef, useState } from "react";
import { LogoLoader } from "@/studio/components/logo-loader";

const PULL_START_SLOP = 12;
const PULL_THRESHOLD = 84;
const PULL_MAX = 128;

function insideZoomRegion(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-allow-zoom]"));
}

/** Mimic native scroll gating: skip pull when touch-action forbids vertical pan. */
function verticalPanBlocked(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const action = getComputedStyle(el).touchAction;
    if (action.includes("none")) return true;
    if (action.includes("pan-x") && !action.includes("pan-y")) return true;
    el = el.parentElement;
  }
  return false;
}

function anyAncestorScrolled(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight + 1) return true;
    el = el.parentElement;
  }
  return (document.scrollingElement?.scrollTop ?? 0) > 0;
}

/**
 * Mobile gesture layer:
 * - Kills browser pinch/double-tap page zoom everywhere (UI must never scale).
 *   Media viewers implement their own zoom and opt out via [data-allow-zoom].
 * - Custom pull-down-to-reload with the brand LogoLoader (native PTR is dead
 *   because body is overflow:hidden and the app runs standalone).
 */
export function MobileGestures() {
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  pullRef.current = pull;
  refreshingRef.current = refreshing;

  // Page-zoom guard. iOS Safari tabs ignore user-scalable=no, so block the
  // gesture events too. Multi-touch moves are prevented globally — custom
  // zoom uses pointer events and keeps working.
  useEffect(() => {
    const onGesture = (event: Event) => {
      event.preventDefault();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault();
    };
    document.addEventListener("gesturestart", onGesture, { passive: false });
    document.addEventListener("gesturechange", onGesture, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Pull-down-to-reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let startX = 0;
    let startY = 0;
    let armed = false;
    let active = false;

    const reset = () => {
      active = false;
      armed = false;
      setPulling(false);
      if (!refreshingRef.current) setPull(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      active = false;
      armed =
        !insideZoomRegion(event.target) &&
        !verticalPanBlocked(event.target) &&
        !anyAncestorScrolled(event.target);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!active) {
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) {
          armed = false;
          return;
        }
        if (dy < PULL_START_SLOP) return;
        // Another handler (feed swipe, sheets) already owns this gesture.
        if (event.defaultPrevented) {
          armed = false;
          return;
        }
        active = true;
        setPulling(true);
      }
      if (event.cancelable) event.preventDefault();
      const eased = Math.min(PULL_MAX, (dy - PULL_START_SLOP) * 0.55);
      setPull(Math.max(0, eased));
    };

    const onTouchEnd = () => {
      if (!active) {
        reset();
        return;
      }
      const distance = pullRef.current;
      active = false;
      armed = false;
      setPulling(false);
      if (distance >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(PULL_THRESHOLD);
        window.location.reload();
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const visible = pull > 0 || refreshing;
  if (!visible) return null;

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  return (
    <div className="ys-ptr" aria-hidden="true">
      <div
        className={`ys-ptr-puck${pulling ? " is-pulling" : ""}${refreshing ? " is-refreshing" : ""}`}
        style={{
          transform: `translateY(${Math.round(pull * 0.9)}px) scale(${(0.68 + 0.32 * progress).toFixed(3)})`,
          opacity: refreshing ? 1 : Math.min(1, progress * 1.2),
        }}
      >
        <LogoLoader size="sm" variant="bare" />
      </div>
    </div>
  );
}
