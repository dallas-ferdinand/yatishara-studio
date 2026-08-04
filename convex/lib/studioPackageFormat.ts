/**
 * Portable `.studio` package format helpers (open zip transport, no encryption).
 * Shared by Convex package/download builders and client import remap.
 */

export const STUDIO_PACKAGE_FORMAT = "yatishara.studio";
export const STUDIO_PACKAGE_FORMAT_VERSION = 1;
export const PKG_ASSET_PREFIX = "pkg:";

export type StudioPackageMediaKind = "image" | "video" | "audio" | "document";

export type StudioPackageMediaEntry = {
  key: string;
  path: string;
  originalName: string;
  mime: string;
  kind: StudioPackageMediaKind;
};

export type StudioPackageManifest = {
  format: typeof STUDIO_PACKAGE_FORMAT;
  formatVersion: number;
  kind: "videoEdit";
  name: string;
  exportedAt: string;
  icon?: string;
  media: StudioPackageMediaEntry[];
  missing?: Array<{ assetId: string; reason: string }>;
};

/**
 * Package icon.svg — composited clapperboard with real yatishara-logo-dark on
 * light-mode platform grey slate (#ececf0); square bottom corners.
 */
export const STUDIO_PACKAGE_ICON_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- CapCut PNG silhouette + logo subtract (geometry unchanged) -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128" width="128" height="128">
  <image width="128" height="128" href="data:image/png;base64,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" xlink:href="data:image/png;base64,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"/>
</svg>
`;

export type StudioPackageProjectLike = {
  name?: string;
  folderId?: string;
  sourceAssetId?: string;
  duration?: number;
  frameRatio?: string;
  tracks?: unknown[];
  clips?: Array<{ assetId?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export function packageAssetRef(key: string): string {
  return `${PKG_ASSET_PREFIX}${key}`;
}

export function parsePackageAssetRef(assetId: string | undefined | null): string | null {
  if (!assetId || typeof assetId !== "string") return null;
  if (!assetId.startsWith(PKG_ASSET_PREFIX)) return null;
  const key = assetId.slice(PKG_ASSET_PREFIX.length).trim();
  return key || null;
}

export function isStudioPackageManifest(value: unknown): value is StudioPackageManifest {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.format === STUDIO_PACKAGE_FORMAT &&
    row.kind === "videoEdit" &&
    typeof row.formatVersion === "number" &&
    Array.isArray(row.media)
  );
}

export function collectClipAssetIds(project: StudioPackageProjectLike): string[] {
  const ids = new Set<string>();
  for (const clip of project.clips ?? []) {
    if (typeof clip?.assetId === "string" && clip.assetId.trim()) {
      ids.add(clip.assetId.trim());
    }
  }
  if (typeof project.sourceAssetId === "string" && project.sourceAssetId.trim()) {
    ids.add(project.sourceAssetId.trim());
  }
  return [...ids];
}

export function mediaExtForAsset(args: {
  name?: string;
  kind: StudioPackageMediaKind;
  mimeType?: string;
}): string {
  const base = String(args.name ?? "");
  const dot = base.lastIndexOf(".");
  if (dot > 0) {
    const ext = base.slice(dot).toLowerCase();
    if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  }
  const mime = String(args.mimeType ?? "").toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("quicktime")) return ".mov";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") && args.kind === "audio") return ".mp3";
  if (mime.includes("mp4") || mime.includes("mpeg4")) {
    return args.kind === "audio" ? ".m4a" : ".mp4";
  }
  if (mime.includes("aac") || mime.includes("m4a")) return ".m4a";
  if (args.kind === "image") return ".png";
  if (args.kind === "audio") return ".m4a";
  if (args.kind === "video") return ".mp4";
  return ".bin";
}

/** Stable short key from Convex asset id (opaque, not a secret). */
export function packageKeyForAssetId(assetId: string, index: number): string {
  const clean = String(assetId).replace(/[^a-zA-Z0-9]/g, "");
  const tail = clean.slice(-10) || `n${index}`;
  return `m${index}_${tail}`;
}

export function rewriteProjectToPackageRefs(
  project: StudioPackageProjectLike,
  idToKey: Map<string, string>,
): StudioPackageProjectLike {
  const clips = (project.clips ?? []).map((clip) => {
    if (typeof clip.assetId !== "string" || !clip.assetId.trim()) return { ...clip };
    const key = idToKey.get(clip.assetId.trim());
    if (!key) {
      const next = { ...clip };
      delete next.assetId;
      return next;
    }
    return { ...clip, assetId: packageAssetRef(key) };
  });
  const next: StudioPackageProjectLike = {
    ...project,
    clips,
    formatVersion: STUDIO_PACKAGE_FORMAT_VERSION,
  };
  if (typeof project.sourceAssetId === "string" && project.sourceAssetId.trim()) {
    const key = idToKey.get(project.sourceAssetId.trim());
    if (key) next.sourceAssetId = packageAssetRef(key);
    else delete next.sourceAssetId;
  }
  // folderId is environment-local; drop on export
  delete next.folderId;
  return next;
}

export function remapPackageRefsToAssetIds(
  project: StudioPackageProjectLike,
  keyToAssetId: Map<string, string>,
): { project: StudioPackageProjectLike; unresolvedClips: number } {
  let unresolvedClips = 0;
  const clips = (project.clips ?? []).map((clip) => {
    if (typeof clip.assetId !== "string" || !clip.assetId.trim()) return { ...clip };
    const key = parsePackageAssetRef(clip.assetId);
    if (!key) {
      // Already a real id, or unknown — drop so import does not point at foreign Convex ids
      unresolvedClips += 1;
      const next = { ...clip };
      delete next.assetId;
      return next;
    }
    const assetId = keyToAssetId.get(key);
    if (!assetId) {
      unresolvedClips += 1;
      const next = { ...clip };
      delete next.assetId;
      return next;
    }
    return { ...clip, assetId };
  });
  const next: StudioPackageProjectLike = { ...project, clips };
  if (typeof project.sourceAssetId === "string") {
    const key = parsePackageAssetRef(project.sourceAssetId);
    if (key && keyToAssetId.has(key)) {
      next.sourceAssetId = keyToAssetId.get(key);
    } else {
      delete next.sourceAssetId;
    }
  }
  return { project: next, unresolvedClips };
}

export function safePackageSegment(value: string, fallback: string): string {
  const clean = value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

export function packageDirName(projectName: string): string {
  const bare = safePackageSegment(
    String(projectName ?? "").replace(/\.(studio|edit)(\.json)?$/i, ""),
    "Video edit",
  );
  return `${bare}.studio`;
}
