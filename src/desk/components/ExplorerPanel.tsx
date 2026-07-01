// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";
import { FileTree } from "./FileTree";
import { FileBreadcrumbs } from "./FileBreadcrumbs";
import { ExplorerContextMenu } from "./ExplorerContextMenu";
import { MobileActionSheet } from "./MobileActionSheet";
import { PanelSearchBar } from "./PanelSearchBar";
import { SidebarBrand } from "./SidebarBrand";
import { ExplorerDeleteConfirm } from "./ExplorerDeleteConfirm";
import { ExplorerCreateDialog } from "./ExplorerCreateDialog";
import { ExplorerRenameDialog } from "./ExplorerRenameDialog";
import { ExplorerViewMenu } from "./ExplorerViewMenu";
import { getSession, searchFiles as apiSearchFiles } from "@mos-app/api.js";
import {
  loadPinnedFolders,
  addPinnedFolder,
  removePinnedFolder,
  removePinnedFoldersUnder,
  renamePinnedFolders,
  pinnedPathsSet,
  isFolderPinned,
  normalizeExplorerPath,
} from "@/desk/lib/explorer-pins";
import {
  copyWorkspacePath,
  downloadWorkspaceFile,
  downloadWorkspaceFolder,
  deleteWorkspaceFile,
} from "@/desk/lib/explorer-file-actions";
import { destLabel } from "@/desk/lib/explorer-upload-queue";
import { uploadByteProgressLabel, formatUploadBytes } from "@/desk/lib/upload-progress-format";
import { displayWorkspacePath } from "@/desk/lib/display-path";

const VIEW_KEY = "desk-explorer-view";
const VIEW_MODES = ["list", "grid", "preview"];

function loadViewMode() {
  if (typeof window === "undefined") return "list";
  const v = sessionStorage.getItem(VIEW_KEY);
  if (VIEW_MODES.includes(v)) return v;
  const mobile = window.matchMedia("(max-width: 899px)").matches;
  return mobile ? "grid" : "list";
}

