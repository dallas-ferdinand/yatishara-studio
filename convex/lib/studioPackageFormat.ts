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
