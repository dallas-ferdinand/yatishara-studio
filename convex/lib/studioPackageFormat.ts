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
