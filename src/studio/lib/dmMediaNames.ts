/** Human-readable Studio asset titles for DM media in the Messages folder. */

const GENERIC_PHOTO =
  /^(image|photo|img|picture|screenshot|capture|pending|blob|untitled|download)(\s|[-_.]|$)/i;

function cleanPeerLabel(peerLabel: string): string {
  const trimmed = peerLabel.replace(/^@/, "").replace(/[/\\?%*:|"<>]/g, "").trim();
  return trimmed || "Chat";
}

function formatDmStamp(at: Date): string {
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(durationSec: number): string {
  const total = Math.max(1, Math.round(durationSec));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function extFromMime(
  mimeType: string,
  kind: "image" | "audio",
  fallbackName = "",
): string {
  const mime = (mimeType || "").toLowerCase();
  if (kind === "audio") {
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
      return "m4a";
    }
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("wav")) return "wav";
    return "webm";
  }
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  const fromName = fallbackName.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return (fromName || "jpg").toLowerCase();
}

function isGenericPhotoName(name: string): boolean {
  const base = name.trim();
  if (!base) return true;
  const withoutExt = base.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!withoutExt || GENERIC_PHOTO.test(withoutExt)) return true;
  if (/^(image|photo|img|picture)[-_]?\d{6,}$/i.test(withoutExt)) return true;
  if (/^dm-photo-/i.test(withoutExt)) return true;
  return false;
}

/** Voice note title shown in the Messages folder. */
export function dmVoiceAssetName(args: {
  peerLabel: string;
  durationSec: number;
  mimeType?: string;
  at?: Date;
}): string {
  const peer = cleanPeerLabel(args.peerLabel);
  const stamp = formatDmStamp(args.at ?? new Date());
  const dur = formatDuration(args.durationSec);
  const ext = extFromMime(args.mimeType || "audio/webm", "audio");
  return `Voice note · ${peer} · ${stamp} (${dur}).${ext}`;
}

/**
 * Photo title: keep a meaningful camera/library filename; otherwise
 * “Photo · {peer} · {stamp}”.
 */
export function dmPhotoAssetName(args: {
  peerLabel: string;
  fileName?: string;
  mimeType?: string;
  at?: Date;
}): string {
  const original = (args.fileName || "").trim();
  if (original && !isGenericPhotoName(original)) {
    return original;
  }
  const peer = cleanPeerLabel(args.peerLabel);
  const stamp = formatDmStamp(args.at ?? new Date());
  const ext = extFromMime(args.mimeType || "image/jpeg", "image", original);
  return `Photo · ${peer} · ${stamp}.${ext}`;
}
