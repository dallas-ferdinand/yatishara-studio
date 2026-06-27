/** Explorer file actions — copy, download, formatting. */
import * as api from "@mos-app/api.js";
import { workspaceDownloadUrl, streamWorkspaceFolderZip } from "@/desk/lib/mos-download.js";
import { joinExplorerPath } from "@/desk/lib/explorer-create.js";

export async function copyWorkspacePath(path) {
  const text = String(path ?? "").trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadWorkspaceFile(path, workspaceId = "mercuryos") {
  const url = workspaceDownloadUrl(path, workspaceId);
  if (!url) return false;
  const name = path.split("/").pop() || "download";
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/** Save a Blob as a browser download. */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Download a workspace folder as a ZIP with live progress callbacks.
 * Returns { filename, received }. Throws on failure/abort (AbortError on cancel).
 */
export async function downloadWorkspaceFolder(path, workspaceId = "mercuryos", { onProgress, signal } = {}) {
  const { blob, filename, received } = await streamWorkspaceFolderZip(path, workspaceId, { onProgress, signal });
  saveBlob(blob, filename);
  return { filename, received };
}

export async function deleteWorkspaceFile(path, workspaceId = "mercuryos") {
  const rel = String(path ?? "").trim();
  if (!rel) throw new Error("path required");
  return api.deleteFile(rel, workspaceId);
}

export async function renameWorkspaceFile(path, newName, workspaceId = "mercuryos") {
  const rel = String(path ?? "").trim();
  if (!rel) throw new Error("path required");
  const name = String(newName ?? "").trim();
  if (!name) throw new Error("Name required");
  return api.renameFile(rel, name, workspaceId);
}

export async function createExplorerFolder(name, destDir = "", workspaceId = "mercuryos") {
  const path = joinExplorerPath(destDir, name);
  return api.createDirectory(path, workspaceId);
}

export async function createExplorerFile(name, fileType, destDir = "", workspaceId = "mercuryos") {
  const path = joinExplorerPath(destDir, name);
  await api.writeFile(path, fileType?.content ?? "", workspaceId);
  return { path, name };
}

export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatFileDate(mtimeMs) {
  if (!mtimeMs) return "";
  const d = new Date(mtimeMs);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
