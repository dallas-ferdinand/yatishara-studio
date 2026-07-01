// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import { FileEntryThumb } from "./FileEntryThumb";
import { explorerEntryIcon } from "@/desk/lib/file-kind";
import { formatFileDate } from "@/desk/lib/explorer-file-actions";
import { writeExplorerDragData } from "@/desk/lib/explorer-dnd";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { withSearchSections, searchResultMeta } from "@/desk/lib/explorer-search";
import { displayEntryPath } from "@/desk/lib/display-path";
import { useState } from "react";

function parentEntry(parent) {
  if (!parent) return null;
  if (typeof parent === "object" && parent.type === "parent") return parent;
  const path = typeof parent === "string" ? parent : parent.path;
  if (path == null) return null;
  return { type: "parent", path: String(path) };
}

function flatList(flatEntries, pinnedShortcuts = []) {
  const list = [];
  const pinPaths = new Set((pinnedShortcuts ?? []).map((p) => p.path));

  const parent = parentEntry(flatEntries?.parent);
  if (parent) list.push(parent);
  const entries = flatEntries?.entries ?? [];
  for (const entry of entries) {
    if (pinPaths.has(entry.path)) continue;
    list.push(entry);
  }
  return list;
}

function buildDisplayList(flatEntries, pinnedShortcuts) {
  const pins = (pinnedShortcuts ?? []).map((p) => ({ ...p, isPinnedShortcut: true }));
  const rows = flatList(flatEntries, pins);
  const parent = rows.find((e) => e.type === "parent");
  const rest = rows.filter((e) => e.type !== "parent");
  return [...(parent ? [parent] : []), ...pins, ...rest];
}

function buildSearchList(searchResults, searchScope, pinnedShortcuts) {
  const pins = (pinnedShortcuts ?? []).map((p) => ({ ...p, isPinnedShortcut: true }));
  const rows = withSearchSections(searchResults ?? [], searchScope);
  return [...pins, ...rows];
}

function isPinnedEntry(entry, pinnedPaths) {
  if (!entry || entry.type === "parent" || entry.type === "search-divider") return false;
  if (entry.isPinnedShortcut) return true;
  return entry.type === "dir" && pinnedPaths?.has?.(entry.path);
}

function setTransparentDragImage(dataTransfer) {
  if (!dataTransfer || typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.className = "desk-file-drag-native-ghost";
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 1, 1);
  window.requestAnimationFrame(() => ghost.remove());
}

