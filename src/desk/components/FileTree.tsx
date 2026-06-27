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

function setCompactDragImage(dataTransfer, entry) {
  if (!dataTransfer || typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.className = "desk-file-drag-ghost";
  ghost.textContent = entry.name ?? entry.path?.split("/").pop() ?? "Item";
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 18, 16);
  window.requestAnimationFrame(() => ghost.remove());
}

function ExplorerEmpty({ flatEntries, rootEntries }) {
  if (!rootEntries && !flatEntries) {
    return <FileTreeSkeleton />;
  }
  if (rootEntries?.loading || flatEntries?.loading) {
    return <FileTreeSkeleton />;
  }
  if (rootEntries?.error || flatEntries?.error) {
    return (
      <div className="cursor-tree-empty text-red-400/90">
        {rootEntries?.error ?? flatEntries?.error}
      </div>
    );
  }
  return null;
}

function FileTreeSkeleton() {
  return (
    <div className="flex-1 overflow-hidden min-h-0 desk-file-skeleton" aria-label="Loading files">
      <div className="desk-file-list-head" aria-hidden>
        <span className="desk-file-list-head-name">Name</span>
        <span className="desk-file-list-head-meta">Modified</span>
      </div>
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="desk-file-list-row desk-file-skeleton-row" aria-hidden>
          <span className="desk-file-list-name">
            <span className="desk-file-skeleton-icon" />
            <span className="desk-file-skeleton-line" style={{ width: `${58 + (index % 3) * 11}%` }} />
          </span>
          <span className="desk-file-skeleton-meta" />
        </div>
      ))}
    </div>
  );
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
        {list.map((e) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={e.path} label={e.name} />;
          }
          const label = entryLabel(e);
          return (
            <FileEntryButton
              key={e.path ?? ".."}
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
        {list.map((e) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={e.path} label={e.name} />;
          }
          const label = entryLabel(e);
          return (
            <FileEntryButton
              key={e.path ?? ".."}
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
        <span className="desk-file-list-head-name">Name</span>
        <span className="desk-file-list-head-meta">{searchActive ? "Location" : "Modified"}</span>
      </div>
      {list.map((e) => {
        if (e.type === "search-divider") {
          return <SearchDivider key={e.path} label={e.name} />;
        }
        const label = entryLabel(e);
        const metaDate = entryMeta(e, searchActive, searchScope);
        return (
          <FileEntryButton
            key={e.path ?? ".."}
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
    setCompactDragImage(e.dataTransfer, entry);
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
      {viewMode === "list" ? <div className="py-0.5">{rows}</div> : rows}
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
