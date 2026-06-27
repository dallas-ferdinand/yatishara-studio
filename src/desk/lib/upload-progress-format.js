/** Human-readable upload byte progress for explorer pills. */

export function formatUploadBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function uploadByteProgressLabel(upload) {
  const total = upload?.totalBytes ?? upload?.sizeBytes ?? 0;
  let loaded = upload?.loadedBytes;
  if (loaded == null && total > 0) {
    loaded = Math.round(((upload?.progress ?? 0) / 100) * total);
  }
  loaded = Math.max(0, Number(loaded) || 0);
  if (total > 0) return `${formatUploadBytes(loaded)} / ${formatUploadBytes(total)}`;
  if (upload?.sizeBytes) return formatUploadBytes(upload.sizeBytes);
  return "";
}
