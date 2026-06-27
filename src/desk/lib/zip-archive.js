/** Client-side ZIP listing + extract helpers (fflate). */
import { unzip } from "fflate";
import { joinExplorerPath } from "@/desk/lib/explorer-create.js";
import { putWorkspaceFile } from "@mos-app/file-transfer.js";
import { formatFileSize } from "@/desk/lib/explorer-file-actions.js";
import { fileExt, fileViewerKind } from "@/desk/lib/file-kind.js";

const MAX_BROWSE_BYTES = 200 * 1024 * 1024;

export { formatFileSize };

export function isZipFile(ext) {
  const e = ext?.startsWith(".") ? ext.toLowerCase() : fileExt(ext);
  return e === ".zip";
}

export function defaultExtractDir(zipPath) {
  const norm = String(zipPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = norm.lastIndexOf("/");
  const parent = slash >= 0 ? norm.slice(0, slash) : "";
  const file = slash >= 0 ? norm.slice(slash + 1) : norm;
  const base = file.replace(/\.zip$/i, "") || "archive";
  return joinExplorerPath(parent, base);
}

function basename(path) {
  const p = String(path ?? "").replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function buildArchiveIndex(files) {
  const byPath = new Map();
  const dirSet = new Set([""]);

  for (const [rawPath, data] of Object.entries(files ?? {})) {
    let path = String(rawPath).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path) continue;
    const isDir = path.endsWith("/");
    if (isDir) path = path.slice(0, -1);
    if (!path) continue;

    if (isDir) {
      dirSet.add(path);
      byPath.set(path, { type: "dir", path, name: basename(path) || path, size: 0 });
      continue;
    }

    const size = data?.byteLength ?? data?.length ?? 0;
    byPath.set(path, { type: "file", path, name: basename(path), size, data });
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  }

  for (const d of dirSet) {
    if (!byPath.has(d)) {
      byPath.set(d, { type: "dir", path: d, name: d ? basename(d) : "", size: 0 });
    }
  }

  return { byPath, fileCount: [...byPath.values()].filter((e) => e.type === "file").length };
}

export function parseZipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, files) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      try {
        resolve(buildArchiveIndex(files));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function loadZipFromUrl(url, { signal } = {}) {
  if (!url) throw new Error("Missing archive URL");
  const res = await fetch(url, { signal, credentials: "include" });
  if (!res.ok) throw new Error(`Could not load archive (${res.status})`);
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BROWSE_BYTES) {
    throw new Error(`Archive too large to browse (${formatFileSize(len)}). Download instead.`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BROWSE_BYTES) {
    throw new Error(`Archive too large to browse (${formatFileSize(buf.byteLength)}). Download instead.`);
  }
  return parseZipBuffer(buf);
}

export function listArchiveDir(index, dirPath = "") {
  const dir = String(dirPath ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const prefix = dir ? `${dir}/` : "";
  const children = new Map();

  for (const [path, entry] of index.byPath) {
    if (entry.type === "dir" && path === dir) continue;
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    const seg = slash >= 0 ? rest.slice(0, slash) : rest;
    const childPath = prefix + seg;
    if (children.has(childPath)) continue;
    const hit = index.byPath.get(childPath);
    if (hit) {
      children.set(childPath, hit);
      continue;
    }
    children.set(childPath, {
      type: slash >= 0 || index.byPath.get(`${childPath}/`) ? "dir" : "file",
      path: childPath,
      name: seg,
      size: 0,
    });
  }

  return [...children.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function archiveBreadcrumbs(dirPath, rootLabel) {
  const crumbs = [{ label: rootLabel, path: "" }];
  const parts = String(dirPath ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function entryPreviewKind(entry) {
  if (!entry || entry.type !== "file") return null;
  return fileViewerKind(fileExt(entry.name));
}

export function decodeArchiveText(entry, maxBytes = 512 * 1024) {
  if (!entry?.data || entry.size > maxBytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(entry.data);
  } catch {
    return null;
  }
}

export function downloadArchiveEntry(entry) {
  if (!entry?.data) return;
  const blob = new Blob([entry.data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = entry.name || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function extractArchiveEntry(entry, destDir, workspaceId) {
  if (!entry?.data || entry.type !== "file") throw new Error("Not a file");
  const outPath = joinExplorerPath(destDir, entry.path);
  await putWorkspaceFile(outPath, new Blob([entry.data]), workspaceId);
  return outPath;
}

export async function extractAllArchiveEntries(index, destDir, workspaceId, { onProgress } = {}) {
  const files = [...index.byPath.values()].filter((e) => e.type === "file" && e.data);
  let done = 0;
  for (const entry of files) {
    const outPath = joinExplorerPath(destDir, entry.path);
    await putWorkspaceFile(outPath, new Blob([entry.data]), workspaceId);
    done += 1;
    onProgress?.({ done, total: files.length, path: entry.path, outPath });
  }
  return { destDir, count: files.length };
}
