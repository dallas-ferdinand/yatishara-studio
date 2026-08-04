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
