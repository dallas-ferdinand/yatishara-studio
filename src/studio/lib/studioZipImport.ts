import { unzip } from "fflate";

const SKIP_NAME =
  /(?:^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/i;
const MAX_FILES = 500;
/** Nested A.zip → B.zip → … depth cap against zip bombs. */
const MAX_NESTED_ZIP_DEPTH = 8;

function folderNameFromZip(fileName: string): string {
  const base = fileName.replace(/\.zip$/i, "").trim();
  return base || "Imported folder";
}

function sanitizeSegment(segment: string): string {
  return segment
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/^\.+/, "")
    .trim();
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
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "json") return "application/json";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

/** Safe zip entry path parts, or null if junk / traversal. */
function zipPathParts(raw: string): string[] | null {
  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.endsWith("/")) return null;
  if (SKIP_NAME.test(cleaned)) return null;
  const parts = cleaned
    .split("/")
    .map((part) => sanitizeSegment(part))
    .filter(Boolean);
  if (!parts.length || parts.some((part) => part === ".." || part === ".")) {
    return null;
  }
  return parts;
}

function joinRelative(prefix: string, path: string): string {
  if (!prefix) return path;
  if (!path) return prefix;
  return `${prefix}/${path}`;
}

function unzipBytes(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export type ExtractedZipEntry = {
  /** Path relative to the imported root folder (may include nested dirs). */
  relativePath: string;
  file: File;
};

export type ExtractedZipImport = {
  folderName: string;
  entries: ExtractedZipEntry[];
  truncated: boolean;
  skipped: number;
};

type UnpackState = {
  entries: ExtractedZipEntry[];
  skipped: number;
  truncated: boolean;
};

/**
 * Unpack zip bytes into `state.entries`, placing nested archives as folders
 * named after the zip (A.zip containing B.zip → A/… and A/B/…).
 */
async function unpackZipTree(
  bytes: Uint8Array,
  pathPrefix: string,
  depth: number,
  state: UnpackState,
): Promise<void> {
  if (state.truncated) return;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await unzipBytes(bytes);
  } catch {
    state.skipped += 1;
    return;
  }

  const keys = Object.keys(unzipped).sort();
  for (const key of keys) {
    if (state.truncated || state.entries.length >= MAX_FILES) {
      state.truncated = true;
      return;
    }
    const parts = zipPathParts(key);
    if (!parts) {
      state.skipped += 1;
      continue;
    }
    const data = unzipped[key];
    if (!data || data.byteLength === 0) {
      state.skipped += 1;
      continue;
    }

    const leaf = parts[parts.length - 1] ?? "file";
    const parentParts = parts.slice(0, -1);
    const parentRel = parentParts.join("/");
    const underPrefix = joinRelative(pathPrefix, parentRel);

    if (/\.zip$/i.test(leaf)) {
      if (depth >= MAX_NESTED_ZIP_DEPTH) {
        state.skipped += 1;
        continue;
      }
      const nestedFolder = folderNameFromZip(leaf);
      await unpackZipTree(
        data,
        joinRelative(underPrefix, nestedFolder),
        depth + 1,
        state,
      );
      continue;
    }

    const relativePath = joinRelative(underPrefix, leaf);
    const copy = new Uint8Array(data);
    state.entries.push({
      relativePath,
      file: new File([copy], leaf, { type: mimeFromName(leaf) }),
    });
  }
}

/** Unpack a dropped/uploaded ZIP into uploadable Studio files. Never returns the archive itself. */
export async function extractStudioZipImport(file: File): Promise<ExtractedZipImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const state: UnpackState = { entries: [], skipped: 0, truncated: false };
  await unpackZipTree(bytes, "", 0, state);

  return {
    folderName: folderNameFromZip(file.name || "archive.zip"),
    entries: state.entries,
    truncated: state.truncated,
    skipped: state.skipped,
  };
}

export function isZipFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".zip") ||
    type === "application/zip" ||
    type === "application/x-zip-compressed"
  );
}
