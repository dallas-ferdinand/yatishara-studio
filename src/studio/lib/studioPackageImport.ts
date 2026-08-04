import { unzip } from "fflate";
import {
  STUDIO_PACKAGE_FORMAT,
  isStudioPackageManifest,
  remapPackageRefsToAssetIds,
  type StudioPackageManifest,
  type StudioPackageMediaKind,
  type StudioPackageProjectLike,
} from "../../../convex/lib/studioPackageFormat";
import type { ExtractedZipEntry } from "./studioZipImport";

export type ParsedStudioPackage = {
  /** Relative root inside a zip ("" for flat packages). */
  root: string;
  manifest: StudioPackageManifest;
  project: StudioPackageProjectLike;
  mediaFiles: Map<string, File>;
};

function unzipBytes(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"].includes(ext)) {
    return ext === "jpg" ? "image/jpeg" : `image/${ext === "jpeg" ? "jpeg" : ext}`;
  }
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) {
    if (ext === "mov") return "video/quicktime";
    return `video/${ext}`;
  }
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) {
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "m4a") return "audio/mp4";
    return `audio/${ext}`;
  }
  if (ext === "json") return "application/json";
  return "application/octet-stream";
}

export function isStudioPackageFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".studio");
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function joinRoot(root: string, rel: string): string {
  if (!root) return rel;
  if (!rel) return root;
  return `${root}/${rel}`;
}

function entriesFromUnzipped(
  unzipped: Record<string, Uint8Array>,
): ExtractedZipEntry[] {
  const entries: ExtractedZipEntry[] = [];
  for (const key of Object.keys(unzipped).sort()) {
    const cleaned = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleaned || cleaned.endsWith("/")) continue;
    if (/(?:^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/i.test(cleaned)) continue;
    const data = unzipped[key];
    if (!data || data.byteLength === 0) continue;
    const leaf = cleaned.split("/").pop() || "file";
    const copy = new Uint8Array(data);
    entries.push({
      relativePath: cleaned,
      file: new File([copy], leaf, { type: mimeFromName(leaf) }),
    });
  }
  return entries;
}

export async function extractStudioPackageFile(file: File): Promise<ParsedStudioPackage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = await unzipBytes(bytes);
  const entries = entriesFromUnzipped(unzipped);
  const packages = await parseStudioPackagesFromEntries(entries);
  if (!packages.length) {
    throw new Error("That .studio file is not a valid Studio project package");
  }
  return packages[0]!;
}

export async function parseStudioPackagesFromEntries(
  entries: ExtractedZipEntry[],
): Promise<ParsedStudioPackage[]> {
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const packages: ParsedStudioPackage[] = [];

  for (const entry of entries) {
    const base = entry.relativePath.split("/").pop() ?? "";
    if (base.toLowerCase() !== "manifest.json") continue;
    let manifest: StudioPackageManifest;
    try {
      const parsed = JSON.parse(await entry.file.text());
      if (!isStudioPackageManifest(parsed)) continue;
      manifest = parsed;
    } catch {
      continue;
    }
    const root = dirname(entry.relativePath);
    const projectPath = joinRoot(root, "project.json");
    const projectEntry = byPath.get(projectPath);
    if (!projectEntry) continue;
    let project: StudioPackageProjectLike;
    try {
      project = JSON.parse(await projectEntry.file.text()) as StudioPackageProjectLike;
    } catch {
      continue;
    }
    if (!Array.isArray(project.tracks) || !Array.isArray(project.clips)) continue;

    const mediaFiles = new Map<string, File>();
    for (const media of manifest.media) {
      const mediaPath = joinRoot(root, media.path);
      const mediaEntry = byPath.get(mediaPath);
      if (mediaEntry) mediaFiles.set(media.key, mediaEntry.file);
    }

    packages.push({ root, manifest, project, mediaFiles });
  }

  return packages;
}

/** Split zip entries into studio packages vs remaining loose files. */
export async function partitionStudioPackageEntries(entries: ExtractedZipEntry[]): Promise<{
  packages: ParsedStudioPackage[];
  loose: ExtractedZipEntry[];
}> {
  const packages = await parseStudioPackagesFromEntries(entries);
  const claimed = new Set<string>();
  for (const pkg of packages) {
    for (const entry of entries) {
      if (!pkg.root) {
        if (
          entry.relativePath === "manifest.json" ||
          entry.relativePath === "project.json" ||
          entry.relativePath.startsWith("media/")
        ) {
          claimed.add(entry.relativePath);
        }
      } else if (
        entry.relativePath === pkg.root ||
        entry.relativePath.startsWith(`${pkg.root}/`)
      ) {
        claimed.add(entry.relativePath);
      }
    }
  }
  return {
    packages,
    loose: entries.filter((entry) => !claimed.has(entry.relativePath)),
  };
}

export function mediaKindFromPackage(
  kind: StudioPackageMediaKind | string | undefined,
  file: File,
): "image" | "video" | "audio" | "document" {
  if (kind === "image" || kind === "video" || kind === "audio" || kind === "document") {
    return kind;
  }
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function remapImportedStudioProject(
  project: StudioPackageProjectLike,
  keyToAssetId: Map<string, string>,
  folderId: string,
  name: string,
): { project: StudioPackageProjectLike; unresolvedClips: number } {
  const remapped = remapPackageRefsToAssetIds(project, keyToAssetId);
  return {
    project: {
      ...remapped.project,
      name,
      folderId,
    },
    unresolvedClips: remapped.unresolvedClips,
  };
}

export { STUDIO_PACKAGE_FORMAT };
