"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";

type SheetDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  vy: number;
  full: number;
  peek: number;
  pending: boolean;
};

const SHEET_VIDEO_GAP_PX = 8;

function measureVideoClearance(): number | null {
  const video =
    document.querySelector(".studio-academy-player-shell") ??
    document.querySelector(".studio-academy-watch-player") ??
    document.querySelector(".profile-post-slide-media.is-video");
  if (!(video instanceof HTMLElement)) return null;
  const bottom = video.getBoundingClientRect().bottom;
  if (!Number.isFinite(bottom) || bottom <= 0) return null;
  const room = Math.floor(window.innerHeight - bottom - SHEET_VIDEO_GAP_PX);
  // Full-bleed feed video leaves no useful band — keep the token cap.
  if (room < 160) return null;
  return room;
}

type StudioCnBookSheetProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Extra classes on the root (e.g. is-academy-checkout). */
  className?: string;
  children: ReactNode;
  /** Mobile back-stack layer id. */
  backLayerId?: string;
  /**
   * Open at measured content height (capped at full) instead of the peek token.
   * Used for Academy PayWise so the receipt/CTA is not clipped.
   */
  fitContent?: boolean;
  /** Fires after the close slide finishes (parent can unmount). */
  onExited?: () => void;
};

/**
 * CN / Academy mobile bottom sheet — grab handle, peek ↔ full height drag,
 * flick dismiss (same language as History / hamburger sheets).
 */
