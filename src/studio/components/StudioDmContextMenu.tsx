"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";

export type StudioDmContextMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** When true (or when danger), first tap arms confirm; second tap runs. */
  needsConfirm?: boolean;
  onSelect: () => void;
};

type StudioDmContextMenuProps = {
  x: number;
  y: number;
  items: StudioDmContextMenuItem[];
  onClose: () => void;
  /** Accessibility label for the mobile sheet. */
  title?: string;
};

type SheetDragState = {
  startY: number;
  lastY: number;
  lastT: number;
  vy: number;
};

/**
 * Mobile action sheet — same language as hamburger / peer sheets:
 * grab handle, no title/Done, slide-down to dismiss.
 */
function DmContextMobileSheet({
  onClose,
  ariaLabel,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<SheetDragState | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const applyOffset = (px: number) => {
    offsetRef.current = px;
    const el = sheetRef.current;
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
    const sheetH = sheetRef.current?.getBoundingClientRect().height ?? 240;
    if (flickDown || offset > Math.min(110, sheetH * 0.28)) {
      setDragging(false);
      onClose();
      return;
    }
    setDragging(false);
    const el = sheetRef.current;
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

  return (
    <div
      ref={sheetRef}
      className={`studio-mobile-app-menu-sheet studio-dm-context-sheet${entered ? " is-entered" : " is-entering"}${dragging ? " is-dragging" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="studio-mobile-app-menu-sheet-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Dismiss"
      >
        <span className="studio-mobile-app-menu-sheet-grab" aria-hidden="true" />
      </div>
      <div className="studio-dm-context-sheet-body" role="menu">
        {children}
      </div>
    </div>
  );
}

function itemNeedsConfirm(item: StudioDmContextMenuItem): boolean {
  return item.needsConfirm === true || item.danger === true;
}

/** Floating right-click menu (desktop) or bottom action sheet (mobile). */
export function StudioDmContextMenu({
  x,
  y,
  items,
  onClose,
  title = "Actions",
}: StudioDmContextMenuProps) {
  const { isMobile } = useMobileLayout();
  const isSheet = isMobile;
  const ref = useRef<HTMLDivElement | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  useMobileBackLayer("dm-context-menu", isSheet, onClose);

  useEffect(() => {
    setConfirmKey(null);
  }, [items.map((item) => item.key).join("|")]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmKey) {
          setConfirmKey(null);
          return;
        }
        onClose();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (isSheet) return;
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [confirmKey, isSheet, onClose]);

  useEffect(() => {
    if (isSheet) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [isSheet, x, y, items.length, confirmKey]);

  if (typeof document === "undefined") return null;

  const portalRoot =
    (isSheet
      ? document.querySelector(".studio-polish")
      : null) ?? document.body;

  const activateItem = (item: StudioDmContextMenuItem) => {
    if (itemNeedsConfirm(item)) {
      if (confirmKey !== item.key) {
        setConfirmKey(item.key);
        return;
      }
      setConfirmKey(null);
      item.onSelect();
      onClose();
      return;
    }
    setConfirmKey(null);
    item.onSelect();
    onClose();
  };

  const itemButtons = items.map((item) => {
    const armed = confirmKey === item.key;
    const label = armed ? "Tap to confirm delete" : item.label;
    return (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        className={`cursor-tab-context-item${item.danger ? " is-danger" : ""}${armed ? " is-confirm" : ""}`}
        onClick={() => activateItem(item)}
        aria-label={armed ? `Confirm: ${item.label}` : item.label}
      >
        {item.icon}
        <span>{label}</span>
      </button>
    );
  });

  if (isSheet) {
    return createPortal(
      <DmContextMobileSheet onClose={onClose} ariaLabel={title}>
        {itemButtons}
      </DmContextMobileSheet>,
      portalRoot,
    );
  }

  return createPortal(
    <div
      ref={ref}
      className="cursor-tab-context-menu studio-dm-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {itemButtons}
    </div>,
    document.body,
  );
}
