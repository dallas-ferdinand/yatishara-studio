/** Run a single explorer upload with persisted job state + blob retry. */
import { putWorkspaceFile, joinWorkspacePath } from "@mos-app/file-transfer.js";
import {
  saveExplorerUploadJob,
  updateExplorerUploadJob,
  removeExplorerUploadJob,
  storeExplorerUploadBlob,
  loadExplorerUploadBlob,
} from "@/desk/lib/explorer-upload-queue.js";
import { assertExplorerUploadSize, maxExplorerUploadLabel } from "@/desk/lib/explorer-upload-limits.js";

const uploadAbort = new Map();

export function cancelExplorerUpload(id) {
  const abort = uploadAbort.get(id);
  if (abort) {
    abort();
    uploadAbort.delete(id);
  }
  removeExplorerUploadJob(id);
}

export async function runExplorerUpload(job, file, onChange) {
  const patch = (updates) => {
    const next = updateExplorerUploadJob(job.id, updates);
    if (next) onChange?.(next);
    return next;
  };

  const controller = new AbortController();
  uploadAbort.set(job.id, () => controller.abort());

  patch({
    status: "uploading",
    progress: 0,
    error: null,
    destDir: job.destDir,
    relPath: job.relPath,
    name: job.name,
    workspaceId: job.workspaceId,
  });

  try {
    if (!file?.size) {
      patch({
        status: "error",
        error: "File is empty — drop the file again to upload",
      });
      return;
    }
    assertExplorerUploadSize(file);
    await storeExplorerUploadBlob(job.id, file);
    await putWorkspaceFile(job.relPath, file, job.workspaceId, {
      onProgress: (p) => {
        const progress = typeof p === "object" ? p.percent : p;
        patch({
          progress,
          loadedBytes: typeof p === "object" ? p.loaded : undefined,
          totalBytes: typeof p === "object" ? p.total : job.sizeBytes,
          status: "uploading",
        });
      },
      signal: controller.signal,
    });
    uploadAbort.delete(job.id);
    const doneJob = patch({ status: "done", progress: 100, error: null });
    onChange?.(doneJob, { completed: true });
    window.setTimeout(() => {
      removeExplorerUploadJob(job.id);
      onChange?.(null, { removedId: job.id });
    }, 5000);
  } catch (err) {
    uploadAbort.delete(job.id);
    if (controller.signal.aborted) {
      removeExplorerUploadJob(job.id);
      onChange?.(null, { removedId: job.id });
      return;
    }
    patch({
      status: "error",
      error: err?.message ?? `Upload failed (max ${maxExplorerUploadLabel()})`,
    });
  }
}

export async function retryExplorerUpload(job, onChange) {
  const file = await loadExplorerUploadBlob(job.id, { name: job.name });
  if (!file?.size) {
    const next = updateExplorerUploadJob(job.id, {
      status: "error",
      error: "Saved file data is empty or missing — drop the file again to upload",
    });
    onChange?.(next);
    return;
  }
  await runExplorerUpload(job, file, onChange);
}

export function createExplorerUploadJob({ destDir, workspaceId, relativePath, file }) {
  const relPath = joinWorkspacePath(destDir, relativePath);
  const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    name: relativePath.split("/").pop() || file.name,
    relativePath,
    destDir: destDir || "",
    workspaceId,
    relPath,
    sizeBytes: file.size ?? 0,
    loadedBytes: 0,
    totalBytes: file.size ?? 0,
    progress: 0,
    status: "uploading",
    error: null,
    updatedAt: Date.now(),
  };
  saveExplorerUploadJob(job);
  return job;
}