export function StudioCnBookSheet({
  open,
  onClose,
  ariaLabel,
  className = "",
  children,
  backLayerId = "cn-book-sheet",
  fitContent = false,
  onExited,
}: StudioCnBookSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [entered, setEntered] = useState(false);
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const heightRef = useRef<number | null>(null);
  /** For fitContent sheets, peek snaps back to content height (not the menu token). */
  const contentPeekRef = useRef<number | null>(null);
  const dragRef = useRef<SheetDragState | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const windowDragCleanupRef = useRef<(() => void) | null>(null);
  const slideRef = useRef(0);
  const metricsRef = useRef({ peek: 280, full: 520, min: 120 });

  useMobileBackLayer(backLayerId, open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const readTokenPx = (el: Element | null, name: string, fallback: number) => {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${raw}`;
    el.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h > 0 ? h : fallback;
  };

  const refreshMetrics = () => {
    const panel = panelRef.current;
    const root =
      panel?.closest?.(".studio-polish") ?? document.documentElement;
    const peek = readTokenPx(
      root,
      "--studio-mobile-app-menu-sheet-height",
      window.innerHeight * 0.55,
    );
    const full = readTokenPx(
      root,
      "--studio-mobile-app-menu-sheet-full",
      window.innerHeight * 0.72,
    );
    const band = readTokenPx(
      root,
      "--studio-mobile-app-menu-sheet-band",
      window.innerHeight - 24,
    );
    const cappedFull = Math.min(full, band > 0 ? band : full);
    let nextPeek = Math.min(peek, cappedFull);
    let nextFull = Math.max(cappedFull, nextPeek + 40);
    const room = measureVideoClearance();
    if (room != null) {
      nextFull = Math.min(nextFull, room);
      nextPeek = Math.min(nextPeek, nextFull);
    }
    metricsRef.current = {
      peek: nextPeek,
      full: Math.max(nextFull, nextPeek),
      min: Math.max(110, nextPeek * 0.42),
    };
    return metricsRef.current;
  };

  const applyHeight = (px: number) => {
    heightRef.current = px;
    const el = panelRef.current;
    if (!el) return;
    el.style.height = `${px}px`;
    el.style.maxHeight = `${px}px`;
  };

  const applySlide = (px: number) => {
    slideRef.current = Math.max(0, px);
    const el = panelRef.current;
    if (!el) return;
    el.style.transform =
      slideRef.current <= 0.5 ? "" : `translate3d(0, ${slideRef.current}px, 0)`;
  };

  const endWindowDrag = () => {
    const cleanup = windowDragCleanupRef.current;
    if (!cleanup) return;
    cleanup();
    windowDragCleanupRef.current = null;
  };

  useEffect(() => () => endWindowDrag(), []);

  const measureContentHeight = (full: number) => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    const handle = handleRef.current;
    if (!panel || !body) return null;
    const prevH = panel.style.height;
    const prevMax = panel.style.maxHeight;
    // Give the body room so scrollHeight reflects full content, not the clip.
    panel.style.height = `${full}px`;
    panel.style.maxHeight = `${full}px`;
    const handleH = handle?.getBoundingClientRect().height ?? 28;
    const safePad =
      Number.parseFloat(
        getComputedStyle(panel).paddingBottom || "0",
      ) || 0;
    const bodyPad =
      Number.parseFloat(getComputedStyle(body).paddingBottom || "0") || 0;
    const contentH =
      handleH + body.scrollHeight + safePad + Math.max(0, 8 - bodyPad);
    panel.style.height = prevH;
    panel.style.maxHeight = prevMax;
    return contentH;
  };

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return undefined;
    }
    if (!shown) return undefined;
    endWindowDrag();
    setLeaving(true);
    const t = window.setTimeout(() => {
      setShown(false);
      setLeaving(false);
      setDragging(false);
      setSettling(false);
      setIsFull(false);
      setEntered(false);
      heightRef.current = null;
      contentPeekRef.current = null;
      dragRef.current = null;
      slideRef.current = 0;
      onExitedRef.current?.();
    }, 240);
    return () => window.clearTimeout(t);
  }, [open, shown]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const applyOpenHeight = () => {
      if (cancelled) return;
      const { peek, full } = refreshMetrics();
      let openH = peek;
      if (fitContent) {
        const contentH = measureContentHeight(full);
        if (contentH != null) {
          // Hug content (+ small buffer for subpixel/safe-area), capped at full.
          openH = Math.min(
            full,
            Math.max(contentH + 12, metricsRef.current.min + 48),
          );
          contentPeekRef.current = openH;
          // Drag math uses this as the lower snap (not the shorter menu peek).
          metricsRef.current.peek = Math.min(openH, full);
        }
      } else {
        contentPeekRef.current = null;
      }
      applyHeight(openH);
      setIsFull(openH >= full - 8);
    };
    // Two frames: first paint mounts children, second reads settled scrollHeight.
    const id = window.requestAnimationFrame(() => {
      applyOpenHeight();
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        if (fitContent) applyOpenHeight();
        setEntered(true);
      });
    });
    const onResize = () => {
      if (cancelled) return;
      const { full } = refreshMetrics();
      const h = heightRef.current;
      if (h == null) return;
      applyHeight(Math.min(h, full));
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [open, fitContent]);

  if (!shown) return null;

  const settleTo = (fromH: number, target: number) => {
    const { peek, full } = metricsRef.current;
    setDragging(false);
    setSettling(true);
    applyHeight(fromH);
    applySlide(0);
    window.requestAnimationFrame(() => {
      applyHeight(target);
      applySlide(0);
      setIsFull(target >= full - 8 || target > peek + (full - peek) * 0.5);
      window.setTimeout(() => setSettling(false), 230);
    });
  };

  const applyDragPosition = (startH: number, dy: number) => {
    const { full, peek } = metricsRef.current;
    const next = startH - dy;
    if (next >= peek) {
      applyHeight(Math.min(full, next));
      applySlide(0);
      return;
    }
    applyHeight(peek);
    applySlide(peek - next);
  };

  const dismissFromDrag = () => {
    const el = panelRef.current;
    if (el) {
      el.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "translate3d(0, 110%, 0)";
    }
    setDragging(false);
    setSettling(false);
    onClose();
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    endWindowDrag();
    if (dragRafRef.current != null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (drag.pending) {
      setDragging(false);
      return;
    }
    const { peek, full, min } = metricsRef.current;
    const slide = slideRef.current;
    const h =
      heightRef.current ??
      panelRef.current?.getBoundingClientRect().height ??
      peek;
    const mid = (peek + full) / 2;
    const range = Math.max(1, full - peek);
    const dragDown = drag.startH - h + slide;
    const dragUp = h - drag.startH;
    const fromFull = drag.startH >= full - 12;
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickUp = vy < -0.42;
    const flickDown = vy > 0.42;

    if (slide > 64 || (flickDown && slide > 18)) {
      dismissFromDrag();
      return;
    }

    if (flickUp || (!fromFull && dragUp > range * 0.22 && h > peek + 8)) {
      settleTo(h, full);
      return;
    }

    if (fromFull) {
      const bigSwipeDown =
        h <= peek * 0.78 ||
        h <= min + 8 ||
        dragDown >= range * 0.55 ||
        (flickDown && dragDown >= range * 0.32);
      if (bigSwipeDown) {
        dismissFromDrag();
        return;
      }
      if (flickDown || dragDown > 18 || h < full - 10) {
        settleTo(h, peek);
        return;
      }
      settleTo(h, full);
      return;
    }

    if (flickDown || h <= peek * 0.72 || h <= min + 8) {
      dismissFromDrag();
      return;
    }
    settleTo(h, h >= mid ? full : peek);
  };

  const scrollerAtTop = (target: EventTarget | null) => {
    const panel = panelRef.current;
    let el = target instanceof Element ? target : null;
    while (el && el !== panel) {
      const overflowY = getComputedStyle(el).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el.scrollTop <= 1;
      }
      el = el.parentElement;
    }
    return true;
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    immediate: boolean,
  ) => {
    endWindowDrag();
    const metrics = refreshMetrics();
    const peek =
      fitContent && contentPeekRef.current != null
        ? Math.min(contentPeekRef.current, metrics.full)
        : metrics.peek;
    if (fitContent) metricsRef.current.peek = peek;
    const { full } = metricsRef.current;
    const startH =
      panelRef.current?.getBoundingClientRect().height ||
      heightRef.current ||
      peek;
    const now = performance.now();
    const pointerId = event.pointerId;
    dragRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startH,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
      full,
      peek,
      pending: !immediate,
    };
    setSettling(false);
    if (immediate) {
      setDragging(true);
      applyHeight(startH);
      applySlide(0);
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return;
      const drag = dragRef.current;
      if (!drag) return;
      const t = performance.now();
      const dt = t - drag.lastT;
      if (dt > 0) {
        const instant = (moveEvent.clientY - drag.lastY) / dt;
        drag.vy = drag.vy * 0.35 + instant * 0.65;
        drag.lastY = moveEvent.clientY;
        drag.lastT = t;
      }
      const dy = moveEvent.clientY - drag.startY;
      const dx = moveEvent.clientX - drag.startX;
      if (drag.pending) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          dragRef.current = null;
          endWindowDrag();
          return;
        }
        if (dy < -10) {
          dragRef.current = null;
          endWindowDrag();
          return;
        }
        if (dy < 12) return;
        drag.pending = false;
        setDragging(true);
        applyHeight(drag.startH);
      }
      applyDragPosition(drag.startH, dy);
      if (dragRafRef.current == null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
        });
      }
    };
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId != null && upEvent.pointerId !== pointerId) return;
      finishDrag();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    windowDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  };

  const onPanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button != null && event.button !== 0) return;
    const target = event.target;
    const fromHandle =
      target instanceof Element &&
      Boolean(target.closest(".studio-cn-book-sheet-handle"));
    if (fromHandle) {
      event.preventDefault();
      event.stopPropagation();
      beginDrag(event, true);
      return;
    }
    if (
      target instanceof Element &&
      target.closest(
        "input, textarea, select, button, a, [contenteditable='true']",
      )
    ) {
      return;
    }
    if (!scrollerAtTop(target)) return;
    beginDrag(event, false);
  };

  const rootClass = [
    "studio-cn-book-sheet",
    className.trim(),
    entered ? "is-entered" : "is-entering",
    leaving ? "is-leaving" : "",
    isFull ? "is-full" : "",
    dragging ? "is-dragging" : "",
    settling ? "is-settling" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div
        ref={panelRef}
        className="studio-cn-book-sheet-panel"
        onPointerDown={onPanelPointerDown}
      >
        <div
          ref={handleRef}
          className="studio-cn-book-sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize sheet"
        >
          <span className="studio-cn-book-sheet-grab" aria-hidden="true" />
        </div>
        <div ref={bodyRef} className="studio-cn-book-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}
