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
