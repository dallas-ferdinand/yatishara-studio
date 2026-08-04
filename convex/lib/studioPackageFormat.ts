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
 * Cut-scene clapperboard with Yatishara brand mark on the slate (transparent canvas).
 * On-disk filetype uses composited PNG from public/branding/studio-project-icon.png
 * (real yatishara-logo-dark pasted onto the slate — never an AI redraw).
 */
/**
 * Package icon.svg — embeds the composited clapperboard PNG that pastes the real
 * `yatishara-logo-dark` mark onto the slate (no AI redraw). Transparent outside.
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
