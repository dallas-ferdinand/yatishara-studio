/** Preview / local hosts where unfinished Studio features may ship. */
export function isStudioPreviewHost(hostname?: string | null): boolean {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  const normalized = String(host || "").split(":")[0].toLowerCase();
  return (
    normalized.includes("preview.") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

/** Video editor UI + .edit projects — preview only for now. */
export function isVideoEditorPreviewEnabled(): boolean {
  return isStudioPreviewHost();
}
