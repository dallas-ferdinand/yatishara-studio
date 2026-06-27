/** Persist explorer upload jobs + file blobs for retry after failures. */
const META_KEY = "desk-explorer-upload-meta";
const DB_NAME = "mercuryos-explorer-uploads";
const BLOB_STORE = "blobs";

function readMeta() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMeta(jobs) {
  try {
    sessionStorage.setItem(META_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore quota */
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(BLOB_STORE)) {
        req.result.createObjectStore(BLOB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readonly");
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function listExplorerUploadJobs() {
  return readMeta();
}

export function saveExplorerUploadJob(job) {
  const jobs = readMeta().filter((j) => j.id !== job.id);
  jobs.push(job);
  writeMeta(jobs);
}

export function updateExplorerUploadJob(id, patch) {
  const jobs = readMeta();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  jobs[idx] = { ...jobs[idx], ...patch, updatedAt: Date.now() };
  writeMeta(jobs);
  return jobs[idx];
}

export function removeExplorerUploadJob(id) {
  writeMeta(readMeta().filter((j) => j.id !== id));
  void idbDelete(id);
}

export async function storeExplorerUploadBlob(id, file) {
  const buf = await file.arrayBuffer();
  if (!buf?.byteLength) throw new Error("File is empty");
  await idbPut(id, {
    buffer: buf,
    name: file.name || "upload",
    type: file.type || "application/octet-stream",
    size: file.size ?? buf.byteLength,
  });
}

export async function loadExplorerUploadBlob(id, meta = {}) {
  const stored = await idbGet(id);
  if (!stored) return null;
  if (stored instanceof Blob) {
    if (stored.size < 1) return null;
    const name = meta.name || (stored instanceof File ? stored.name : "upload");
    return stored instanceof File ? stored : new File([stored], name, { type: stored.type || "application/octet-stream" });
  }
  const buf = stored.buffer;
  if (!buf?.byteLength) return null;
  const name = stored.name ?? meta.name ?? "upload";
  const type = stored.type ?? meta.type ?? "application/octet-stream";
  return new File([buf], name, { type });
}

/** Mark in-flight uploads as failed when the tab reloads mid-transfer. */
export function healExplorerUploadJobsOnBoot() {
  const jobs = readMeta();
  let changed = false;
  const next = jobs.map((j) => {
    if (j.status !== "uploading") return j;
    changed = true;
    return {
      ...j,
      status: "error",
      error: j.error ?? "Upload interrupted — tap Restart to try again",
      progress: j.progress ?? 0,
      updatedAt: Date.now(),
    };
  });
  if (changed) writeMeta(next);
  return next;
}

export async function collectDroppedUploadFiles(dataTransfer) {
  const out = [];
  const items = [...(dataTransfer?.items ?? [])];

  async function readAllEntries(reader) {
    const entries = [];
    let batch = [];
    do {
      batch = await new Promise((resolve) => reader.readEntries(resolve));
      entries.push(...batch);
    } while (batch.length > 0);
    return entries;
  }

  async function walkEntry(entry, prefix = "") {
    if (!entry) return;
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => {
        entry.file((f) => resolve(f), reject);
      });
      if (!file?.name) return;
      const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
      out.push({ file, relativePath });
      return;
    }
    if (entry.isDirectory) {
      const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const children = await readAllEntries(entry.createReader());
      for (const child of children) {
        await walkEntry(child, dirPath);
      }
    }
  }

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      await walkEntry(entry);
    } else if (item.kind === "file") {
      const file = item.getAsFile();
      if (file?.name) out.push({ file, relativePath: file.name });
    }
  }

  if (!out.length) {
    for (const file of dataTransfer?.files ?? []) {
      if (file?.name) out.push({ file, relativePath: file.name });
    }
  }

  return out;
}

export function destLabel(destDir) {
  const trimmed = String(destDir ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return trimmed ? trimmed : "Files";
}
