/** Attachment display + preview helpers (composer + sent messages). */
import * as api from "@mos-app/api.js";
import { fileExt, fileIconName, fileViewerKind } from "@/desk/lib/file-kind.js";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { externalPreviewUrl } from "@mos-app/preview.js";

export function attachmentIsDirectory(a) {
  if (!a) return false;
  if (a.isDirectory === true || a.kind === "folder" || a.type === "dir") return true;
  if (a.kind === "ref" && String(a.label ?? "").startsWith("Folder:")) return true;
  return false;
}

export function attachmentLabel(a) {
  if (!a) return "Attachment";
  if (attachmentIsDirectory(a)) {
    const raw = a.label ?? a.path?.split("/").pop() ?? "Folder";
    return raw.replace(/^Folder:\s*/i, "");
  }
  return a.label ?? a.filename ?? a.path?.split("/").pop() ?? "Attachment";
}

export function attachmentIconName(a) {
  if (attachmentIsDirectory(a)) return "folder";
  if (a?.kind === "context") return "fileText";
  if (a?.kind === "image") return "image";
  if (a?.refKind === "mcp") return "mcp";
  if (a?.refKind === "person") return "user";
  if (a?.refKind === "chat") return "message";
  if (a?.refKind === "pulse") return "infinity";
  const path = a?.workspacePath ?? a?.path ?? a?.filename ?? "";
  return fileIconName(path);
}

export function attachmentIsImage(a) {
  if (!a || attachmentIsDirectory(a)) return false;
  if (a.kind === "image") return true;
  const path = a.workspacePath ?? a.path ?? a.filename ?? "";
  return fileViewerKind(fileExt(path)) === "image";
}

export function attachmentPreviewKind(a, workspaceId = "mercuryos") {
  if (!a) return "binary";
  if (attachmentIsDirectory(a)) return "folder";
  if (a.kind === "context") return "text";
  if (a.kind === "image") return "image";
  const path = a.workspacePath ?? a.path ?? a.filename ?? "";
  const ext = fileExt(path);
  if (a.previewUrl || (a.stored && a.kind === "image")) return "image";
  if (!ext && a.kind === "ref") return "binary";
  return fileViewerKind(ext);
}

export function attachmentIsVideo(a) {
  if (!a || attachmentIsDirectory(a)) return false;
  const path = a.workspacePath ?? a.path ?? a.filename ?? "";
  return fileViewerKind(fileExt(path)) === "video";
}

export function attachmentThumbUrl(a, workspaceId = "mercuryos") {
  if (!a || attachmentIsDirectory(a)) return null;
  if (a.previewUrl) return a.previewUrl;
  if (a.stored && (a.kind === "image" || fileViewerKind(fileExt(a.filename ?? a.path ?? "")) === "image")) {
    return api.uploadRawUrl(a.stored);
  }
  const path = a.workspacePath ?? a.path;
  if (path) {
    const kind = fileViewerKind(fileExt(path));
    if (kind === "image") return workspaceFileRawUrl(path, workspaceId);
    if (kind === "video") return workspaceFileThumbUrl(path, workspaceId, 480);
  }
  return null;
}

export function attachmentMediaUrl(a, workspaceId = "mercuryos") {
  if (!a || attachmentIsDirectory(a)) return null;
  if (a.previewUrl) return a.previewUrl;
  if (a.stored) return api.uploadRawUrl(a.stored);
  const path = a.workspacePath ?? a.path;
  if (path) return workspaceFileRawUrl(path, workspaceId);
  return null;
}

export function attachmentExternalUrl(a, workspaceId = "mercuryos") {
  const path = a?.workspacePath ?? a?.path;
  if (path) return externalPreviewUrl(path, workspaceId);
  return attachmentMediaUrl(a, workspaceId);
}

export async function loadAttachmentTextContent(a, workspaceId = "mercuryos") {
  if (!a) return "";
  if (attachmentIsDirectory(a)) return "";
  if (a.kind === "context") return String(a.text ?? "");
  const path = a.workspacePath ?? a.path;
  if (a.stored) {
    const url = api.uploadRawUrl(a.stored);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Could not load upload");
    return await res.text();
  }
  if (path) {
    const file = await api.readFile(path, workspaceId);
    return file?.content ?? "";
  }
  return "";
}

export async function loadAttachmentFolderListing(a, workspaceId = "mercuryos") {
  const path = a?.workspacePath ?? a?.path ?? "";
  if (!path) return { path: ".", entries: [] };
  const data = await api.listFiles(path, workspaceId);
  return {
    path: data?.path ?? path,
    entries: data?.entries ?? [],
  };
}
