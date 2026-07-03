import { v } from "convex/values";

export const referenceInputValidator = v.object({
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  url: v.string(),
  mimeType: v.optional(v.string()),
});

export type ReferenceInput = {
  kind: "image" | "video" | "audio";
  url: string;
  mimeType?: string;
};

/** MIME types supported by Gemini 2.5 Flash-Lite audio input. */
export function normalizeAudioMimeType(mimeType?: string): string {
  const mime = (mimeType ?? "audio/mpeg").split(";")[0]?.trim().toLowerCase() ?? "audio/mpeg";
  if (mime === "audio/x-wav") return "audio/wav";
  if (mime === "audio/x-aac" || mime === "audio/aac") return "audio/aac";
  if (
    mime === "audio/mp3" ||
    mime === "audio/mpeg" ||
    mime === "audio/mpga" ||
    mime === "audio/wav" ||
    mime === "audio/webm" ||
    mime === "audio/ogg" ||
    mime === "audio/flac" ||
    mime === "audio/m4a" ||
    mime === "audio/mp4" ||
    mime === "audio/pcm" ||
    mime === "audio/aac"
  ) {
    return mime;
  }
  return "audio/mpeg";
}
