/** Clickable workspace file/folder links in chat markdown. */
import { fileExt } from "@/desk/lib/file-kind.js";

const PATHish =
  /^[\w.@+()[\]{}-]+(?:\/[\w.@+()[\]{}-]+)+(?:\.[\w.-]+)?$|^[\w.@+()[\]{}-]+\/[\w./@-]+$/;

function normalizeRelPath(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function looksLikeWorkspacePath(text) {
  const t = normalizeRelPath(text);
  if (!t || t.length > 512) return false;
  if (/^https?:\/\//i.test(t) || t.includes("://")) return false;
  if (/\s/.test(t)) return false;
  if (t.startsWith("mos-file:") || t.startsWith("mos-dir:")) return false;
  if (!t.includes("/")) return false;
  if (/^[\d.]+$/.test(t)) return false;
  return PATHish.test(t);
}

function parentDir(relPath) {
  const parts = normalizeRelPath(relPath).split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function fileName(relPath) {
  const parts = normalizeRelPath(relPath).split("/").filter(Boolean);
  return parts.pop() ?? relPath;
}

function bindLink(el, handler) {
  if (!el || el.dataset.mosBound === "1") return;
  el.dataset.mosBound = "1";
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  });
}

function upgradeInlineCode(root) {
  if (!root) return;
  root.querySelectorAll("code").forEach((code) => {
    if (code.closest("a.mos-workspace-link")) return;
    if (code.closest(".mos-code, .code-shell, pre")) return;
    const text = code.textContent?.trim() ?? "";
    if (!looksLikeWorkspacePath(text)) return;
    const path = normalizeRelPath(text);
    const ext = fileExt(path);
    const isDir = !ext && !path.includes(".");
    const a = document.createElement("a");
    a.href = "#";
    a.className = `mos-workspace-link${isDir ? " mos-workspace-dir" : " mos-workspace-file"}`;
    if (isDir) a.dataset.mosDir = path;
    else a.dataset.mosFile = path;
    a.title = isDir ? `Open folder ${path}` : `Open file ${path}`;
    a.innerHTML = code.innerHTML;
    code.replaceWith(a);
  });
}

/** Wire mos-file / mos-dir links and auto-detected path code spans. */
export function wireWorkspaceLinks(root, { onOpenFile, onNavigateFolder } = {}) {
  if (!root) return;

  upgradeInlineCode(root);

  root.querySelectorAll("a[data-mos-file]").forEach((a) => {
    const path = normalizeRelPath(a.getAttribute("data-mos-file"));
    if (!path) return;
    bindLink(a, () => {
      onOpenFile?.(path, fileName(path));
    });
  });

  root.querySelectorAll("a[data-mos-dir]").forEach((a) => {
    const path = normalizeRelPath(a.getAttribute("data-mos-dir"));
    if (!path) return;
    bindLink(a, () => {
      onNavigateFolder?.(path);
    });
  });

  root.querySelectorAll("a.mos-workspace-file[data-mos-file]").forEach((a) => {
    const path = normalizeRelPath(a.dataset.mosFile);
    if (!path) return;
    bindLink(a, () => onOpenFile?.(path, fileName(path)));
  });

  root.querySelectorAll("a.mos-workspace-dir[data-mos-dir]").forEach((a) => {
    const path = normalizeRelPath(a.dataset.mosDir);
    if (!path) return;
    bindLink(a, () => onNavigateFolder?.(path));
  });
}

/** After creating a file, also offer parent folder navigation via mos-dir on sibling text. */
export function workspaceLinkFromPath(relPath, { isDir = false } = {}) {
  const path = normalizeRelPath(relPath);
  const label = isDir ? fileName(path) || path : fileName(path);
  const scheme = isDir ? "mos-dir" : "mos-file";
  return `[${label}](${scheme}:${path})`;
}

export { normalizeRelPath, parentDir, fileName };
