// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";

const RENAMABLE_STUDIO_KINDS = new Set([
  "asset",
  "document",
  "element",
  "videoEdit",
  "folder",
]);

export function tabCanRename(tab) {
  if (!tab) return false;
  if (tab.canRename === true) return true;
  if (tab.canRename === false) return false;
  const key = String(tab.key ?? "");
  if (key.startsWith("edit:asset:")) return false;
  if (key.startsWith("edit:project:")) return true;
  if (key.startsWith("videoEdit:")) return true;
  if (
    key.startsWith("asset:") ||
    key.startsWith("document:") ||
    key.startsWith("element:")
  ) {
    return true;
  }
  if (tab.studioKind && RENAMABLE_STUDIO_KINDS.has(tab.studioKind)) {
    return Boolean(tab.path) || Boolean(tab.studioKind);
  }
  // Desk workspace file tabs
  if (tab.kind === "file" && tab.path && !tab.studioKind) return true;
  return false;
}

export function tabCanDelete(tab) {
  if (!tab) return false;
  if (tab.canDelete === true) return true;
  if (tab.canDelete === false) return false;
  const key = String(tab.key ?? "");
  if (key.startsWith("edit:asset:")) return false;
  if (
    key.startsWith("edit:project:") ||
    key.startsWith("videoEdit:") ||
    key.startsWith("asset:") ||
    key.startsWith("document:") ||
    key.startsWith("element:")
  ) {
    return true;
  }
  if (tab.studioKind && RENAMABLE_STUDIO_KINDS.has(tab.studioKind)) return true;
  if (tab.kind === "file" && tab.path && !tab.studioKind) return true;
  return false;
}

function buildTabMenuItems(tab) {
  const items = [
    { id: "close", label: "Close tab" },
    { id: "close-others", label: "Close other tabs" },
  ];
  const canRename = tabCanRename(tab);
  const canDelete = tabCanDelete(tab);
  const isStudio =
    Boolean(tab?.studioKind) ||
    String(tab?.key ?? "").startsWith("asset:") ||
    String(tab?.key ?? "").startsWith("document:") ||
    String(tab?.key ?? "").startsWith("element:") ||
    String(tab?.key ?? "").startsWith("videoEdit:") ||
    String(tab?.key ?? "").startsWith("edit:project:");

  if (canRename || canDelete) {
    items.push({ id: "sep-actions", sep: true });
    if (canRename) items.push({ id: "rename", label: "Rename" });
    if (canDelete) {
      items.push({
        id: "delete",
        label: isStudio ? "Move to trash" : "Delete",
        danger: true,
      });
    }
  }

  if (tab?.kind === "file" && tab?.path && !isStudio) {
    items.push({ id: "sep-file", sep: true });
    items.push({ id: "add-to-composer", label: "Add to chat context" });
    items.push({ id: "reveal-explorer", label: "Reveal in explorer" });
    items.push({ id: "open-external", label: "Open externally" });
  } else if (isStudio && (tab?.studioKind === "asset" || tab?.studioKind === "element" || tab?.studioKind === "document" || tab?.studioKind === "videoEdit")) {
    items.push({ id: "sep-studio", sep: true });
    items.push({ id: "attach", label: "Use in chat" });
    items.push({ id: "reveal-explorer", label: "Reveal in explorer" });
  }

  return items;
}

export function TabContextMenu({ tab, x, y, onClose, onAction }) {
  const menuRef = useRef(null);
  const items = useMemo(() => buildTabMenuItems(tab), [tab]);
  const open = Boolean(tab) && typeof document !== "undefined";
  const pos = useFloatingMenuPosition(x, y, menuRef, open, [items.length, tab?.key, tab?.kind]);

  useEffect(() => {
    if (!tab) return;
    const onDoc = (e) => {
      if (e.type === "contextmenu") return;
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("scroll", onDoc, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [tab, onClose]);

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
            className={`cursor-tab-context-item${item.danger ? " is-danger" : ""}`}
            role="menuitem"
            onClick={() => {
              onAction(item.id);
              onClose();
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
