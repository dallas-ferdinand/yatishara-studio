"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { REACTION_EMOJIS } from "@/studio/lib/itemReactions";
import { StudioEmoji } from "@/studio/components/StudioEmoji";
import "./file-reaction-picker.css";

type SheetDragState = {
  startY: number;
  lastY: number;
  lastT: number;
  vy: number;
};

export type FileReactionPickerProps = {
  open: boolean;
  currentEmoji?: string | null;
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
  /** sheet = mobile bottom sheet; menu = desktop floating picker */
  presentation?: "sheet" | "menu";
  /** Anchor for menu presentation (viewport coords). */
  anchor?: { x: number; y: number } | null;
  /** Desktop menu: keep open while pointer is over picker (badge hover bridge). */
  onHoverKeep?: () => void;
  /** Desktop menu: schedule close when pointer leaves picker. */
  onHoverLeave?: () => void;
};

/**
 * File-manager reaction picker — mobile bottom sheet or desktop floating menu.
 */
export function FileReactionPicker({
  open,
  currentEmoji,
  onSelect,
  onClose,
  presentation = "sheet",
  anchor = null,
  onHoverKeep,
  onHoverLeave,
}: FileReactionPickerProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const dragRef = useRef<SheetDragState | null>(null);
  const offsetRef = useRef(0);
  const isMenu = presentation === "menu";

  function clearLeaveTimer() {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }

  function scheduleLeaveClose() {
    if (onHoverLeave) {
      onHoverLeave();
      return;
    }
    clearLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      onClose();
    }, 160);
  }

  function keepOpen() {
    if (onHoverKeep) {
      onHoverKeep();
      return;
    }
    clearLeaveTimer();
  }

  useEffect(() => () => clearLeaveTimer(), []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !isMenu || !anchor) return;
    const width = 168;
    const height = 220;
    let left = anchor.x;
    let top = anchor.y;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - height - 8);
    setMenuPos({ left, top });
    const frame = window.requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      let nextLeft = anchor.x;
      let nextTop = anchor.y;
      if (nextLeft + box.width > window.innerWidth - 8) {
        nextLeft = Math.max(8, anchor.x - box.width);
      }
      if (nextTop + box.height > window.innerHeight - 8) {
        nextTop = Math.max(8, anchor.y - box.height);
      }
      setMenuPos({ left: nextLeft, top: nextTop });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, isMenu, anchor?.x, anchor?.y]);

  useEffect(() => {
    if (!open || !isMenu) return;
    const onDoc = (event: MouseEvent) => {
      const t = event.target as Node;
      if (menuRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, isMenu, onClose]);

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

  if (!open || typeof document === "undefined") return null;

  const portalRoot =
    document.querySelector(".studio-polish") ?? document.body;

  const pick = (emoji: string) => {
    if (currentEmoji === emoji) onSelect(null);
    else onSelect(emoji);
  };

  const emojiGrid = (
    <div
      className={isMenu ? "desk-explorer-react-grid" : "studio-file-reaction-grid"}
      role="listbox"
      aria-label="Reactions"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="option"
          aria-selected={currentEmoji === emoji}
          className={`${isMenu ? "desk-explorer-react-emoji" : "studio-file-reaction-emoji"}${
            currentEmoji === emoji ? " is-active" : ""
          }`}
          onClick={() => pick(emoji)}
        >
          <StudioEmoji emoji={emoji} />
        </button>
      ))}
    </div>
  );

  const clearBtn = currentEmoji ? (
    <button
      type="button"
      className={isMenu ? "desk-explorer-react-clear" : "studio-file-reaction-clear"}
      onClick={() => onSelect(null)}
    >
      Clear reaction
    </button>
  ) : null;

  if (isMenu) {
    return createPortal(
      <div
        ref={menuRef}
        className="cursor-tab-context-menu desk-explorer-context-menu desk-explorer-context-submenu is-emoji-grid studio-file-reaction-menu"
        style={{ left: menuPos.left, top: menuPos.top }}
        role="dialog"
        aria-label="React"
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={keepOpen}
        onMouseLeave={scheduleLeaveClose}
      >
        {emojiGrid}
        {clearBtn}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        className="studio-file-reaction-backdrop"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={`studio-mobile-app-menu-sheet studio-file-reaction-sheet${entered ? " is-entered" : " is-entering"}${dragging ? " is-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="React"
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
        <div className="studio-file-reaction-sheet-body">
          {emojiGrid}
          {clearBtn}
        </div>
      </div>
    </>,
    portalRoot,
  );
}
