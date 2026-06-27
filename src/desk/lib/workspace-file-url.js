/** Signed workspace file URLs for media tabs. */
import * as api from "@mos-app/api.js";

function encodePath(path) {
  const norm = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return norm.split("/").map(encodeURIComponent).join("/");
}

export function workspaceFileRawUrl(path, workspaceId = "mercuryos", mtimeMs = null) {
  const session = api.getSession();
  if (!session?.gatewayUrl || !path) return null;
  const encoded = encodePath(path);
  const ws = encodeURIComponent(workspaceId);
  const v =
    mtimeMs != null && Number.isFinite(Number(mtimeMs))
      ? `&v=${encodeURIComponent(String(mtimeMs))}`
      : "";
  if (session.cookieAuth) {
    return `${session.gatewayUrl}/api/files/raw/${encoded}?workspaceId=${ws}${v}`;
  }
  return `${session.gatewayUrl}/api/files/raw/${encoded}?workspaceId=${ws}&token=${encodeURIComponent(session.token)}${v}`;
}

/** Fast preview — cached WebP thumb (full file if already small). */
export function workspaceFileThumbUrl(path, workspaceId = "mercuryos", maxW = 960) {
  const session = api.getSession();
  if (!session?.gatewayUrl || !path) return null;
  const ws = encodeURIComponent(workspaceId);
  const p = encodeURIComponent(path);
  const w = encodeURIComponent(String(maxW));
  if (session.cookieAuth) {
    return `${session.gatewayUrl}/api/files/thumb?path=${p}&workspaceId=${ws}&w=${w}`;
  }
  return `${session.gatewayUrl}/api/files/thumb?path=${p}&workspaceId=${ws}&w=${w}&token=${encodeURIComponent(session.token)}`;
}
