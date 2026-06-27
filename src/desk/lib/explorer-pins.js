/** Per-user pinned explorer folders (Dallas / Shara each have their own list). */
import { getSession } from "@mos-app/api.js";

const KEY_PREFIX = "mercuryos-explorer-pins";

function storageKey(userId) {
  const id = userId ?? getSession()?.userId ?? null;
  return id ? `${KEY_PREFIX}-${id}` : KEY_PREFIX;
}

/** Workspace-relative path with no leading/trailing slashes ("" = root). */
export function normalizeExplorerPath(p) {
  return String(p ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function normalizePin(raw) {
  if (!raw || typeof raw.path !== "string") return null;
  const path = normalizeExplorerPath(raw.path);
  if (!path) return null;
  return {
    path,
    parentPath: normalizeExplorerPath(raw.parentPath ?? ""),
    label: String(raw.label ?? path.split("/").pop() ?? path).trim() || path,
    pinnedAt: Number(raw.pinnedAt) || 0,
  };
}

export function loadPinnedFolders(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizePin)
      .filter(Boolean)
      .sort((a, b) => b.pinnedAt - a.pinnedAt);
  } catch {
    return [];
  }
}

export function savePinnedFolders(pins, userId) {
  const clean = (pins ?? []).map(normalizePin).filter(Boolean);
  localStorage.setItem(storageKey(userId), JSON.stringify(clean));
  return clean;
}

/** Pins shown at the top of a given folder listing (parentPath = that folder). */
export function pinsForParent(parentPath, userId) {
  const parent = normalizeExplorerPath(parentPath);
  return loadPinnedFolders(userId).filter((x) => x.parentPath === parent);
}

export function isFolderPinned(path, userId, parentPath) {
  const p = normalizeExplorerPath(path);
  if (!p) return false;
  const parent = normalizeExplorerPath(parentPath ?? "");
  return loadPinnedFolders(userId).some((x) => x.path === p && x.parentPath === parent);
}

export function addPinnedFolder(path, label, parentPath, userId) {
  const p = normalizeExplorerPath(path);
  if (!p) return loadPinnedFolders(userId);
  const parent = normalizeExplorerPath(parentPath ?? "");
  const pins = loadPinnedFolders(userId).filter((x) => !(x.path === p && x.parentPath === parent));
  return savePinnedFolders(
    [{ path: p, parentPath: parent, label: label || p.split("/").pop() || p, pinnedAt: Date.now() }, ...pins],
    userId,
  );
}

export function removePinnedFolder(path, parentPath, userId) {
  const p = normalizeExplorerPath(path);
  if (!p) return loadPinnedFolders(userId);
  const parent = normalizeExplorerPath(parentPath ?? "");
  return savePinnedFolders(
    loadPinnedFolders(userId).filter((x) => !(x.path === p && x.parentPath === parent)),
    userId,
  );
}

export function togglePinnedFolder(path, label, userId, parentPath) {
  if (isFolderPinned(path, userId, parentPath)) {
    return removePinnedFolder(path, parentPath, userId);
  }
  return addPinnedFolder(path, label, parentPath, userId);
}

/** Update pinned paths when a folder or file is renamed. */
export function renamePinnedFolders(oldPath, newPath, userId) {
  const oldP = normalizeExplorerPath(oldPath);
  const newP = normalizeExplorerPath(newPath);
  if (!oldP || !newP || oldP === newP) return loadPinnedFolders(userId);
  const oldPrefix = `${oldP}/`;
  const mapPath = (p) => {
    const n = normalizeExplorerPath(p);
    if (!n) return n;
    if (n === oldP) return newP;
    if (n.startsWith(oldPrefix)) return `${newP}/${n.slice(oldPrefix.length)}`;
    return n;
  };
  const next = loadPinnedFolders(userId).map((x) => ({
    ...x,
    path: mapPath(x.path),
    parentPath: mapPath(x.parentPath),
    label: x.path === oldP ? newP.split("/").pop() || newP : x.label,
  }));
  return savePinnedFolders(next, userId);
}

/** Drop pins for a deleted folder, its descendants, and pins scoped inside it. */
export function removePinnedFoldersUnder(path, userId) {
  const p = normalizeExplorerPath(path);
  if (!p) return loadPinnedFolders(userId);
  const prefix = `${p}/`;
  return savePinnedFolders(
    loadPinnedFolders(userId).filter((x) => {
      if (x.path === p || x.path.startsWith(prefix)) return false;
      if (x.parentPath === p || x.parentPath.startsWith(prefix)) return false;
      return true;
    }),
    userId,
  );
}

export function pinnedPathsSet(userId, parentPath) {
  const parent = normalizeExplorerPath(parentPath ?? "");
  return new Set(
    loadPinnedFolders(userId)
      .filter((x) => x.parentPath === parent)
      .map((x) => x.path),
  );
}
