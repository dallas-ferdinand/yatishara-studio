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