function startFileDragPreview(event, entry) {
  if (typeof document === "undefined") return;
  const source = event.currentTarget;
  if (!source) return;

  const rect = source.getBoundingClientRect();
  const label = entry.name ?? entry.path?.split("/").pop() ?? "Item";
  const isMedia = entry.kindLabel === "image" || entry.kindLabel === "video" || entry.mimeType?.startsWith("image/") || entry.mimeType?.startsWith("video/");

  let preview;
  if (isMedia) {
    const srcUrl = entry.thumbnailUrl || entry.mediaUrl;
    const isVideo = entry.kindLabel === "video" || entry.mimeType?.startsWith("video/");
    const baseSize = Math.min(Math.max(80, Math.min(rect.width, rect.height) * 0.48), 100);
    const chipWidth = baseSize;
    const chipHeight = isVideo ? Math.round(baseSize * 0.5625) : baseSize;
    const br = isVideo ? Math.round(chipHeight * 0.22) : Math.round(baseSize * 0.18);

    preview = document.createElement("div");
    preview.style.position = "fixed";
    preview.style.left = "0";
    preview.style.top = "0";
    preview.style.width = `${chipWidth}px`;
    preview.style.height = `${chipHeight}px`;
    preview.style.zIndex = "99999";
    preview.style.pointerEvents = "none";
    preview.style.borderRadius = `${br}px`;
    preview.style.overflow = "hidden";
    preview.style.boxShadow = "0 8px 24px rgb(0 0 0 / 0.45)";
    preview.style.transformOrigin = "top left";
    preview.style.willChange = "transform";
    preview.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1)`;

    const img = document.createElement("img");
    img.src = srcUrl || "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.draggable = false;
    preview.appendChild(img);

    const gradient = document.createElement("div");
    gradient.style.position = "absolute";
    gradient.style.inset = "0";
    gradient.style.background = "linear-gradient(135deg, rgba(0,0,0,0.35) 0%, transparent 50%)";
    gradient.style.pointerEvents = "none";
    preview.appendChild(gradient);

    document.body.appendChild(preview);

    const offsetX = chipWidth * 0.5;
    const offsetY = chipHeight * 0.5;

    let lastX = event.clientX;
    let lastY = event.clientY;
    let rafId = 0;

    const move = () => {
      rafId = 0;
      preview.style.transition = "none";
      preview.style.transform = `translate3d(${lastX - offsetX}px, ${lastY - offsetY}px, 0) scale(1)`;
    };

    const queueMove = (clientX, clientY) => {
      if (clientX > 0 || clientY > 0) {
        lastX = clientX;
        lastY = clientY;
      }
      if (!rafId) rafId = window.requestAnimationFrame(move);
    };

    const handleMove = (moveEvent) => queueMove(moveEvent.clientX, moveEvent.clientY);
    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      preview.remove();
      document.removeEventListener("dragover", handleMove);
      document.removeEventListener("drag", handleMove);
      document.removeEventListener("drop", cleanup);
      document.removeEventListener("dragend", cleanup);
    };

    document.addEventListener("dragover", handleMove);
    document.addEventListener("drag", handleMove);
    document.addEventListener("drop", cleanup, { once: true });
    document.addEventListener("dragend", cleanup, { once: true });

    window.requestAnimationFrame(() => {
      preview.style.transition = "transform 440ms cubic-bezier(0.18, 1.32, 0.32, 1)";
      preview.style.transform = `translate3d(${event.clientX - offsetX}px, ${event.clientY - offsetY}px, 0) scale(1)`;
    });
  } else {
    preview = source.cloneNode(true);
    const targetWidth = Math.min(Math.max(label.length * 7 + 50, 96), 164);
    const targetHeight = Math.min(rect.height, 74);
    const offsetX = Math.min(event.clientX - rect.left, targetWidth * 0.42);
    const offsetY = Math.min(event.clientY - rect.top, targetHeight * 0.55);

    preview.classList.add("desk-file-drag-preview");
    preview.style.width = `${rect.width}px`;
    preview.style.height = `${rect.height}px`;
    preview.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1)`;
    preview.dataset.dragName = label;
    document.body.appendChild(preview);

    let lastX = event.clientX;
    let lastY = event.clientY;
    let rafId = 0;

    const move = () => {
      rafId = 0;
      preview.style.transform = `translate3d(${lastX - offsetX}px, ${lastY - offsetY}px, 0) scale(1)`;
    };

    const queueMove = (clientX, clientY) => {
      if (clientX > 0 || clientY > 0) {
        lastX = clientX;
        lastY = clientY;
      }
      if (!rafId) rafId = window.requestAnimationFrame(move);
    };

    const handleMove = (moveEvent) => queueMove(moveEvent.clientX, moveEvent.clientY);
    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      preview.remove();
      document.removeEventListener("dragover", handleMove);
      document.removeEventListener("drag", handleMove);
      document.removeEventListener("drop", cleanup);
      document.removeEventListener("dragend", cleanup);
    };

    document.addEventListener("dragover", handleMove);
    document.addEventListener("drag", handleMove);
    document.addEventListener("drop", cleanup, { once: true });
    document.addEventListener("dragend", cleanup, { once: true });

    window.requestAnimationFrame(() => {
      preview.style.width = `${targetWidth}px`;
      preview.style.height = `${targetHeight}px`;
      preview.classList.add("is-shrunk");
      queueMove(event.clientX, event.clientY);
    });
  }
}

function ExplorerEmpty({ flatEntries, rootEntries }) {
  if (rootEntries?.error || flatEntries?.error) {
    return (
      <div className="cursor-tree-empty text-red-400/90">
        {rootEntries?.error ?? flatEntries?.error}
      </div>
    );
  }
  return null;
}

