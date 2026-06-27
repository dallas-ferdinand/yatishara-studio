// @ts-nocheck
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SubmitRevertMode } from "@/desk/lib/agent-run";

/** Solid dropdown anchored below the inline composer send button. */
export function SubmitRevertDialog({ open, anchorEl, onClose, onChoose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }

    const update = () => {
      const anchor = anchorEl;
      const menuEl = menuRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const menuWidth = Math.min(280, window.innerWidth - 16);
      let left = r.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      const menuHeight = menuEl?.offsetHeight ?? 200;
      let top = r.bottom + 8;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, r.top - menuHeight - 8);
      }
      setPos({ left, top, width: menuWidth });
    };

    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (anchorEl?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      className="cursor-submit-revert-popover"
      role="menu"
      aria-label="Send edited message"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: pos?.width ?? 280,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <p className="cursor-submit-revert-popover-title">Send edited message</p>
      <button
        type="button"
        className="cursor-submit-revert-popover-primary"
        onClick={() => onChoose(SubmitRevertMode.full)}
      >
        Revert chat &amp; send
      </button>
      <button type="button" className="cursor-submit-revert-popover-item" onClick={() => onChoose(SubmitRevertMode.chatOnly)}>
        Chat revert only
      </button>
      <button type="button" className="cursor-submit-revert-popover-item" onClick={() => onChoose(SubmitRevertMode.codeOnly)}>
        Code revert only
      </button>
      <button type="button" className="cursor-submit-revert-popover-item" onClick={() => onChoose(SubmitRevertMode.none)}>
        Send again <span className="cursor-submit-revert-hint">keep history</span>
      </button>
    </div>,
    document.body,
  );
}
