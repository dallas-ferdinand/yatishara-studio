// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import { FileEntryThumb } from "./FileEntryThumb";
import { explorerEntryIcon } from "@/desk/lib/file-kind";
import { formatFileDate } from "@/desk/lib/explorer-file-actions";
import { writeExplorerDragData } from "@/desk/lib/explorer-dnd";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { withSearchSections, searchResultMeta } from "@/desk/lib/explorer-search";

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
  const preview = source.cloneNode(true);
  const label = entry.name ?? entry.path?.split("/").pop() ?? "Item";
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
}) {
  const { longPressHandlers, longPressFired, clearLongPressFired } = useLongPress(
    enableLongPress && onLongPress ? () => onLongPress(entry) : undefined,
  );

  return (
    <button
      type="button"
      className={className}
      title={entry.path || label}
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
    writeExplorerDragData(e.dataTransfer, entry);
    setTransparentDragImage(e.dataTransfer);
    startFileDragPreview(e, entry);
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
