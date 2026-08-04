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
