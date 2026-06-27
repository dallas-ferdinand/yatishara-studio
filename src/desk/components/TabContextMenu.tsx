// @ts-nocheck
"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";

const CHAT_ITEMS = [
  { id: "close", label: "Close tab" },
  { id: "close-others", label: "Close other tabs" },
];

const FILE_ITEMS = [
  { id: "close", label: "Close tab" },
  { id: "close-others", label: "Close other tabs" },
  { id: "sep-1", sep: true },
  { id: "add-to-composer", label: "Add to chat context" },
  { id: "reveal-explorer", label: "Reveal in explorer" },
  { id: "open-external", label: "Open externally" },
];

export function TabContextMenu({ tab, x, y, onClose, onAction }) {
  const menuRef = useRef(null);
  const items = tab?.kind === "file" ? FILE_ITEMS : CHAT_ITEMS;
  const open = Boolean(tab) && typeof document !== "undefined";
  const pos = useFloatingMenuPosition(x, y, menuRef, open, [items.length, tab?.kind]);

  if (!open) return null;

  const menu = (
    <div
      ref={menuRef}
      className="cursor-tab-context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) =>
        item.sep ? (
          <div key={item.id} className="cursor-tab-context-sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            className="cursor-tab-context-item"
            role="menuitem"
            onClick={() => onAction(item.id)}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