function FileEntryButton({
  entry,
  className,
  label,
  children,
  onOpen,
  enableLongPress,
  onLongPress,
  onContextMenu,
  onDragStart,
  onDropEntry,
}) {
  const { longPressHandlers, longPressFired, clearLongPressFired } = useLongPress(
    enableLongPress && onLongPress ? () => onLongPress(entry) : undefined,
  );

  const isDir = entry.type === "dir";
  const [dragOver, setDragOver] = useState(false);

  return (
    <button
      type="button"
      className={`${className}${dragOver ? " is-drag-over" : ""}`}
      title={entry.path ? displayEntryPath(entry) : label}
      onClick={() => {
        if (longPressFired()) {
          clearLongPressFired();
          return;
        }
        onOpen();
      }}
      onContextMenu={onContextMenu}
      draggable={entry.type !== "parent"}
      onDragStart={onDragStart}
      onDragOver={isDir && onDropEntry ? (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      } : undefined}
      onDragLeave={isDir && onDropEntry ? () => setDragOver(false) : undefined}
      onDrop={isDir && onDropEntry ? (e) => {
        e.preventDefault();
        setDragOver(false);
        onDropEntry(e, entry);
      } : undefined}
      {...longPressHandlers}
    >
      {children ?? (
        <>
          <Icon
            name={entry.type === "parent" ? "chevL" : explorerEntryIcon(entry)}
            size={15}
            className="text-cursor-muted shrink-0"
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </button>
  );
}

function treeScrollProps(onBlankContextMenu) {
  if (!onBlankContextMenu) return {};
  return {
    onContextMenu: (ev) => {
      if (ev.target.closest("button")) return;
      ev.preventDefault();
      onBlankContextMenu(ev.clientX, ev.clientY);
    },
  };
}

function SearchDivider({ label }) {
  return (
    <div className="desk-file-search-divider" role="separator" aria-label={label}>
      {label}
    </div>
  );
}

function entryRowKey(entry, index) {
  return `${entry.type ?? "entry"}:${entry.path ?? entry.name ?? ".."}:${index}`;
}

function renderEntryRows({
  list,
  viewMode,
  workspaceId,
  pinnedPaths,
  searchScope,
  searchActive,
  onEntry,
  onEntryLongPress,
  onEntryContextMenu,
  onEntryDragStart,
  onEntryDrop,
  enableLongPress,
  rowClass,
  pinnedFolderIconClass,
  entryLabel,
  entryMeta,
}) {
  if (viewMode === "preview") {
    return (
      <div className="desk-file-preview-grid">
        {list.map((e, index) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
          }
          const label = entryLabel(e);
          return (
            <FileEntryButton
              key={entryRowKey(e, index)}
              entry={e}
              className={rowClass(e, "desk-file-preview-item")}
              label={label}
              onOpen={() => onEntry(e)}
              enableLongPress={enableLongPress}
              onLongPress={onEntryLongPress}
              onContextMenu={(ev) => onEntryContextMenu(ev, e)}
              onDragStart={(ev) => onEntryDragStart(ev, e)}
              onDropEntry={onEntryDrop}
            >
              <FileEntryThumb entry={e} workspaceId={workspaceId} size="preview" pinned={isPinnedEntry(e, pinnedPaths)} />
            </FileEntryButton>
          );
        })}
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="cursor-file-grid">
        {list.map((e, index) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
          }
          const label = entryLabel(e);
          if (e.type === "parent") {
            return (
              <FileEntryButton
                key={entryRowKey(e, index)}
                entry={e}
                className={rowClass(e, "desk-file-list-row desk-file-grid-back-row")}
                label="Back"
                onOpen={() => onEntry(e)}
                enableLongPress={enableLongPress}
                onLongPress={onEntryLongPress}
                onContextMenu={(ev) => onEntryContextMenu(ev, e)}
                onDragStart={(ev) => onEntryDragStart(ev, e)}
              >
                <span className="desk-file-list-name">
                  <Icon name="chevL" size={16} className="text-cursor-muted shrink-0" />
                  <span className="truncate">Back</span>
                </span>
              </FileEntryButton>
            );
          }
          return (
            <FileEntryButton
              key={entryRowKey(e, index)}
              entry={e}
              className={rowClass(e, "desk-file-grid-item")}
              label={label}
              onOpen={() => onEntry(e)}
              enableLongPress={enableLongPress}
              onLongPress={onEntryLongPress}
              onContextMenu={(ev) => onEntryContextMenu(ev, e)}
              onDragStart={(ev) => onEntryDragStart(ev, e)}
              onDropEntry={onEntryDrop}
            >
              <FileEntryThumb entry={e} workspaceId={workspaceId} size="grid" pinned={isPinnedEntry(e, pinnedPaths)} />
            </FileEntryButton>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="desk-file-list-head" aria-hidden>
        <span className="desk-file-list-head-name">Content</span>
        <span className="desk-file-list-head-meta">{searchActive ? "Found in" : "Updated"}</span>
      </div>
      {list.map((e, index) => {
        if (e.type === "search-divider") {
          return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
        }
        const label = entryLabel(e);
        const metaDate = entryMeta(e, searchActive, searchScope);
        return (
          <FileEntryButton
            key={entryRowKey(e, index)}
            entry={e}
            className={rowClass(e, "desk-file-list-row")}
            label={label}
            onOpen={() => onEntry(e)}
            enableLongPress={enableLongPress}
            onLongPress={onEntryLongPress}
            onContextMenu={(ev) => onEntryContextMenu(ev, e)}
            onDragStart={(ev) => onEntryDragStart(ev, e)}
          >
            <span className="desk-file-list-name">
              <Icon
                name={e.type === "parent" ? "chevL" : explorerEntryIcon(e)}
                size={16}
                className={pinnedFolderIconClass(e)}
              />
              <span className="truncate">{label}</span>
            </span>
            <span className="desk-file-list-meta">{metaDate}</span>
          </FileEntryButton>
        );
      })}
    </>
  );
}

export function FileTree({
  viewMode = "list",
  rootEntries,
  listDir,
  onOpenFile,
  flatEntries,
  onNavigate,
  searchQuery = "",
  searchScope = "",
  searchResults = [],
  searchBusy = false,
  searchTruncated = false,
  workspaceId = "mercuryos",
  pinnedPaths,
  pinnedShortcuts = [],
  enableLongPress = false,
  onEntryLongPress,
  onEntryContextMenu,
  onBlankContextMenu,
  onEntryDrop,
}) {
  void listDir;
  const searchActive = Boolean(searchQuery.trim());
  const empty = ExplorerEmpty({ flatEntries, rootEntries });
  if (empty) return empty;

  const list = searchActive
    ? buildSearchList(searchResults, searchScope, pinnedShortcuts)
    : buildDisplayList(flatEntries, pinnedShortcuts);

  if (!list.length && (rootEntries?.loading || flatEntries?.loading)) {
    return <div className="flex-1 overflow-y-auto min-h-0" {...treeScrollProps(onBlankContextMenu)} />;
  }

  if (!list.length) {
    const q = searchQuery.trim();
    return (
      <div
        className="flex-1 overflow-y-auto min-h-0 cursor-tree-empty-area"
        {...treeScrollProps(onBlankContextMenu)}
      >
        <div className="cursor-tree-empty">
          {q ? (searchBusy ? "Searching…" : "No matching files") : "Empty folder"}
        </div>
      </div>
    );
  }

  const onEntry = (e) => {
    const isDir = e.type === "dir";
    const name = e.name ?? e.path?.split("/").pop() ?? "?";
    if (e.type === "parent") onNavigate(e.path, e);
    else if (isDir) onNavigate(e.path, e);
    else onOpenFile(e.path, name, { size: e.size, mtimeMs: e.mtimeMs });
  };

  const onEntryDragStart = (e, entry) => {
    if (entry.type === "parent") return;
    document.body.classList.add("is-drag-cursor");
    writeExplorerDragData(e.dataTransfer, entry);
    setTransparentDragImage(e.dataTransfer);
    startFileDragPreview(e, entry);
    const cleanupDragCursor = () => {
      document.body.classList.remove("is-drag-cursor");
      document.removeEventListener("drop", cleanupDragCursor);
      document.removeEventListener("dragend", cleanupDragCursor);
    };
    document.addEventListener("drop", cleanupDragCursor, { once: true });
    document.addEventListener("dragend", cleanupDragCursor, { once: true });
  };

  const onContext = (ev, entry) => {
    if (!onEntryContextMenu) return;
    ev.preventDefault();
    onEntryContextMenu(entry, ev.clientX, ev.clientY);
  };

  const entryLabel = (e) => (e.type === "parent" ? (e.name ?? "Parent folder") : (e.name ?? e.path?.split("/").pop() ?? "?"));

  const entryMeta = (e, searching, scope) => {
    if (e.type === "parent") return "";
    if (searching) {
      const loc = searchResultMeta(e, scope);
      if (loc) return loc;
    }
    if (e.type === "dir") return "Folder";
    return formatFileDate(e.mtimeMs);
  };

  const pinnedFolderIconClass = (e) =>
    isPinnedEntry(e, pinnedPaths) && (e.type === "dir" || e.isPinnedShortcut)
      ? "desk-file-entry-icon--pinned shrink-0"
      : "text-cursor-muted shrink-0";

  const rowClass = (e, base) => {
    const pinned = isPinnedEntry(e, pinnedPaths);
    return `${base}${pinned ? " is-folder-pinned" : ""}${e.type === "parent" ? " is-parent-row" : ""}`;
  };

  const rows = renderEntryRows({
    list,
    viewMode,
    workspaceId,
    pinnedPaths,
    searchScope,
    searchActive,
    onEntry,
    onEntryLongPress,
    onEntryContextMenu: onContext,
    onEntryDragStart,
    onEntryDrop,
    enableLongPress,
    rowClass,
    pinnedFolderIconClass,
    entryLabel,
    entryMeta,
  });

  return (
    <div className="flex-1 overflow-y-auto min-h-0" {...treeScrollProps(onBlankContextMenu)}>
      {viewMode === "list" ? <div className="desk-file-list">{rows}</div> : rows}
      {searchActive && searchTruncated ? (
        <div className="desk-file-search-truncated" role="status">
          Showing first matches — refine your search
        </div>
      ) : null}
      {searchActive && searchBusy ? (
        <div className="desk-file-search-busy" role="status" aria-live="polite">
          Searching…
        </div>
      ) : null}
    </div>
  );
}
