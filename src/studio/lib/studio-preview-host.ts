export function normalizeStudioHostname(hostname?: string | null): string {
  const raw = String(hostname || "").split(",")[0]?.trim() ?? "";
  const host = raw.split(":")[0]?.toLowerCase() ?? "";
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Preview / local hosts where unfinished Studio features may ship. */
export function isStudioPreviewHost(hostname?: string | null): boolean {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  const normalized = normalizeStudioHostname(host);
  return (
    normalized.includes("preview.") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

/** Public production host only — not preview, local, or internal container names. */
export function isStudioLiveProductionHost(hostname?: string | null): boolean {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return normalizeStudioHostname(host) === "studio.yatishara.com";
}

/**
 * Video editor UI + .studio projects.
 * Enabled in production and preview — keep the helper so call sites stay explicit.
 */
export function isVideoEditorPreviewEnabled(): boolean {
  return true;
}
