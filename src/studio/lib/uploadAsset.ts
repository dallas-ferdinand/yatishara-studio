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
}): Promise<Id<"assets">> {
  const mimeType = args.file.type || "application/octet-stream";
  const reserved = await args.reserveUpload({
    folderId: args.folderId,
    name: args.name ?? args.file.name,
    kind: args.kind,
    mimeType,
  });

  const staged = await fetch(reserved.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: args.file,
  });
  if (!staged.ok) {
    throw new Error(`Staging upload failed (${staged.status})`);
  }
  const stagedJson = (await staged.json()) as { storageId?: string };
  if (!stagedJson.storageId) {
    throw new Error("Staging upload did not return a storage id.");
  }

  const committed = await args.commitStagingUpload({
    assetId: reserved.assetId,
    storageId: stagedJson.storageId as Id<"_storage">,
    byteSize: args.file.size,
  });
  return committed.assetId;
}
