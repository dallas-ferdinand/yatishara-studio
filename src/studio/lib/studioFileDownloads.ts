import type { ConvexReactClient } from "convex/react";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type StudioDownloadSelection =
  | { kind: "folder"; id: Id<"folders"> }
  | { kind: "asset"; id: Id<"assets"> }
  | { kind: "document"; id: Id<"documents"> }
  | { kind: "videoEdit"; id: Id<"videoEditProjects"> }
  | { kind: "element"; id: Id<"elements"> };

type DownloadProgress = {
  loaded: number;
  total: number;
  fileName: string;
  phase: "preparing" | "downloading" | "packing";
};

type ProgressHandler = (progress: DownloadProgress) => void;

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function bytesToBlob(chunks: Uint8Array[], type?: string): Blob {
  const parts = chunks.map((chunk) => new Uint8Array(chunk));
  return type ? new Blob(parts, { type }) : new Blob(parts);
}

function baseName(path: string): string {
  return path.split("/").filter(Boolean).pop() || "download";
}

async function manifest(
  convex: ConvexReactClient,
  selections: StudioDownloadSelection[],
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new DOMException("Download canceled", "AbortError");
  return await convex.query(api.studioDownloads.manifest, {
    selections,
    expiresUnix: Math.floor(Date.now() / 1000) + 60 * 60,
    maxFiles: 500,
  });
}

function isFetchNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|load failed/i.test(message);
}

async function readRemote(
  url: string,
  signal: AbortSignal | undefined,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  let response: Response;
  try {
    // Bunny signed URLs are cross-origin; omit cookies so wildcard CORS is allowed.
    response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
  } catch (error) {
    if (isFetchNetworkError(error)) {
      throw new Error(
        "Could not download from storage (CDN blocked the request). Try again, or ask an admin to check Bunny CORS for this file type.",
      );
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  if (!response.body) {
    onChunk(new Uint8Array(await response.arrayBuffer()));
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value) onChunk(value);
  }
}

/** Last-resort single-file save when CORS fetch is blocked (opens the signed URL). */
function saveViaAnchor(url: string, name: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadStudioEntry(args: {
  convex: ConvexReactClient;
  selection: Exclude<StudioDownloadSelection, { kind: "folder" }>;
  signal?: AbortSignal;
  onProgress?: ProgressHandler;
}): Promise<string> {
  args.onProgress?.({ loaded: 0, total: 0, fileName: "Preparing…", phase: "preparing" });
  const result = await manifest(args.convex, [args.selection], args.signal);
  const file = result.files[0];
  if (!file) throw new Error("This item has no downloadable content");
  const fileName = baseName(file.path);
  if (file.kind === "text") {
    const bytes = strToU8(file.text ?? "");
    args.onProgress?.({
      loaded: bytes.byteLength,
      total: bytes.byteLength,
      fileName,
      phase: "downloading",
    });
    saveBlob(bytesToBlob([bytes]), fileName);
    return fileName;
  }
  if (!file.url) throw new Error("Download URL is unavailable");
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const total = file.byteSize ?? 0;
  try {
    await readRemote(file.url, args.signal, (chunk) => {
      chunks.push(chunk);
      loaded += chunk.byteLength;
      args.onProgress?.({ loaded, total, fileName, phase: "downloading" });
    });
  } catch (error) {
    if (args.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!/cdn blocked the request|bunny cors|failed to fetch/i.test(message)) {
      throw error;
    }
    // Browser may still navigate/save via download attribute when fetch CORS fails.
    saveViaAnchor(file.url, fileName);
    args.onProgress?.({
      loaded: total || 1,
      total: total || 1,
      fileName,
      phase: "downloading",
    });
    return fileName;
  }
  saveBlob(bytesToBlob(chunks), fileName);
  return fileName;
}

export async function downloadStudioArchive(args: {
  convex: ConvexReactClient;
  selections: StudioDownloadSelection[];
  signal?: AbortSignal;
  onProgress?: ProgressHandler;
}): Promise<{ name: string; truncated: boolean }> {
  args.onProgress?.({ loaded: 0, total: 0, fileName: "Preparing ZIP…", phase: "preparing" });
  const result = await manifest(args.convex, args.selections, args.signal);
  if (!result.files.length) throw new Error("The selection has no downloadable files");
  const knownTotal = result.files.reduce((sum, file) => {
    if (file.kind === "text") return sum + strToU8(file.text ?? "").byteLength;
    return sum + (file.byteSize ?? 0);
  }, 0);
  const output: Uint8Array[] = [];
  let loaded = 0;
  let currentFile = result.files[0]?.path ?? result.archiveName;
  const completed = new Promise<Blob>((resolve, reject) => {
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }
      output.push(chunk);
      if (final) resolve(bytesToBlob(output, "application/zip"));
    });

    void (async () => {
      try {
        for (const item of result.files) {
          if (args.signal?.aborted) throw new DOMException("Download canceled", "AbortError");
          currentFile = item.path;
          const entry = new ZipPassThrough(item.path);
          zip.add(entry);
          if (item.kind === "text") {
            const bytes = strToU8(item.text ?? "");
            entry.push(bytes, true);
            loaded += bytes.byteLength;
            args.onProgress?.({
              loaded,
              total: knownTotal,
              fileName: currentFile,
              phase: "packing",
            });
            continue;
          }
          if (!item.url) {
            entry.push(new Uint8Array(), true);
            continue;
          }
          await readRemote(item.url, args.signal, (chunk) => {
            entry.push(chunk);
            loaded += chunk.byteLength;
            args.onProgress?.({
              loaded,
              total: knownTotal,
              fileName: currentFile,
              phase: "downloading",
            });
          });
          entry.push(new Uint8Array(), true);
        }
        args.onProgress?.({
          loaded,
          total: knownTotal || loaded,
          fileName: result.archiveName,
          phase: "packing",
        });
        zip.end();
      } catch (error) {
        zip.terminate();
        reject(error);
      }
    })();
  });
  const blob = await completed;
  saveBlob(blob, result.archiveName);
  return { name: result.archiveName, truncated: result.truncated };
}
