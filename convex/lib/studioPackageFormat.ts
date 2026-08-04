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
