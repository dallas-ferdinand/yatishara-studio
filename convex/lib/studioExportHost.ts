export type StudioExportHost = {
  getAssetForExport: (
    userId: string,
    assetId: string,
  ) => Promise<{
    bunnyPath?: string;
    name: string;
    folderId: string;
    kind: string;
    durationSeconds?: number;
  } | null>;
  createExportAsset: (args: {
    userId: string;
    folderId: string;
    name: string;
    kind?: "video" | "audio";
    mimeType?: string;
  }) => Promise<{ assetId: string; bunnyPath: string }>;
  finalizeExportAsset: (args: {
    assetId: string;
    byteSize: number;
    durationSeconds?: number;
  }) => Promise<void>;
  attachOutput: (args: {
    userId: string;
    projectId: string;
    outputAssetId: string;
  }) => Promise<void>;
  patchProgress: (
    jobId: string,
    phase: string,
    progress: number,
  ) => Promise<"ok" | "cancelled">;
  completeJob: (jobId: string, resultAssetId: string) => Promise<void>;
  failJob: (jobId: string, error: string) => Promise<void>;
  signCdnUrl: (path: string, expiresUnix: number) => Promise<string>;
  putObject: (args: {
    path: string;
    body: Uint8Array;
    contentType: string;
  }) => Promise<void>;
};

export type StudioExportArgs = {
  projectId?: string;
  folderId: string;
  name: string;
  project: unknown;
  exportResolution?: "720p" | "1080p" | "4K";
  exportKind?: "video" | "audio";
  audioFormat?: "mp3" | "wav" | "m4a";
  jobId?: string;
};
