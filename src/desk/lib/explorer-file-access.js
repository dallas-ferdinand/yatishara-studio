/** Per-user recent Files activity for Places → Recents (opens, creates, edits, folders). */
import { getSession } from "@mos-app/api.js";
import { normalizeExplorerPath } from "./explorer-pins.js";

const KEY_PREFIX = "yatishara-studio-file-access";
export const RECENT_FILES_LIMIT = 20;

export const RECENT_ACTIVITY = {
  opened: "opened",
  created: "created",
  edited: "edited",
};

const ALLOWED_ACTIVITY = new Set(Object.values(RECENT_ACTIVITY));

function storageKey(userId) {
  const id = userId ?? getSession()?.userId ?? null;
  return id ? `${KEY_PREFIX}-${id}` : KEY_PREFIX;
}

function isExcludedKind(studioKind) {
  return (
    studioKind === "trash" ||
    studioKind === "recents" ||
    studioKind === "messages" ||
    studioKind === "purchased" ||
    studioKind === "public"
  );
}

function normalizeFileAccess(raw) {
  if (!raw || typeof raw !== "object") return null;
  const studioKind = String(raw.studioKind ?? "");
  const studioId = typeof raw.studioId === "string" ? raw.studioId : "";
  if (!studioKind || !studioId) return null;
  if (isExcludedKind(studioKind)) return null;
  const activity = ALLOWED_ACTIVITY.has(raw.activity) ? raw.activity : RECENT_ACTIVITY.opened;
  const isFolder = studioKind === "folder" || raw.type === "dir";
  return {
    studioKind: isFolder ? "folder" : studioKind,
    studioId,
    name: String(raw.name ?? (isFolder ? "Folder" : "File")).trim() || (isFolder ? "Folder" : "File"),
    path: normalizeExplorerPath(raw.path ?? ""),
    kind: raw.kind ?? raw.mediaKind ?? undefined,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
    thumbnailUrl:
      typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : undefined,
    type: isFolder ? "dir" : "file",
    activity,
    // Activity timestamp (kept as openedAt for sort/storage compat).
    openedAt: Number(raw.openedAt) || 0,
  };
}

export function loadRecentFiles(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizeFileAccess)
      .filter(Boolean)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, RECENT_FILES_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentFiles(rows, userId) {
  const clean = (rows ?? [])
    .map(normalizeFileAccess)
    .filter(Boolean)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, RECENT_FILES_LIMIT);
  localStorage.setItem(storageKey(userId), JSON.stringify(clean));
  return clean;
}

/**
 * Record Places → Recents activity (file or folder).
 * @param {"opened"|"created"|"edited"} [activity]
 */
export function recordRecentItem(entry, userId, activity = RECENT_ACTIVITY.opened) {
  if (!entry || entry.type === "parent") {
    return loadRecentFiles(userId);
  }
  const studioKind =
    entry.studioKind === "folder" || entry.type === "dir"
      ? "folder"
      : entry.studioKind;
  const studioId = entry.studioId;
  if (!studioKind || !studioId) return loadRecentFiles(userId);
  if (isExcludedKind(studioKind)) return loadRecentFiles(userId);

  const isFolder = studioKind === "folder";
  const nextActivity = ALLOWED_ACTIVITY.has(activity)
    ? activity
    : RECENT_ACTIVITY.opened;
  const row = {
    studioKind,
    studioId,
    name: entry.name ?? (isFolder ? "Folder" : "File"),
    path: entry.path ?? "",
    kind: entry.kind ?? entry.mediaKind,
    mimeType: entry.mimeType,
    thumbnailUrl: entry.thumbnailUrl || entry.thumbnailLqipUrl,
    type: isFolder ? "dir" : "file",
    activity: nextActivity,
    openedAt: Date.now(),
  };
  const rest = loadRecentFiles(userId).filter(
    (item) => !(item.studioKind === studioKind && item.studioId === studioId),
  );
  return saveRecentFiles([row, ...rest], userId);
}

/** Record a file/folder open. */
export function recordFileOpen(entry, userId) {
  return recordRecentItem(entry, userId, RECENT_ACTIVITY.opened);
}

export function listRecentFiles(userId, limit = RECENT_FILES_LIMIT) {
  return loadRecentFiles(userId).slice(0, limit);
}
