/** XHR uploads with progress (chat attachments + workspace files). */
import { getSession } from "./api.js";

function xhrUpload({ method, url, headers, body, onProgress, signal, timeout = 600_000, withCredentials = false }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = timeout;
    xhr.withCredentials = withCredentials;
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (value != null) xhr.setRequestHeader(key, value);
    }
    const onAbort = () => {
      xhr.abort();
      reject(new Error("Upload cancelled"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      if (e.lengthComputable) {
        onProgress({
          percent: Math.min(100, Math.round((100 * e.loaded) / e.total)),
          loaded: e.loaded,
          total: e.total,
        });
        return;
      }
      onProgress({ percent: 0, loaded: e.loaded, total: 0 });
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status === 0) {
        reject(new Error("Upload failed — connection lost (check login or network)"));
        return;
      }
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        data = { error: xhr.responseText || `HTTP ${xhr.status}` };
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ok !== false) {
        resolve(data);
        return;
      }
      reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Upload failed — network error"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Upload cancelled"));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Upload timed out"));
    };
    xhr.send(body);
  });
}

function authHeaders(extra = {}) {
  const session = getSession();
  const h = { ...extra };
  if (session?.token && !session?.cookieAuth) {
    h.Authorization = `Bearer ${session.token}`;
  }
  return h;
}

function assertNonEmptyFile(file, label = "File") {
  const size = file?.size ?? 0;
  if (size < 1) throw new Error(`${label} is empty — select the file again`);
}

export function workspaceRawPutUrl(relPath, workspaceId = "mercuryos") {
  const session = getSession();
  if (!session?.gatewayUrl || !relPath) return null;
  const norm = String(relPath).replace(/\\/g, "/").replace(/^\/+/, "");
  const encoded = norm.split("/").map(encodeURIComponent).join("/");
  const ws = encodeURIComponent(workspaceId);
  if (session.cookieAuth) {
    return `${session.gatewayUrl}/api/files/raw/${encoded}?workspaceId=${ws}`;
  }
  return `${session.gatewayUrl}/api/files/raw/${encoded}?workspaceId=${ws}&token=${encodeURIComponent(session.token)}`;
}

/** Chat attachment — raw body to /api/upload/binary. */
export function uploadChatFile(file, { onProgress } = {}) {
  const session = getSession();
  if (!session?.gatewayUrl) return Promise.reject(new Error("Not connected"));
  assertNonEmptyFile(file, "File");
  const url = `${session.gatewayUrl}/api/upload/binary`;
  return xhrUpload({
    method: "POST",
    url,
    headers: authHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "X-Upload-Filename": encodeURIComponent(file.name || "upload"),
      "X-Mercury-Client": session.cookieAuth ? "desk" : (session.clientTag ?? "phone"),
    }),
    body: file,
    onProgress,
    withCredentials: Boolean(session.cookieAuth),
  });
}

/** Workspace file — PUT raw bytes to /api/files/raw/{path}. */
export function putWorkspaceFile(relPath, file, workspaceId = "mercuryos", { onProgress, signal } = {}) {
  const url = workspaceRawPutUrl(relPath, workspaceId);
  if (!url) return Promise.reject(new Error("Not connected"));
  assertNonEmptyFile(file, "File");
  const session = getSession();
  return xhrUpload({
    method: "PUT",
    url,
    headers: authHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "X-Mercury-Client": session?.cookieAuth ? "desk" : (session?.clientTag ?? "phone"),
    }),
    body: file,
    onProgress,
    signal,
    withCredentials: Boolean(session?.cookieAuth),
  });
}

export function joinWorkspacePath(dir, filename) {
  const base = String(dir ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const name = String(filename ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  return base ? `${base}/${name}` : name;
}
