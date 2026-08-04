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
