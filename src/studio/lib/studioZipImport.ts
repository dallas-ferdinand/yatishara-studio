import { unzip } from "fflate";

const SKIP_NAME =
  /(?:^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/i;
const MAX_FILES = 500;

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

function normalizeZipPath(raw: string): string | null {
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
  // Nested archives stay transport-only — skip storing .zip blobs.
  const leaf = parts[parts.length - 1] ?? "";
  if (/\.zip$/i.test(leaf)) return null;
  return parts.join("/");
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

/** Unpack a dropped/uploaded ZIP into uploadable Studio files. Never returns the archive itself. */
export async function extractStudioZipImport(file: File): Promise<ExtractedZipImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

  const entries: ExtractedZipEntry[] = [];
  let skipped = 0;
  let truncated = false;

  const keys = Object.keys(unzipped).sort();
  for (const key of keys) {
    const path = normalizeZipPath(key);
    if (!path) {
      skipped += 1;
      continue;
    }
    if (entries.length >= MAX_FILES) {
      truncated = true;
      break;
    }
    const data = unzipped[key];
    if (!data || data.byteLength === 0) {
      skipped += 1;
      continue;
    }
    const name = path.split("/").pop() || "file";
    const mime = mimeFromName(name);
    const copy = new Uint8Array(data);
    entries.push({
      relativePath: path,
      file: new File([copy], name, { type: mime }),
    });
  }

  return {
    folderName: folderNameFromZip(file.name || "archive.zip"),
    entries,
    truncated,
    skipped,
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
