"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mercuryLogoAssets } from "@/lib/brand-assets";

const PULL_START_SLOP = 12;
const PULL_THRESHOLD = 84;
const PULL_MAX = 128;
/** Degrees of mark rotation per px — scrubbed both ways with the finger. */
const SPIN_DEG_PER_PX = 5.5;
const MARK_PX = 22;
const logo = mercuryLogoAssets(MARK_PX, "light");

function insideZoomRegion(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-allow-zoom]"));
}

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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Mobile gesture layer:
 * - Zoom guard via CSS touch-action + iOS gesture* (no always-on non-passive pan).
 * - Pull-to-reload: white circle + mark. Rotation is scrubbed to pull distance
 *   (down one way, back up reverses). Free-spins only after reload triggers.
 */
export function MobileGestures() {
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const unwindRafRef = useRef(0);
  const markRef = useRef<HTMLImageElement | null>(null);
  pullRef.current = pull;
  refreshingRef.current = refreshing;

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

  // When free-spin starts, clear any leftover inline transform so CSS animation wins.
  useEffect(() => {
    if (!refreshing) return;
    const mark = markRef.current;
    if (mark) mark.style.transform = "";
  }, [refreshing]);

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

    const setPullBoth = (px: number) => {
      pullRef.current = px;
      setPull(px);
    };

    const onTouchMoveDrag = (event: TouchEvent) => {
      if (!dragging || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        detachDragMove();
        dragging = false;
        armed = false;
        setPulling(false);
        if (!refreshingRef.current) unwindPull();
        return;
      }
      if (event.cancelable) event.preventDefault();
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const eased = Math.min(PULL_MAX, Math.max(0, (dy - PULL_START_SLOP) * 0.55));
      setPullBoth(eased);
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

    const unwindPull = () => {
      cancelUnwind();
      detachDragMove();
      const from = pullRef.current;
      if (from <= 0.5) {
        setPullBoth(0);
        setPulling(false);
        return;
      }
      const started = performance.now();
      const duration = 220;
      const tick = (now: number) => {
        const t = easeOutCubic(Math.min(1, (now - started) / duration));
        const next = from * (1 - t);
        setPullBoth(next);
        if (t < 1) {
          unwindRafRef.current = requestAnimationFrame(tick);
        } else {
          setPullBoth(0);
          setPulling(false);
          unwindRafRef.current = 0;
        }
      };
      unwindRafRef.current = requestAnimationFrame(tick);
    };

    const reset = () => {
      dragging = false;
      armed = false;
      setPulling(false);
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

    const onTouchMovePassive = (event: TouchEvent) => {
      if (dragging) return;
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
      if (event.defaultPrevented) {
        armed = false;
        return;
      }
      dragging = true;
      setPulling(true);
      attachDragMove();
      const eased = Math.min(PULL_MAX, Math.max(0, (dy - PULL_START_SLOP) * 0.55));
      setPullBoth(eased);
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
      setPulling(false);
      detachDragMove();
      if (distance >= PULL_THRESHOLD) {
        cancelUnwind();
        refreshingRef.current = true;
        setRefreshing(true);
        setPullBoth(PULL_THRESHOLD);
        // Clear inline transform so CSS free-spin can run.
        if (markRef.current) markRef.current.style.transform = "";
        window.setTimeout(() => {
          try {
            window.dispatchEvent(new Event("studio:flush-tab-session"));
          } catch {
            /* ignore */
          }
          window.location.reload();
        }, 420);
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

  const visible = pull > 0.5 || refreshing;
  if (!visible) return null;

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const spinDeg = pull * SPIN_DEG_PER_PX;
  const puckStyle = {
    transform: `translateY(${pull}px)`,
    opacity: refreshing ? 1 : Math.min(1, 0.4 + progress * 0.85),
  } as CSSProperties;

  // Scrub via React style while pulling. On refresh, only set the CSS var —
  // never an inline transform (that kills the free-spin animation).
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
          style={markStyle}
        />
      </div>
    </div>
  );
}
