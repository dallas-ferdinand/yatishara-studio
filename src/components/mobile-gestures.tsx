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

function nearestVerticalScroller(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function leftoverVerticalOverscroll(target: EventTarget | null, dy: number): boolean {
  if (Math.abs(dy) < 1) return false;
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (dy > 0 && !atTop) return false;
      if (dy < 0 && !atBottom) return false;
    }
    el = el.parentElement;
  }
  return true;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Mobile gesture layer:
 * - Zoom guard via CSS touch-action + iOS gesture* (no always-on non-passive pan).
 * - Pull-to-reload: white circle + mark. Rotation is scrubbed to pull distance
 *   (down one way, back up reverses). Free-spins only after reload triggers.
 * - Swallow leftover vertical overscroll (up at bottom / no more scroll) so the
 *   browser cannot steal it for close-tab / chrome gestures.
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
    let lastY = 0;
    let armed = false;
    let dragging = false;
    let edgeMoveAttached = false;

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

    const onTouchMoveEdge = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        detachEdgeMove();
        dragging = false;
        armed = false;
        setPulling(false);
        if (!refreshingRef.current) unwindPull();
        return;
      }
      const touch = event.touches[0];
      const dyInc = touch.clientY - lastY;
      lastY = touch.clientY;
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      const leftover = leftoverVerticalOverscroll(event.target, dyInc);
      if (leftover && event.cancelable) event.preventDefault();

      if (dragging) {
        const eased = Math.min(PULL_MAX, Math.max(0, (dy - PULL_START_SLOP) * 0.55));
        setPullBoth(eased);
        return;
      }
      if (!armed) return;
      if (dy < -4 || Math.abs(dx) > Math.abs(dy)) {
        armed = false;
        return;
      }
      if (dy < PULL_START_SLOP) return;
      dragging = true;
      setPulling(true);
      const eased = Math.min(PULL_MAX, Math.max(0, (dy - PULL_START_SLOP) * 0.55));
      setPullBoth(eased);
    };

    const attachEdgeMove = () => {
      if (edgeMoveAttached) return;
      window.addEventListener("touchmove", onTouchMoveEdge, { passive: false });
      edgeMoveAttached = true;
    };

    const detachEdgeMove = () => {
      if (!edgeMoveAttached) return;
      window.removeEventListener("touchmove", onTouchMoveEdge);
      edgeMoveAttached = false;
    };

    const unwindPull = () => {
      cancelUnwind();
      detachEdgeMove();
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
      detachEdgeMove();
      if (!refreshingRef.current) unwindPull();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      cancelUnwind();
      detachEdgeMove();
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      dragging = false;
      const blocked =
        insideZoomRegion(event.target) || verticalPanBlocked(event.target);
      armed = !blocked && leftoverVerticalOverscroll(event.target, 1);
      const scroller = nearestVerticalScroller(event.target);
      const atEdge =
        !scroller ||
        scroller.scrollTop <= 0 ||
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (!blocked && atEdge) attachEdgeMove();
    };

    const onTouchMovePassive = (event: TouchEvent) => {
      if (dragging || edgeMoveAttached || refreshingRef.current) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dyInc = touch.clientY - lastY;
      lastY = touch.clientY;
      if (
        leftoverVerticalOverscroll(event.target, dyInc) &&
        !insideZoomRegion(event.target) &&
        !verticalPanBlocked(event.target)
      ) {
        attachEdgeMove();
      }
    };

    const onTouchEnd = () => {
      if (!dragging) {
        armed = false;
        detachEdgeMove();
        return;
      }
      const distance = pullRef.current;
      dragging = false;
      armed = false;
      setPulling(false);
      detachEdgeMove();
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
      detachEdgeMove();
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
