import type { Id } from "../../../convex/_generated/dataModel";

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
}): Promise<Id<"assets">> {
  const mimeType = args.file.type || "application/octet-stream";
  const reserved = await args.reserveUpload({
    folderId: args.folderId,
    name: args.name ?? args.file.name,
    kind: args.kind,
    mimeType,
  });

  if (args.signal?.aborted) {
    throw new DOMException("Upload canceled", "AbortError");
  }
  const stagedJson = await new Promise<{ storageId?: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open("POST", reserved.uploadUrl);
    request.setRequestHeader("Content-Type", mimeType);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      args.onProgress?.(event.loaded, event.lengthComputable ? event.total : args.file.size);
    };
    request.onerror = () => reject(new Error("Staging upload failed"));
    // Only treat AbortError as user-cancel when our signal fired. Browser tab
    // freeze / connection drop also aborts XHR — those should be retryable.
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
      const response =
        request.response && typeof request.response === "object"
          ? (request.response as { storageId?: string })
          : (JSON.parse(request.responseText || "{}") as { storageId?: string });
      resolve(response);
    };
    args.signal?.addEventListener("abort", abort, { once: true });
    request.onloadend = () => args.signal?.removeEventListener("abort", abort);
    request.send(args.file);
  });
  if (!stagedJson.storageId) {
    throw new Error("Staging upload did not return a storage id.");
  }

  const committed = await args.commitStagingUpload({
    assetId: reserved.assetId,
    storageId: stagedJson.storageId as Id<"_storage">,
    byteSize: args.file.size,
  });
  args.onProgress?.(args.file.size, args.file.size);
  return committed.assetId;
}
