import type { Id } from "../../../convex/_generated/dataModel";
import { flattenFileForUpload, stagingContentType } from "./flattenUploadFile";

type ReserveResult = {
  assetId: Id<"assets">;
  uploadUrl: string;
  bunnyPath: string;
};

type CommitResult = {
  assetId: Id<"assets">;
};

type ReserveFn = (args: {
  folderId: Id<"folders">;
  name: string;
  kind: "image" | "video" | "audio" | "document";
  mimeType: string;
}) => Promise<ReserveResult>;

type CommitFn = (args: {
  assetId: Id<"assets">;
  storageId: Id<"_storage">;
  byteSize?: number;
}) => Promise<CommitResult>;

/**
 * Secure browser upload: stage bytes in Convex storage, then promote to Bunny
 * via a server action so the zone AccessKey never reaches the client.
 */
export async function uploadStudioAsset(args: {
  file: File;
  folderId: Id<"folders">;
  kind: "image" | "video" | "audio" | "document";
  reserveUpload: ReserveFn;
  commitStagingUpload: CommitFn;
  name?: string;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  onCommitting?: () => void;
}): Promise<Id<"assets">> {
  const mimeType = stagingContentType(args.file.type);
  const reserved = await args.reserveUpload({
    folderId: args.folderId,
    name: args.name ?? args.file.name,
    kind: args.kind,
    mimeType,
  });

  if (args.signal?.aborted) {
    throw new DOMException("Upload canceled", "AbortError");
  }

  const file = await flattenFileForUpload(args.file, args.name ?? args.file.name);
  args.onProgress?.(0, file.size);

  let stagedJson: { storageId?: string };
  try {
    stagedJson = await postStagingXhr({
      uploadUrl: reserved.uploadUrl,
      mimeType,
      file,
      signal: args.signal,
      onProgress: args.onProgress,
    });
  } catch (error) {
    if (args.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    stagedJson = await postStagingFetch({
      uploadUrl: reserved.uploadUrl,
      mimeType,
      file,
      signal: args.signal,
      onProgress: args.onProgress,
    });
  }
  if (!stagedJson.storageId) {
    throw new Error("Staging upload did not return a storage id.");
  }

  args.onProgress?.(file.size, file.size);
  args.onCommitting?.();
  const committed = await args.commitStagingUpload({
    assetId: reserved.assetId,
    storageId: stagedJson.storageId as Id<"_storage">,
    byteSize: file.size,
  });
  return committed.assetId;
}

function readStorageId(request: XMLHttpRequest): { storageId?: string } {
  try {
    if (request.response && typeof request.response === "object") {
      return request.response as { storageId?: string };
    }
    const text = request.responseText || "";
    if (!text) return {};
    return JSON.parse(text) as { storageId?: string };
  } catch {
    return {};
  }
}

function postStagingXhr(args: {
  uploadUrl: string;
  mimeType: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<{ storageId?: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open("POST", args.uploadUrl);
    request.setRequestHeader("Content-Type", args.mimeType);
    const total = args.file.size;
    let lastProgressAt = 0;
    const reportProgress = (loaded: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < 120 && loaded < total) return;
      lastProgressAt = now;
      args.onProgress?.(loaded, total);
    };
    request.upload.onloadstart = () => reportProgress(0, true);
    request.upload.onprogress = (event) => {
      reportProgress(event.loaded);
    };
    request.onerror = () => reject(new Error("Staging upload failed"));
    request.onabort = () => {
      if (args.signal?.aborted) {
        reject(new DOMException("Upload canceled", "AbortError"));
        return;
      }
      reject(new Error("Staging upload interrupted"));
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Staging upload failed (${request.status})`));
        return;
      }
      const response = readStorageId(request);
      if (!response.storageId) {
        reject(new Error("Staging upload did not return a storage id."));
        return;
      }
      resolve(response);
    };
    args.signal?.addEventListener("abort", abort, { once: true });
    request.onloadend = () => args.signal?.removeEventListener("abort", abort);
    request.send(args.file);
  });
}

async function postStagingFetch(args: {
  uploadUrl: string;
  mimeType: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<{ storageId?: string }> {
  args.onProgress?.(Math.round(args.file.size * 0.15), args.file.size);
  const response = await fetch(args.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": args.mimeType },
    body: args.file,
    signal: args.signal,
  });
  if (!response.ok) {
    throw new Error(`Staging upload failed (${response.status})`);
  }
  const json = (await response.json().catch(() => ({}))) as { storageId?: string };
  if (!json.storageId) {
    throw new Error("Staging upload did not return a storage id.");
  }
  args.onProgress?.(args.file.size, args.file.size);
  return json;
}
