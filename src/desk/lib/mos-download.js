/** Auto-fetch ```mos-download fenced paths. */
import * as api from "@mos-app/api.js";

const handled = new Set();

export function parseMosDownloadPaths(text) {
  const out = [];
  const re = /```mos-download\s*\n([\s\S]*?)```/g;
  let m;
  const src = String(text ?? "");
  while ((m = re.exec(src))) {
    const body = m[1]?.trim() ?? "";
    for (const line of body.split("\n")) {
      const p = line.trim();
      if (!p || p.startsWith("#")) continue;
      out.push(p);
    }
  }
  return out;
}

export function workspaceDownloadUrl(relPath, workspaceId = "mercuryos") {
  const session = api.getSession();
  if (!session?.gatewayUrl) return null;
  const base = session.gatewayUrl.replace(/\/+$/, "");
  const enc = relPath.split("/").map(encodeURIComponent).join("/");
  let url = `${base}/api/files/raw/${enc}?workspaceId=${encodeURIComponent(workspaceId)}&download=1`;
  if (session.token) url += `&token=${encodeURIComponent(session.token)}`;
  return url;
}

/** Build a streaming ZIP download URL for a workspace folder. */
export function workspaceZipUrl(relPath, workspaceId = "mercuryos") {
  const session = api.getSession();
  if (!session?.gatewayUrl) return null;
  const base = session.gatewayUrl.replace(/\/+$/, "");
  let url = `${base}/api/files/zip?path=${encodeURIComponent(relPath)}&workspaceId=${encodeURIComponent(workspaceId)}`;
  if (session.token) url += `&token=${encodeURIComponent(session.token)}`;
  return url;
}

/**
 * Stream a folder ZIP with live received-byte reporting.
 * The gateway streams with chunked encoding (no Content-Length), so callers
 * should treat total=0 as "indeterminate" and show a climbing byte counter.
 * Resolves with { blob, filename, received }.
 */
export async function streamWorkspaceFolderZip(relPath, workspaceId = "mercuryos", { onProgress, signal } = {}) {
  const url = workspaceZipUrl(relPath, workspaceId);
  if (!url) throw new Error("No gateway session");
  const resp = await fetch(url, { signal, headers: { Accept: "application/zip" } });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 200);
    } catch {}
    throw new Error(`ZIP failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  const cd = resp.headers.get("content-disposition") || "";
  const m = /filename=?([^";]+)"?/i.exec(cd);
  const filename = m?.[1] || `${(relPath.split("/").pop() || "folder").trim()}.zip`;
  const total = Number(resp.headers.get("content-length")) || 0;
  const body = resp.body;
  if (!body?.getReader) throw new Error("Streaming unsupported in this browser");
  const reader = body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (onProgress) onProgress(received, total);
    }
  }
  const blob = new Blob(chunks, { type: "application/zip" });
  return { blob, filename, received };
}

export function triggerMosDownloads(text, { cacheKey, workspaceId = "mercuryos" } = {}) {
  const paths = parseMosDownloadPaths(text);
  if (!paths.length) return;
  for (const relPath of paths) {
    const key = `${cacheKey ?? ""}:${relPath}`;
    if (handled.has(key)) continue;
    handled.add(key);
    const url = workspaceDownloadUrl(relPath, workspaceId);
    if (!url) continue;
    const a = document.createElement("a");
    a.href = url;
    a.download = relPath.split("/").pop() || "download";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function scanMosDownloads(root, { cacheKey, workspaceId } = {}) {
  if (!root) return;
  const text = root.textContent ?? "";
  triggerMosDownloads(text, { cacheKey, workspaceId });
  root.querySelectorAll("[data-mos-download]").forEach((el) => {
    const path = el.getAttribute("data-mos-download");
    if (path) triggerMosDownloads(`\`\`\`mos-download\n${path}\n\`\`\``, { cacheKey: `${cacheKey}:${path}`, workspaceId });
  });
}
