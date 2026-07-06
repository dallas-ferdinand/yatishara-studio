import {
  EXPLORER_DND_TYPE,
  inferMediaKind,
  peekActiveExplorerDrag,
  readExplorerDragData,
} from "@/desk/lib/explorer-dnd";

export const DEFAULT_VIDEO_CLIP_SEC = 4;
export const DEFAULT_AUDIO_CLIP_SEC = 4;
export const DEFAULT_IMAGE_CLIP_SEC = 3;

export function defaultClipDuration(mediaKind) {
  if (mediaKind === "audio") return DEFAULT_AUDIO_CLIP_SEC;
  if (mediaKind === "image") return DEFAULT_IMAGE_CLIP_SEC;
  return DEFAULT_VIDEO_CLIP_SEC;
}

export function trackAcceptsMediaKind(trackKind, mediaKind) {
  if (trackKind === "audio") return mediaKind === "audio";
  if (trackKind === "text") return false;
  return mediaKind === "video" || mediaKind === "image";
}

export function clipKindForTrack(trackKind, mediaKind) {
  if (trackKind === "audio") return "audio";
  if (trackKind === "text") return "text";
  return "video";
}

export function isTimelineDropDrag(event) {
  const types = [...(event.dataTransfer?.types ?? [])];
  return types.includes(EXPLORER_DND_TYPE) || types.includes("application/x-studio-asset");
}

export function peekTimelineDragPayload() {
  const entry = peekActiveExplorerDrag();
  if (!entry || entry.studioKind !== "asset") return null;
  const mediaKind = inferMediaKind(entry);
  if (!mediaKind) return null;
  return {
    assetId: entry.studioId,
    mediaKind,
    name: entry.name,
    thumbnailUrl: entry.thumbnailUrl ?? entry.mediaUrl,
    duration: defaultClipDuration(mediaKind),
  };
}

export function readTimelineDropPayload(event) {
  const raw = event.dataTransfer?.getData("application/x-studio-asset");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const mediaKind = parsed.kind ?? inferMediaKind(parsed);
      if (!mediaKind) return null;
      return {
        assetId: parsed.assetId,
        mediaKind,
        name: parsed.name,
        thumbnailUrl: parsed.thumbnailUrl,
        duration: parsed.duration && parsed.duration > 0 ? parsed.duration : defaultClipDuration(mediaKind),
      };
    } catch {
      return null;
    }
  }

  const entry = readExplorerDragData(event.dataTransfer);
  if (!entry || entry.studioKind !== "asset") return null;
  const mediaKind = inferMediaKind(entry);
  if (!mediaKind) return null;

  return {
    assetId: entry.studioId,
    mediaKind,
    name: entry.name,
    thumbnailUrl: entry.thumbnailUrl ?? entry.mediaUrl,
    duration: defaultClipDuration(mediaKind),
  };
}
