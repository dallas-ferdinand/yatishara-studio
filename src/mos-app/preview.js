/** HTML preview helpers + asset base injection. */
import * as api from "./api.js";

function encodePathSegments(rel) {
  if (!rel || rel === ".") return "";
  return rel
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export function rawAssetBase(filePath, workspaceId = "mercuryos") {
  const session = api.getSession();
  if (!session) return null;
  const norm = filePath.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const dir = slash >= 0 ? norm.slice(0, slash + 1) : "";
  const encoded = encodePathSegments(dir.replace(/\/$/, ""));
  const prefix = encoded ? `${encoded}/` : "";
  const ws = encodeURIComponent(workspaceId);
  if (session.cookieAuth) {
    return `${session.gatewayUrl}/api/files/raw/${prefix}?workspaceId=${ws}`;
  }
  const token = encodeURIComponent(session.token);
  return `${session.gatewayUrl}/api/files/raw/${prefix}?workspaceId=${ws}&token=${token}`;
}

export function prepareHtml(html, filePath, workspaceId = "mercuryos") {
  if (/<base[\s>]/i.test(html)) return html;
  const base = rawAssetBase(filePath, workspaceId);
  if (!base) return html;
  const tag = `<base href="${base}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  return `${tag}${html}`;
}

export function externalPreviewUrl(path, workspaceId = "mercuryos") {
  return api.previewUrl(path, workspaceId);
}
