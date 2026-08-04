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
