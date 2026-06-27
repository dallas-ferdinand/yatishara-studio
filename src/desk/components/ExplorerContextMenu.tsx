// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";

function buildMenuItems(entry, {
  pinnedPaths,
  currentPath,
  canCreateFile,
  canCreateFolder,
  onRequestRename,
  onRequestDelete,
}) {
  if (!entry) return [];

  const isBlank = entry.type === "blank";
  const isParent = entry.type === "parent";
  const isDir = entry.type === "dir" || isParent;
  const isFile = !isDir && !isBlank;

  const items = [];
  if (isBlank) {
    if (canCreateFile) items.push({ id: "new-file", label: "New file" });
    if (canCreateFolder) items.push({ id: "new-folder", label: "New folder" });
    if (canCreateFile || canCreateFolder) items.push({ id: "sep-blank", sep: true });
    items.push({ id: "refresh", label: "Refresh" });
  } else if (isParent) {
    items.push({ id: "open", label: "Go up" });
  } else if (isDir) {
    if (canCreateFile) items.push({ id: "new-file", label: "New file" });
    if (canCreateFolder) items.push({ id: "new-folder", label: "New folder" });
    if (canCreateFile || canCreateFolder) items.push({ id: "sep-dir-new", sep: true });
    items.push({ id: "open", label: "Open folder" });
  } else {
    items.push({ id: "open", label: "Open" });
  }

  if (!isBlank) {
    if (isDir && !isParent) {
      const pinnedHere = pinnedPaths?.has?.(entry.path);
      if (pinnedHere) {
        items.push({ id: "unpin", label: "Unpin folder" });
      } else {
        if (currentPath) items.push({ id: "pin-root", label: "Pin to root" });
        items.push({ id: "pin-here", label: currentPath ? "Pin here" : "Pin folder" });
      }
    }
    items.push({ id: "copy-path", label: "Copy path" });
    if (isDir && !isParent) items.push({ id: "download-zip", label: "Download as ZIP" });
    if (isFile) items.push({ id: "download", label: "Download" });
    if (!isParent && onRequestRename) items.push({ id: "rename", label: "Rename" });
    items.push({ id: "sep-1", sep: true });
    if (!isParent) items.push({ id: "attach", label: isDir ? "Add folder" : "Add here" });
    if (!isParent && onRequestDelete) {
      items.push({ id: "sep-2", sep: true });
      items.push({ id: "delete", label: isDir ? "Delete folder" : "Delete", danger: true });
    }
  }

  return items;
}

export function ExplorerContextMenu({
  entry,
  x,
  y,
  onClose,
  onAction,
  onRequestDelete,
  onRequestRename,
  pinnedPaths,
  currentPath = "",
  canCreateFile = false,
  canCreateFolder = false,
}) {
  const menuRef = useRef(null);
  const open = Boolean(entry) && typeof document !== "undefined";

  const items = useMemo(
    () =>
      buildMenuItems(entry, {
        pinnedPaths,
        currentPath,
        canCreateFile,
        canCreateFolder,
        onRequestRename,
        onRequestDelete,
      }),
    [
      entry,
      pinnedPaths,
      currentPath,
      canCreateFile,
      canCreateFolder,
      onRequestRename,
      onRequestDelete,
    ],
  );

  const pos = useFloatingMenuPosition(x, y, menuRef, open, [items.length, entry?.path, entry?.type]);

  useEffect(() => {
    if (!entry) return;
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
  }, [entry, onClose]);

  if (!open) return null;

  const runAction = (actionId) => {
    if (actionId === "delete") {
      onRequestDelete?.(entry, { x, y });
      return;
    }
    if (actionId === "rename") {
      onRequestRename?.(entry, { x, y });
      return;
    }
    onAction?.(actionId, entry, { x, y });
  };

  return createPortal(
    <div
      ref={menuRef}
      className="cursor-tab-context-menu desk-explorer-context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
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
            onClick={(e) => {
              e.stopPropagation();
              runAction(item.id);
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
