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
