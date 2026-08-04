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
<!-- CapCut PNG silhouette + logo subtract -->
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