function saveViewMode(mode) {
  try {
    sessionStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

function UploadProgressPill({ upload, destLabelText, onDismiss, onRetry }) {
  const target =
    upload.relativePath && upload.relativePath !== upload.name ? upload.relativePath : upload.name;
  const tooltip = `${target} → ${destLabelText}`;
  const progress =
    upload.status === "done" ? 100 : upload.status === "error" ? 100 : Math.max(0, upload.progress ?? 0);

  const byteLabel = uploadByteProgressLabel(upload);

  let label = target;
  if (upload.status === "error") label = upload.error ?? "Upload failed";
  if (upload.status === "done") label = `Done · ${target}`;
  if (upload.status === "uploading") {
    if (byteLabel) label = `${target} · ${byteLabel}`;
    else if (progress > 0 && progress < 100) label = `${target} · ${progress}%`;
  }

  const showRetry = upload.status === "error" && onRetry;
  const showDismiss =
    onDismiss &&
    (upload.status === "uploading" || upload.status === "error" || upload.status === "done");

  return (
    <div
      className={`desk-upload-pill desk-upload-pill--${upload.status}`}
      title={tooltip}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label={tooltip}
    >
      <div className="desk-upload-pill-track">
        <div className="desk-upload-pill-fill" style={{ width: `${progress}%` }} />
        <div className="desk-upload-pill-content">
          <span className="desk-upload-pill-text">{label}</span>
          {(showRetry || showDismiss) && (
            <div className="desk-upload-pill-actions">
              {showRetry ? (
                <button
                  type="button"
                  className="desk-upload-pill-btn is-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                >
                  Restart
                </button>
              ) : null}
              {showDismiss ? (
                <button
                  type="button"
                  className="desk-upload-pill-btn desk-upload-pill-dismiss"
                  aria-label={upload.status === "uploading" ? "Cancel upload" : "Dismiss"}
                  title={upload.status === "uploading" ? "Cancel upload" : "Dismiss"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Indeterminate/percent download progress pill for folder ZIP downloads. */
function DownloadProgressPill({ download, onCancel, onDismiss }) {
  const { name, status, received, total, error } = download;
  const indeterminate = !total && status === "downloading";
  const progress =
    status === "done" ? 100 : status === "error" ? 100 : total ? Math.min(99, Math.round((received / total) * 100)) : 0;
  let label = name;
  if (status === "downloading") {
    label = total ? `${name} · ${progress}%` : `${name} · ${formatUploadBytes(received)}`;
  }
  if (status === "done") label = `Done · ${name}`;
  if (status === "error") label = error || "Download failed";
  const fillClass = `desk-upload-pill-fill${indeterminate ? " is-indeterminate" : ""}`;
  const fillStyle = indeterminate ? undefined : { width: `${progress}%` };
  const pillClass = `desk-upload-pill desk-upload-pill--${status === "downloading" ? "uploading" : status}`;
  return (
    <div
      className={pillClass}
      title={label}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label={label}
    >
      <div className="desk-upload-pill-track">
        <div className={fillClass} style={fillStyle} />
        <div className="desk-upload-pill-content">
          <span className="desk-upload-pill-text">{label}</span>
          <div className="desk-upload-pill-actions">
            {status === "downloading" && onCancel ? (
              <button
                type="button"
                className="desk-upload-pill-btn desk-upload-pill-dismiss"
                aria-label="Cancel ZIP download"
                title="Cancel ZIP download"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
              >
                <Icon name="x" size={12} />
              </button>
            ) : null}
            {status !== "downloading" && onDismiss ? (
              <button
                type="button"
                className="desk-upload-pill-btn desk-upload-pill-dismiss"
                aria-label="Dismiss"
                title="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                <Icon name="x" size={12} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExplorerPanel({
  filesPath,
  fileEntries,
  rootEntries,
  listDir,
  onNavigate,
  onOpenFile,
  onRefresh,
  hidePanelHead = false,
  uploadQueue = [],
  onDropFiles,
  onAttachEntry,
  onRetryUpload,
  onDismissUpload,
  onDeleteFile,
  onRenameFile,
  onCreateFile,
  onCreateFolder,
  workspaceId = "mercuryos",
  fullscreen = false,
  onToggleFullscreen,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [sheetEntry, setSheetEntry] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [toast, setToast] = useState("");
  const [downloads, setDownloads] = useState([]);
  const downloadControllers = useRef({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [createMode, setCreateMode] = useState(null);
  const [createDestDir, setCreateDestDir] = useState("");
  const [createEntries, setCreateEntries] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameEntries, setRenameEntries] = useState([]);
  const userId = getSession()?.userId ?? null;
  const [pinnedFolders, setPinnedFolders] = useState([]);
  const currentDir = normalizeExplorerPath(filesPath);

  useEffect(() => {
    setViewMode(loadViewMode());
  }, []);

  useEffect(() => {
    setPinnedFolders(loadPinnedFolders(userId));
  }, [userId]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      setSearchBusy(false);
      setSearchTruncated(false);
      return;
    }
    let cancelled = false;
    setSearchBusy(true);
    const timer = window.setTimeout(() => {
      void apiSearchFiles(currentDir, q, workspaceId)
        .then((data) => {
          if (cancelled) return;
          setSearchResults(data.entries ?? []);
          setSearchTruncated(Boolean(data.truncated));
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchTruncated(false);
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, currentDir, workspaceId]);

  const visiblePins = useMemo(() => {
    const scoped = pinnedFolders.filter((pin) => pin.parentPath === currentDir);
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((pin) => {
      const label = (pin.label ?? "").toLowerCase();
      const path = (pin.path ?? "").toLowerCase();
      return label.includes(q) || path.includes(q);
    });
  }, [pinnedFolders, search, currentDir]);

  const pinnedSet = useMemo(() => pinnedPathsSet(userId, currentDir), [pinnedFolders, userId, currentDir]);

  const handlePinFolder = useCallback(
    (entry, parentPath) => {
      if (!entry || entry.type === "parent" || entry.type !== "dir") return;
      const path = entry.path;
      const name = entry.name ?? path?.split("/").pop() ?? "?";
      const parent = normalizeExplorerPath(parentPath);
      const next = addPinnedFolder(path, name, parent, userId);
      setPinnedFolders(next);
      showToast(parent ? "Pinned here" : "Pinned to root");
    },
    [userId],
  );

  const handleUnpinFolder = useCallback(
    (entry, parentPath) => {
      if (!entry || entry.type === "parent" || entry.type !== "dir") return;
      const path = entry.path;
      const parent = normalizeExplorerPath(parentPath);
      const next = removePinnedFolder(path, parent, userId);
      setPinnedFolders(next);
      showToast("Unpinned");
    },
    [userId],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const setView = (mode) => {
    setViewMode(mode);
    saveViewMode(mode);
  };

  const showToast = (msg) => setToast(msg);

  /** Start a tracked folder ZIP download; reports live bytes to the pill. */
  const startFolderZip = useCallback(
    (path) => {
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const name = `${path.split("/").pop() || "folder"}.zip`;
      const controller = new AbortController();
      downloadControllers.current[id] = controller;
      setDownloads((d) => [
        ...d,
        { id, name, path, status: "downloading", received: 0, total: 0, error: "" },
      ]);
      downloadWorkspaceFolder(path, workspaceId, {
        onProgress: (received, total) =>
          setDownloads((d) => d.map((x) => (x.id === id ? { ...x, received, total } : x))),
        signal: controller.signal,
      })
        .then(() => {
          setDownloads((d) => d.map((x) => (x.id === id ? { ...x, status: "done" } : x)));
          setTimeout(() => {
            setDownloads((d) => d.filter((x) => x.id !== id));
            delete downloadControllers.current[id];
          }, 4500);
        })
        .catch((err) => {
          const aborted = err?.name === "AbortError";
          setDownloads((d) =>
            d.map((x) =>
              x.id === id
                ? { ...x, status: "error", error: aborted ? "Canceled" : err?.message || "Download failed" }
                : x,
            ),
          );
        });
    },
    [workspaceId],
  );

  const cancelDownload = useCallback((id) => {
    downloadControllers.current[id]?.abort();
  }, []);

  const dismissDownload = useCallback((id) => {
    setDownloads((d) => d.filter((x) => x.id !== id));
    delete downloadControllers.current[id];
  }, []);

  const requestDelete = useCallback(
    (entry, anchor) => {
      if (!entry?.path || !onDeleteFile) return;
      const name = entry.name ?? entry.path?.split("/").pop() ?? "?";
      const isDir = entry.type === "dir";
      const x = anchor?.x ?? Math.round(window.innerWidth / 2 - 100);
      const y = anchor?.y ?? Math.round(window.innerHeight - 160);
      setDeleteError("");
      setDeleteConfirm({ entry, name, isDir, x, y });
      setSheetEntry(null);
      setContextMenu(null);
    },
    [onDeleteFile],
  );

  const closeDeleteConfirm = useCallback(() => {
    if (deleteBusy) return;
    setDeleteConfirm(null);
    setDeleteError("");
  }, [deleteBusy]);

  const requestRename = useCallback(
    async (entry) => {
      if (!entry?.path || !onRenameFile) return;
      const parentDir = entry.path.includes("/") ? entry.path.split("/").slice(0, -1).join("/") : "";
      if (parentDir === (filesPath ?? "")) {
        setRenameEntries(fileEntries?.entries ?? []);
      } else if (listDir) {
        try {
          const result = await listDir(parentDir);
          setRenameEntries(result?.entries ?? []);
        } catch {
          setRenameEntries([]);
        }
      } else {
        setRenameEntries([]);
      }
      setRenameTarget(entry);
      setSheetEntry(null);
      setContextMenu(null);
    },
    [onRenameFile, filesPath, fileEntries, listDir],
  );

  const confirmRenameEntry = useCallback(
    async (fromPath, newName) => {
      if (!fromPath || !onRenameFile) return;
      const result = await onRenameFile(fromPath, newName);
      const toPath = result?.path ?? fromPath;
      setPinnedFolders(renamePinnedFolders(fromPath, toPath, userId));
      showToast("Renamed");
      onRefresh?.();
    },
    [onRenameFile, onRefresh, userId],
  );

  const startCreate = useCallback(
    async (mode, destDir) => {
      const dir = destDir ?? filesPath ?? "";
      const here = fileEntries?.entries ?? [];
      setCreateDestDir(dir);
      if (dir === (filesPath ?? "")) {
        setCreateEntries(here);
      } else if (listDir) {
        try {
          const result = await listDir(dir);
          setCreateEntries(result?.entries ?? []);
        } catch {
          setCreateEntries([]);
        }
      } else {
        setCreateEntries([]);
      }
      setCreateMode(mode);
    },
    [filesPath, fileEntries, listDir],
  );

  const confirmDeleteEntry = useCallback(
    async (entry) => {
      if (!entry?.path || !onDeleteFile) return;
      setDeleteBusy(true);
      setDeleteError("");
      try {
        await onDeleteFile(entry.path);
        setPinnedFolders(removePinnedFoldersUnder(entry.path, userId));
        showToast("Deleted");
        onRefresh?.();
        setDeleteConfirm(null);
        setContextMenu(null);
      } catch (err) {
        setDeleteError(err?.message ?? "Delete failed");
      } finally {
        setDeleteBusy(false);
      }
    },
    [onDeleteFile, onRefresh, userId],
  );

  const handleContextAction = useCallback(
    async (action, entry, _anchor) => {
      setContextMenu(null);
      if (!entry) return;

      if (entry.type === "blank") {
        if (action === "new-file" && onCreateFile) {
          void startCreate("file", filesPath);
          return;
        }
        if (action === "new-folder" && onCreateFolder) {
          void startCreate("folder", filesPath);
          return;
        }
        if (action === "refresh") {
          onRefresh?.();
        }
        return;
      }

      const name = entry.name ?? entry.path?.split("/").pop() ?? "?";
      const isParent = entry.type === "parent";
      const isDir = entry.type === "dir" || isParent;

      if (action === "new-file" && onCreateFile && isDir && !isParent) {
        void startCreate("file", entry.path);
        return;
      }
      if (action === "new-folder" && onCreateFolder && isDir && !isParent) {
        void startCreate("folder", entry.path);
        return;
      }

      if (action === "open") {
        if (isParent) {
          onNavigate(filesPath.split("/").filter(Boolean).slice(0, -1).join("/"));
        } else if (isDir) onNavigate(entry.path);
        else onOpenFile(entry.path, name, { size: entry.size, mtimeMs: entry.mtimeMs });
        return;
      }
      if (action === "copy-path") {
        const ok = await copyWorkspacePath(entry.path ?? name);
        showToast(ok ? "Path copied" : "Could not copy");
        return;
      }
      if (action === "download") {
        const ok = downloadWorkspaceFile(entry.path, workspaceId);
        showToast(ok ? "Download started" : "Could not download");
        return;
      }
      if (action === "download-zip") {
        startFolderZip(entry.path);
        return;
      }
      if (action === "pin-root" && isDir && !isParent) {
        handlePinFolder(entry, "");
        return;
      }
      if (action === "pin-here" && isDir && !isParent) {
        handlePinFolder(entry, currentDir);
        return;
      }
      if (action === "unpin" && isDir && !isParent) {
        handleUnpinFolder(entry, currentDir);
        return;
      }
      if (action === "attach" && onAttachEntry && !isParent) {
        onAttachEntry({ path: entry.path, name, type: isDir ? "dir" : "file" });
      }
    },
    [
      filesPath,
      onNavigate,
      onOpenFile,
      onAttachEntry,
      workspaceId,
      currentDir,
      handlePinFolder,
      handleUnpinFolder,
      onCreateFile,
      onCreateFolder,
      onRefresh,
      startCreate,
    ],
  );

  const openBlankContextMenu = useCallback((x, y) => {
    setContextMenu({ entry: { type: "blank", path: filesPath }, x, y });
  }, [filesPath]);


  const pinnedShortcuts = useMemo(
    () =>
      visiblePins.map((pin) => ({
        type: "dir",
        path: pin.path,
        name: pin.label,
        isPinnedShortcut: true,
      })),
    [visiblePins],
  );

  const wrappedCreateFile = useCallback(
    async (name, fileType) => {
      await onCreateFile?.(name, fileType, createDestDir || filesPath);
    },
    [onCreateFile, createDestDir, filesPath],
  );

  const wrappedCreateFolder = useCallback(
    async (name) => {
      await onCreateFolder?.(name, createDestDir || filesPath);
    },
    [onCreateFolder, createDestDir, filesPath],
  );

  const onDragOver = (e) => {
    if (!onDropFiles || ![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropOver(true);
  };

  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropOver(false);
  };

  const onDrop = (e) => {
    setDropOver(false);
    if (!onDropFiles) return;
    e.preventDefault();
    void onDropFiles(e.dataTransfer);
  };

  const sheetActions = useMemo(() => {
    if (!sheetEntry) return [];
    const name = sheetEntry.name ?? sheetEntry.path?.split("/").pop() ?? "?";
    const isParent = sheetEntry.type === "parent";
    const isDir = sheetEntry.type === "dir" || isParent;
    const actions = [];

    if (isParent) {
      actions.push({
        id: "up",
        label: "Go up",
        icon: "chevL",
        onPress: () => onNavigate(filesPath.split("/").filter(Boolean).slice(0, -1).join("/")),
      });
    } else if (isDir) {
      actions.push({
        id: "open-folder",
        label: "Open folder",
        icon: "folder",
        onPress: () => onNavigate(sheetEntry.path),
      });
    } else {
      actions.push({
        id: "open",
        label: "Open",
        icon: "editor",
        onPress: () =>
          onOpenFile(sheetEntry.path, name, {
            size: sheetEntry.size,
            mtimeMs: sheetEntry.mtimeMs,
          }),
      });
    }

    actions.push({
      id: "copy-path",
      label: "Copy path",
      icon: "copy",
      onPress: async () => {
        const ok = await copyWorkspacePath(sheetEntry.path ?? name);
        showToast(ok ? "Path copied" : "Could not copy");
      },
    });

    if (!isDir && !isParent) {
      actions.push({
        id: "download",
        label: "Download",
        icon: "download",
        onPress: () => {
          const ok = downloadWorkspaceFile(sheetEntry.path, workspaceId);
          showToast(ok ? "Download started" : "Could not download");
        },
      });
    }

    if (isDir && !isParent) {
      actions.push({
        id: "download-zip",
        label: "Download as ZIP",
        icon: "download",
        onPress: () => {
          startFolderZip(sheetEntry.path);
        },
      });
    }

    if (!isParent && onRenameFile) {
      actions.push({
        id: "rename",
        label: "Rename",
        icon: "edit",
        onPress: () => void requestRename(sheetEntry),
      });
    }

    if (isDir && !isParent) {
      const pinnedHere = isFolderPinned(sheetEntry.path, userId, currentDir);
      if (pinnedHere) {
        actions.push({
          id: "unpin",
          label: "Unpin folder",
          icon: "pin",
          onPress: () => handleUnpinFolder(sheetEntry, currentDir),
        });
      } else {
        if (currentDir) {
          actions.push({
            id: "pin-root",
            label: "Pin to root",
            icon: "pin",
            onPress: () => handlePinFolder(sheetEntry, ""),
          });
        }
        actions.push({
          id: "pin-here",
          label: currentDir ? "Pin here" : "Pin folder",
          icon: "pin",
          onPress: () => handlePinFolder(sheetEntry, currentDir),
        });
      }
    }

    if (onAttachEntry && !isParent) {
      actions.push({
        id: "attach",
        label: isDir ? "Add folder" : "Add here",
        icon: "paperclip",
        onPress: () =>
          onAttachEntry({
            path: sheetEntry.path,
            name,
            type: isDir ? "dir" : "file",
          }),
      });
    }

    if (!isParent && onDeleteFile) {
      actions.push({
        id: "delete",
        label: isDir ? "Delete folder" : "Delete",
        icon: "trash",
        destructive: true,
        onPress: () =>
          requestDelete(sheetEntry, {
            x: Math.round(window.innerWidth / 2 - 100),
            y: Math.round(window.innerHeight - 180),
          }),
      });
    }

    return actions;
  }, [
    sheetEntry,
    filesPath,
    onNavigate,
    onOpenFile,
    onAttachEntry,
    onDeleteFile,
    onRenameFile,
    requestRename,
    workspaceId,
    currentDir,
    handlePinFolder,
    handleUnpinFolder,
    userId,
  ]);

  const viewToggle = <ExplorerViewMenu viewMode={viewMode} onChange={setView} />;

  const panelBody = (
    <>
      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search files…"
        aria-label="Search files"
      />

      <FileBreadcrumbs path={filesPath} onNavigate={onNavigate} />

      {uploadQueue.length || downloads.length ? (
        <div className="cursor-explorer-uploads shrink-0" aria-live="polite">
          {uploadQueue.map((u) => {
            const dest = destLabel(u.destDir);
            return (
              <div
                key={u.id}
                className={`cursor-explorer-upload-row${u.status === "error" ? " is-error" : ""}${u.status === "done" ? " is-done" : ""}`}
              >
                <UploadProgressPill
                  upload={u}
                  destLabelText={dest}
                  onRetry={onRetryUpload ? () => onRetryUpload(u.id) : undefined}
                  onDismiss={onDismissUpload ? () => onDismissUpload(u.id, u.status) : undefined}
                />
              </div>
            );
          })}
          {downloads.map((dl) => (
            <div
              key={dl.id}
              className={`cursor-explorer-upload-row${dl.status === "error" ? " is-error" : ""}${dl.status === "done" ? " is-done" : ""}`}
            >
              <DownloadProgressPill
                download={dl}
                onCancel={dl.status === "downloading" ? () => cancelDownload(dl.id) : undefined}
                onDismiss={dl.status !== "downloading" ? () => dismissDownload(dl.id) : undefined}
              />
            </div>
          ))}
        </div>
      ) : null}

      <FileTree
        viewMode={viewMode}
        rootEntries={rootEntries}
        flatEntries={fileEntries}
        listDir={listDir}
        onNavigate={onNavigate}
        onOpenFile={onOpenFile}
        searchQuery={search}
        searchScope={currentDir}
        searchResults={searchResults}
        searchBusy={searchBusy}
        searchTruncated={searchTruncated}
        workspaceId={workspaceId}
        pinnedPaths={pinnedSet}
        pinnedShortcuts={pinnedShortcuts}
        enableLongPress={hidePanelHead && Boolean(onAttachEntry || onOpenFile)}
        onEntryLongPress={setSheetEntry}
        onEntryContextMenu={(entry, x, y) => setContextMenu({ entry, x, y })}
        onBlankContextMenu={openBlankContextMenu}
      />

      {toast ? (
        <div className="desk-explorer-toast" role="status">
          {toast}
        </div>
      ) : null}

      <ExplorerContextMenu
        entry={contextMenu?.entry}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => {
          if (deleteBusy) return;
          setContextMenu(null);
        }}
        onAction={handleContextAction}
        onRequestDelete={onDeleteFile ? requestDelete : undefined}
        onRequestRename={onRenameFile ? requestRename : undefined}
        pinnedPaths={pinnedSet}
        currentPath={currentDir}
        canCreateFile={Boolean(onCreateFile)}
        canCreateFolder={Boolean(onCreateFolder)}
      />

      <ExplorerDeleteConfirm
        target={deleteConfirm}
        busy={deleteBusy}
        error={deleteError}
        onClose={closeDeleteConfirm}
        onConfirm={() => deleteConfirm?.entry && void confirmDeleteEntry(deleteConfirm.entry)}
      />

      <MobileActionSheet
        open={Boolean(sheetEntry)}
        title={sheetEntry?.name ?? sheetEntry?.path?.split("/").pop()}
        subtitle={sheetEntry?.path ? displayWorkspacePath(sheetEntry.path) : ""}
        actions={sheetActions}
        onClose={() => setSheetEntry(null)}
      />

      <ExplorerCreateDialog
        open={Boolean(createMode)}
        mode={createMode ?? "file"}
        destDir={createDestDir || filesPath}
        entries={createEntries}
        onClose={() => setCreateMode(null)}
        onCreateFile={onCreateFile ? wrappedCreateFile : undefined}
        onCreateFolder={onCreateFolder ? wrappedCreateFolder : undefined}
      />

      <ExplorerRenameDialog
        open={Boolean(renameTarget)}
        entry={renameTarget}
        entries={renameEntries}
        onClose={() => setRenameTarget(null)}
        onRename={onRenameFile ? confirmRenameEntry : undefined}
      />
    </>
  );

  return (
    <aside
      className={`cursor-explorer-panel h-full flex flex-col min-w-0${dropOver ? " is-drop-target" : ""}${fullscreen ? " desk-explorer-panel--fullscreen" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {!hidePanelHead ? (
        <header className="cursor-sidebar-head cursor-panel-head shrink-0">
          <SidebarBrand />
          <div className="cursor-sidebar-actions">
            <button type="button" className="cursor-icon-btn" title="Refresh" onClick={onRefresh}>
              <Icon name="refresh" size={15} />
            </button>
            {viewToggle}
            {onToggleFullscreen ? (
              <button
                type="button"
                className={`cursor-icon-btn${fullscreen ? " active" : ""}`}
                title={fullscreen ? "Exit full-screen files" : "Open files full-screen"}
                onClick={onToggleFullscreen}
              >
                <Icon name={fullscreen ? "exitFullscreen" : "maximize"} size={15} />
              </button>
            ) : null}
          </div>
        </header>
      ) : (
        <div className="cursor-tree-mode desk-mobile-explorer-tools shrink-0">
          <button
            type="button"
            className={`cursor-tree-mode-btn${viewMode === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
          >
            <Icon name="layoutList" size={12} />
            <span>List</span>
          </button>
          <button
            type="button"
            className={`cursor-tree-mode-btn${viewMode === "grid" ? " active" : ""}`}
            onClick={() => setView("grid")}
          >
            <Icon name="layoutGrid" size={12} />
            <span>Grid</span>
          </button>
          <button
            type="button"
            className={`cursor-tree-mode-btn${viewMode === "preview" ? " active" : ""}`}
            onClick={() => setView("preview")}
          >
            <Icon name="layoutPreview" size={12} />
            <span>Preview</span>
          </button>
          {onToggleFullscreen ? (
            <button type="button" className="cursor-tree-mode-btn" onClick={onToggleFullscreen}>
              <Icon name={fullscreen ? "exitFullscreen" : "maximize"} size={12} />
              <span>{fullscreen ? "Exit full" : "Full view"}</span>
            </button>
          ) : null}
        </div>
      )}

      {panelBody}
    </aside>
  );
}

// @ts-nocheck
"use client";

import { createPortal } from "react-dom";

/** Full-screen explorer overlay. */
export function ExplorerFullscreen({ open, onClose, children }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="desk-explorer-fullscreen"
      role="dialog"
      aria-label="Files full view"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="desk-explorer-fullscreen-inner">{children}</div>
    </div>,
    document.body,
  );
}
