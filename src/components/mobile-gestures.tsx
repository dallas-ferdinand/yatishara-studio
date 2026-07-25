"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mercuryLogoAssets } from "@/lib/brand-assets";

const PULL_START_SLOP = 12;
const PULL_THRESHOLD = 84;
const PULL_MAX = 128;
/** Degrees of mark rotation per px of eased pull — scrubbed both ways with the finger. */
const SPIN_DEG_PER_PX = 5.5;
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

/**
 * Mobile gesture layer:
 * - Kills browser pinch/double-tap page zoom everywhere (UI must never scale).
 *   Media viewers implement their own zoom and opt out via [data-allow-zoom].
 * - Custom pull-down-to-reload: white circle + logo mark whose rotation is
 *   locked to pull distance (down = one way, back up = reverse). Free-spins
 *   only after a reload is triggered.
 */
export function MobileGestures() {
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const unwindRafRef = useRef(0);
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

  useEffect(() => {
    return () => {
      if (unwindRafRef.current) cancelAnimationFrame(unwindRafRef.current);
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

    const cancelUnwind = () => {
      if (unwindRafRef.current) {
        cancelAnimationFrame(unwindRafRef.current);
        unwindRafRef.current = 0;
      }
    };

    /** Snap pull → 0 so the mark unwinds the opposite direction. */
    const unwindPull = () => {
      cancelUnwind();
      const from = pullRef.current;
      if (from <= 0) {
        setPull(0);
        return;
      }
      const started = performance.now();
      const duration = 180;
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        // Ease-out — still scrubbed, just settling.
        const next = from * (1 - t) * (1 - t);
        setPull(next);
        pullRef.current = next;
        if (t < 1) {
          unwindRafRef.current = requestAnimationFrame(tick);
        } else {
          setPull(0);
          pullRef.current = 0;
          unwindRafRef.current = 0;
        }
      };
      unwindRafRef.current = requestAnimationFrame(tick);
    };

    const reset = () => {
      active = false;
      armed = false;
      setPulling(false);
      if (!refreshingRef.current) unwindPull();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      cancelUnwind();
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
      // Locked to finger: down increases pull/spin, back up decreases (reverse).
      const eased = Math.min(PULL_MAX, Math.max(0, (dy - PULL_START_SLOP) * 0.55));
      pullRef.current = eased;
      setPull(eased);
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
        cancelUnwind();
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(PULL_THRESHOLD);
        pullRef.current = PULL_THRESHOLD;
        window.location.reload();
      } else {
        // Unwind — mark spins the other way as the puck goes back up.
        unwindPull();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      cancelUnwind();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const visible = pull > 0.5 || refreshing;
  if (!visible) return null;

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const spinDeg = pull * SPIN_DEG_PER_PX;
  const puckStyle = {
    transform: `translateY(${pull}px)`,
    opacity: refreshing ? 1 : Math.min(1, 0.45 + progress * 0.8),
  } as CSSProperties;
  // Inline rotate so reverse scrub is always live (CSS vars + animation fight this).
  const markStyle = refreshing
    ? ({ ["--ys-ptr-spin" as string]: `${spinDeg}deg` } as CSSProperties)
    : ({ transform: `rotate(${spinDeg}deg)` } as CSSProperties);

  return (
    <div className="ys-ptr" aria-hidden="true">
      <div
        className={`ys-ptr-puck${pulling ? " is-pulling" : ""}${refreshing ? " is-refreshing" : ""}`}
        style={puckStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ys-ptr-mark"
          src={logo.src}
          srcSet={logo.srcSet}
          sizes={logo.sizes}
          alt=""
          width={MARK_PX}
          height={MARK_PX}
          draggable={false}
          decoding="async"
          style={markStyle}
        />
      </div>
    </div>
  );
}
