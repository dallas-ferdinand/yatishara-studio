/** Drag-and-drop payload from explorer → composer / timeline. */
export const EXPLORER_DND_TYPE = "application/x-mercuryos-path";

/** Active drag entry — readable during dragOver (getData is blocked until drop). */
let activeExplorerDrag = null;

export function inferMediaKind(entry) {
  if (!entry) return null;
  const direct = entry.mediaKind ?? entry.kind;
  if (direct === "video" || direct === "audio" || direct === "image") return direct;

  const mime = String(entry.mimeType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";

  const ext = String(entry.ext ?? "").toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".aac", ".m4a", ".ogg"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(ext)) return "image";

  const label = String(entry.kindLabel ?? "").toLowerCase();
  if (label === "video") return "video";
  if (label === "audio") return "audio";
  if (label === "image") return "image";

  return null;
}

export function writeExplorerDragData(dataTransfer, entry) {
  if (!dataTransfer || !entry?.path) return;
  const name = entry.name ?? entry.path.split("/").pop() ?? entry.path;
  const type = entry.type === "dir" ? "dir" : "file";
  const mediaKind = inferMediaKind(entry);
  const durationSeconds = Number(entry.durationSeconds ?? entry.duration);
  const payload = {
    path: entry.path,
    name,
    type,
    ext: entry.ext,
    studioKind: entry.studioKind,
    studioId: entry.studioId,
    elementType: entry.elementType,
    buildStatus: entry.buildStatus,
    sheetAssetId: entry.sheetAssetId,
    kindLabel: entry.kindLabel,
    description: entry.description,
    mediaUrl: entry.mediaUrl,
    thumbnailUrl: entry.thumbnailUrl,
    mimeType: entry.mimeType,
    byteSize: entry.byteSize,
    mediaKind,
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0.1
      ? { durationSeconds }
      : {}),
  };
  activeExplorerDrag = payload;
  dataTransfer.setData(EXPLORER_DND_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = "all";
}

export function readExplorerDragData(dataTransfer) {
  const raw = dataTransfer?.getData(EXPLORER_DND_TYPE);
  if (!raw) return activeExplorerDrag;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function peekActiveExplorerDrag() {
  return activeExplorerDrag;
}

export function clearActiveExplorerDrag() {
  activeExplorerDrag = null;
}
