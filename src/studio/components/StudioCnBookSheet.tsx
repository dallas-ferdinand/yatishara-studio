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
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  vy: number;
  full: number;
  peek: number;
};

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
    metricsRef.current = {
      peek: Math.min(peek, cappedFull),
      full: Math.max(cappedFull, Math.min(peek, cappedFull) + 40),
      min: Math.max(110, peek * 0.42),
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
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [open, fitContent]);

  if (!shown) return null;

  const settleTo = (fromH: number, target: number) => {
    const { peek, full } = metricsRef.current;
    setDragging(false);
    setSettling(true);
    applyHeight(fromH);
    window.requestAnimationFrame(() => {
      applyHeight(target);
      setIsFull(target >= full - 8 || target > peek + (full - peek) * 0.5);
      window.setTimeout(() => setSettling(false), 230);
    });
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button != null && event.button !== 0) return;
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
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startH,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
      full,
      peek,
    };
    setSettling(false);
    setDragging(true);
    applyHeight(startH);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { full, min } = metricsRef.current;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    const dy = event.clientY - drag.startY;
    applyHeight(Math.min(full, Math.max(min, drag.startH - dy)));
    if (dragRafRef.current == null) {
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
      });
    }
  };

  const onHandlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (dragRafRef.current != null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const { peek, full, min } = metricsRef.current;
    const h =
      heightRef.current ??
      panelRef.current?.getBoundingClientRect().height ??
      peek;
    const mid = (peek + full) / 2;
    const range = Math.max(1, full - peek);
    const dragDown = drag.startH - h;
    const dragUp = h - drag.startH;
    const fromFull = drag.startH >= full - 12;
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickUp = vy < -0.42;
    const flickDown = vy > 0.42;

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
        setDragging(false);
        setSettling(false);
        onClose();
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
      setDragging(false);
      setSettling(false);
      onClose();
      return;
    }
    settleTo(h, h >= mid ? full : peek);
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
      <button
        type="button"
        className="studio-cn-book-sheet-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div ref={panelRef} className="studio-cn-book-sheet-panel">
        <div
          ref={handleRef}
          className="studio-cn-book-sheet-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
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
