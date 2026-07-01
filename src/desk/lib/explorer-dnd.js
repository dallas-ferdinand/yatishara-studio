/** Drag-and-drop payload from explorer → composer. */
export const EXPLORER_DND_TYPE = "application/x-mercuryos-path";

export function writeExplorerDragData(dataTransfer, entry) {
  if (!dataTransfer || !entry?.path) return;
  const name = entry.name ?? entry.path.split("/").pop() ?? entry.path;
  const type = entry.type === "dir" ? "dir" : "file";
  dataTransfer.setData(EXPLORER_DND_TYPE, JSON.stringify({
    path: entry.path,
    name,
    type,
    ext: entry.ext,
    studioKind: entry.studioKind,
    studioId: entry.studioId,
    kindLabel: entry.kindLabel,
    description: entry.description,
    mediaUrl: entry.mediaUrl,
    thumbnailUrl: entry.thumbnailUrl,
    mimeType: entry.mimeType,
    byteSize: entry.byteSize,
  }));
  dataTransfer.effectAllowed = "all";
}

export function readExplorerDragData(dataTransfer) {
  const raw = dataTransfer?.getData(EXPLORER_DND_TYPE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
