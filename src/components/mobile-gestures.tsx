"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { mercuryLogoAssets } from "@/lib/brand-assets";

const PULL_START_SLOP = 10;
const PULL_THRESHOLD = 84;
const PULL_MAX = 118;
/** Degrees of mark rotation per px — still 1:1 with pull, just a touch calmer. */
const SPIN_DEG_PER_PX = 4.2;
const MARK_PX = 22;
const logo = mercuryLogoAssets(MARK_PX, "light");

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

/** Finger travel → pull distance with light rubber-band past the reload line. */
function mapPull(dy: number): number {
  const linear = Math.max(0, (dy - PULL_START_SLOP) * 0.52);
  if (linear <= PULL_THRESHOLD) return linear;
  const over = linear - PULL_THRESHOLD;
  // Soft resistance — still increases (and reverses) with the finger.
  const resisted = PULL_THRESHOLD + (over * 28) / (28 + over);
  return Math.min(PULL_MAX, resisted);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Mobile gesture layer:
 * - Kills browser pinch/double-tap page zoom everywhere (UI must never scale).
 *   Media viewers implement their own zoom and opt out via [data-allow-zoom].
 * - Custom pull-down-to-reload: white circle + logo mark whose rotation is
 *   locked to pull distance (down = one way, back up = reverse). Free-spins
 *   only after a reload is triggered.
 *
 * Scroll snappiness: no always-on non-passive touchmove. Zoom uses CSS
 * touch-action + iOS gesture events; pull attaches a non-passive move listener
 * only while a reload drag is active.
 */
export function MobileGestures() {
  const [active, setActive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const unwindRafRef = useRef(0);
  const puckRef = useRef<HTMLDivElement | null>(null);
  const markRef = useRef<HTMLImageElement | null>(null);
  refreshingRef.current = refreshing;

  const paintPull = (px: number, opts?: { refreshing?: boolean }) => {
    pullRef.current = px;
    const puck = puckRef.current;
    const mark = markRef.current;
    if (!puck) return;
    const progress = Math.min(1, px / PULL_THRESHOLD);
    // Tiny grow as you pull — keeps the lock feel without popping.
    const scale = 0.9 + 0.1 * progress;
    const opacity = opts?.refreshing
      ? 1
      : px <= 0
        ? 0
        : Math.min(1, 0.28 + progress * 0.85);
    puck.style.transform = `translate3d(0, ${px.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    puck.style.opacity = opacity.toFixed(3);
    if (mark && !refreshingRef.current) {
      mark.style.transform = `rotate(${(px * SPIN_DEG_PER_PX).toFixed(2)}deg)`;
    }
  };

  // iOS Safari ignores user-scalable=no — block native pinch gestures only.
  // Page pan uses CSS touch-action (no non-passive touchmove here).
  useEffect(() => {
    const onGesture = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener("gesturestart", onGesture, { passive: false });
    document.addEventListener("gesturechange", onGesture, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (unwindRafRef.current) cancelAnimationFrame(unwindRafRef.current);
    };
  }, []);

  // First mount after arming — paint current pull before the next touchmove.
  useLayoutEffect(() => {
    if (active || refreshing) {
      paintPull(pullRef.current, { refreshing });
    }
  }, [active, refreshing]);

  // Pull-down-to-reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let startX = 0;
    let startY = 0;
    let armed = false;
    let dragging = false;
    let dragMoveAttached = false;

    const cancelUnwind = () => {
      if (unwindRafRef.current) {
        cancelAnimationFrame(unwindRafRef.current);
        unwindRafRef.current = 0;
      }
    };

    const onTouchMoveDrag = (event: TouchEvent) => {
      if (!dragging || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        detachDragMove();
        dragging = false;
        armed = false;
        if (!refreshingRef.current) unwindPull();
        return;
      }
      if (event.cancelable) event.preventDefault();
      const touch = event.touches[0];
      paintPull(mapPull(touch.clientY - startY));
    };

    const attachDragMove = () => {
      if (dragMoveAttached) return;
      window.addEventListener("touchmove", onTouchMoveDrag, { passive: false });
      dragMoveAttached = true;
    };

    const detachDragMove = () => {
      if (!dragMoveAttached) return;
      window.removeEventListener("touchmove", onTouchMoveDrag);
      dragMoveAttached = false;
    };

    /** Settle pull → 0 so the mark unwinds the opposite direction. */
    const unwindPull = () => {
      cancelUnwind();
      detachDragMove();
      const from = pullRef.current;
      if (from <= 0.5) {
        paintPull(0);
        setActive(false);
        return;
      }
      const started = performance.now();
      const duration = 260;
      const tick = (now: number) => {
        const t = easeOutCubic(Math.min(1, (now - started) / duration));
        const next = from * (1 - t);
        paintPull(next);
        if (t < 1) {
          unwindRafRef.current = requestAnimationFrame(tick);
        } else {
          paintPull(0);
          setActive(false);
          unwindRafRef.current = 0;
        }
      };
      unwindRafRef.current = requestAnimationFrame(tick);
    };

    const reset = () => {
      dragging = false;
      armed = false;
      detachDragMove();
      if (!refreshingRef.current) unwindPull();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      cancelUnwind();
      detachDragMove();
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      dragging = false;
      armed =
        !insideZoomRegion(event.target) &&
        !verticalPanBlocked(event.target) &&
        !anyAncestorScrolled(event.target);
    };

    /** Passive probe — never blocks native scroll until a pull actually arms. */
    const onTouchMovePassive = (event: TouchEvent) => {
      if (dragging) return; // non-passive drag listener owns the gesture
      if (!armed || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
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
      dragging = true;
      setActive(true);
      attachDragMove();
      paintPull(mapPull(dy));
    };

    const onTouchEnd = () => {
      if (!dragging) {
        armed = false;
        detachDragMove();
        return;
      }
      const distance = pullRef.current;
      dragging = false;
      armed = false;
      detachDragMove();
      if (distance >= PULL_THRESHOLD) {
        cancelUnwind();
        refreshingRef.current = true;
        setRefreshing(true);
        paintPull(PULL_THRESHOLD, { refreshing: true });
        // Brief beat so the free-spin is visible before the reload.
        window.setTimeout(() => {
          window.location.reload();
        }, 140);
      } else {
        unwindPull();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMovePassive, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      cancelUnwind();
      detachDragMove();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMovePassive);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Keep the puck mounted while active/refreshing so show/hide isn't a hitch.
  if (!active && !refreshing) return null;

  const spinDeg = pullRef.current * SPIN_DEG_PER_PX;

  return (
    <div className="ys-ptr" aria-hidden="true">
      <div
        ref={puckRef}
        className={`ys-ptr-puck${refreshing ? " is-refreshing" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={markRef}
          className="ys-ptr-mark"
          src={logo.src}
          srcSet={logo.srcSet}
          sizes={logo.sizes}
          alt=""
          width={MARK_PX}
          height={MARK_PX}
          draggable={false}
          decoding="async"
          style={
            refreshing
              ? ({ ["--ys-ptr-spin" as string]: `${spinDeg}deg` } as CSSProperties)
              : undefined
          }
        />
      </div>
    </div>
  );
}
