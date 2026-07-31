/** Per-user folder visit tracking for Files nav Recents / Frequent. */
import { getSession } from "@mos-app/api.js";
import { normalizeExplorerPath } from "./explorer-pins.js";

const KEY_PREFIX = "yatishara-studio-folder-access";
const MAX_TRACKED = 40;
const RECENT_LIMIT = 5;
const FREQUENT_LIMIT = 5;
/** Need at least this many visits to appear under Frequent. */
const FREQUENT_MIN_VISITS = 2;

function storageKey(userId) {
  const id = userId ?? getSession()?.userId ?? null;
  return id ? `${KEY_PREFIX}-${id}` : KEY_PREFIX;
}

function normalizeAccess(raw) {
  if (!raw || typeof raw !== "object") return null;
  const studioId = typeof raw.studioId === "string" ? raw.studioId : "";
  const path = normalizeExplorerPath(raw.path ?? "");
  if (!studioId && !path) return null;
  return {
    studioId,
    path,
    label: String(raw.label ?? path.split("/").pop() ?? "Folder").trim() || "Folder",
    lastVisitedAt: Number(raw.lastVisitedAt) || 0,
    visitCount: Math.max(1, Number(raw.visitCount) || 1),
  };
}

export function loadFolderAccess(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeAccess).filter(Boolean);
  } catch {
    return [];
  }
}

function saveFolderAccess(rows, userId) {
  const clean = (rows ?? []).map(normalizeAccess).filter(Boolean);
  localStorage.setItem(storageKey(userId), JSON.stringify(clean));
  return clean;
}

/**
 * Record a folder open. Skips root / trash / system places.
 * @returns {Array} updated access list
 */
export function recordFolderVisit(
  {
    studioId,
    path,
    label,
    systemKind,
    studioKind,
    isWorkspaceRoot = false,
  },
  userId,
) {
  if (isWorkspaceRoot) return loadFolderAccess(userId);
  if (studioKind === "trash" || systemKind === "trash") return loadFolderAccess(userId);
  if (
    studioKind === "messages" ||
    studioKind === "purchased" ||
    studioKind === "public" ||
    systemKind === "messages" ||
    systemKind === "purchased_assets" ||
    systemKind === "public_assets"
  ) {
    return loadFolderAccess(userId);
  }
  const id = typeof studioId === "string" ? studioId : "";
  const p = normalizeExplorerPath(path ?? "");
  if (!id && !p) return loadFolderAccess(userId);

  const now = Date.now();
  const rows = loadFolderAccess(userId);
  const idx = rows.findIndex(
    (row) => (id && row.studioId === id) || (p && row.path === p),
  );
  const nextRow = {
    studioId: id || (idx >= 0 ? rows[idx].studioId : ""),
    path: p || (idx >= 0 ? rows[idx].path : ""),
    label:
      String(label ?? "").trim() ||
      (idx >= 0 ? rows[idx].label : p.split("/").pop() || "Folder"),
    lastVisitedAt: now,
    visitCount: (idx >= 0 ? rows[idx].visitCount : 0) + 1,
  };
  const rest = rows.filter((_, i) => i !== idx);
  const next = [nextRow, ...rest]
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, MAX_TRACKED);
  return saveFolderAccess(next, userId);
}

export function listRecentFolders(userId, limit = RECENT_LIMIT) {
  return loadFolderAccess(userId)
    .slice()
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, limit);
}

/**
 * Frequent folders by visit count. Excludes the current Recents set so lists stay distinct.
 */
export function listFrequentFolders(
  userId,
  { limit = FREQUENT_LIMIT, excludeStudioIds = [], minVisits = FREQUENT_MIN_VISITS } = {},
) {
  const exclude = new Set(excludeStudioIds.filter(Boolean));
  return loadFolderAccess(userId)
    .filter((row) => row.visitCount >= minVisits && !exclude.has(row.studioId))
    .slice()
    .sort((a, b) => b.visitCount - a.visitCount || b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, limit);
}

export const FOLDER_ACCESS_RECENT_LIMIT = RECENT_LIMIT;
export const FOLDER_ACCESS_FREQUENT_LIMIT = FREQUENT_LIMIT;
