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
  lastY: number;
  lastT: number;
  vy: number;
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
};

/**
 * CN / Academy mobile bottom sheet — grab handle + slide-down dismiss
 * (same language as DM context / hamburger sheets).
 */
export function StudioCnBookSheet({
  open,
  onClose,
  ariaLabel,
  className = "",
  children,
  backLayerId = "cn-book-sheet",
}: StudioCnBookSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<SheetDragState | null>(null);
  const offsetRef = useRef(0);

  useMobileBackLayer(backLayerId, open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    offsetRef.current = 0;
    setDragging(false);
    dragRef.current = null;
    const el = panelRef.current;
    if (el) {
      el.style.transform = "";
      el.style.transition = "";
    }
  }, [open]);

  if (!open) return null;

  const applyOffset = (px: number) => {
    offsetRef.current = px;
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = px > 0 ? `translate3d(0, ${px}px, 0)` : "";
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button != null && event.button !== 0) return;
    const now = performance.now();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
    };
    setDragging(true);
    const el = panelRef.current;
    if (el) el.style.transition = "none";
    applyOffset(0);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    applyOffset(Math.max(0, event.clientY - drag.startY));
  };

  const onHandlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const offset = offsetRef.current;
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickDown = vy > 0.42;
    const sheetH = panelRef.current?.getBoundingClientRect().height ?? 240;
    if (flickDown || offset > Math.min(110, sheetH * 0.28)) {
      setDragging(false);
      onClose();
      return;
    }
    setDragging(false);
    const el = panelRef.current;
    if (el) {
      el.style.transition = "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)";
      applyOffset(0);
      window.setTimeout(() => {
        if (el) el.style.transition = "";
      }, 160);
    } else {
      applyOffset(0);
    }
  };

  const rootClass = [
    "studio-cn-book-sheet",
    className.trim(),
    dragging ? "is-dragging" : "",
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
      <div
        ref={panelRef}
        className="studio-cn-book-sheet-panel"
      >
        <div
          className="studio-cn-book-sheet-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag down to dismiss"
        >
          <span className="studio-cn-book-sheet-grab" aria-hidden="true" />
        </div>
        <div className="studio-cn-book-sheet-body">{children}</div>
      </div>
    </div>
  );
}
