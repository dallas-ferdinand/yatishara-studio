/** Virtual Create-post draft in Files. */

export const POST_FILE_EXT = ".post";

export type PostDraftBody = {
  v: 1;
  caption: string;
  assetIds: string[];
  voiceAssetId?: string;
  voiceDurationSec?: number;
  publishedPostId?: string;
  postKind?: "post" | "help_request" | "help_answer";
  answerToPostId?: string;
  previewStartMs?: number;
  previewEndMs?: number;
  recordingDurationMs?: number;
};

export function stripPostExt(name: string): string {
  return String(name ?? "").replace(/\.post$/i, "");
}

export function withPostExt(name: string): string {
  const bare = stripPostExt(name).trim() || "Untitled post";
  return `${bare}${POST_FILE_EXT}`;
}

export function isPostDocument(doc: { kind?: string; ext?: string; documentKind?: string } | null | undefined): boolean {
  if (!doc) return false;
  return doc.kind === "post" || doc.documentKind === "post" || doc.ext === POST_FILE_EXT;
}

export function emptyPostDraftBody(): PostDraftBody {
  return { v: 1, caption: "", assetIds: [] };
}

export function serializePostDraft(partial: Partial<PostDraftBody> & { assetIds?: string[] }): string {
  const body: PostDraftBody = {
    v: 1,
    caption: String(partial.caption ?? ""),
    assetIds: (partial.assetIds ?? []).filter(Boolean).slice(0, 6),
  };
  if (partial.voiceAssetId) body.voiceAssetId = partial.voiceAssetId;
  if (partial.voiceDurationSec != null && Number.isFinite(partial.voiceDurationSec)) {
    body.voiceDurationSec = partial.voiceDurationSec;
  }
  if (partial.publishedPostId) body.publishedPostId = partial.publishedPostId;
  if (partial.postKind) body.postKind = partial.postKind;
  if (partial.answerToPostId) body.answerToPostId = partial.answerToPostId;
  if (partial.previewStartMs != null) body.previewStartMs = partial.previewStartMs;
  if (partial.previewEndMs != null) body.previewEndMs = partial.previewEndMs;
  if (partial.recordingDurationMs != null) {
    body.recordingDurationMs = partial.recordingDurationMs;
  }
  return JSON.stringify(body);
}

export function parsePostDraft(raw: string | null | undefined): PostDraftBody {
  const empty = emptyPostDraftBody();
  if (!raw || typeof raw !== "string") return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<PostDraftBody>;
    if (!parsed || typeof parsed !== "object") return empty;
    const assetIds = Array.isArray(parsed.assetIds)
      ? parsed.assetIds.map((id) => String(id)).filter(Boolean).slice(0, 6)
      : [];
    return {
      v: 1,
      caption: typeof parsed.caption === "string" ? parsed.caption : "",
      assetIds,
      ...(typeof parsed.voiceAssetId === "string" && parsed.voiceAssetId
        ? { voiceAssetId: parsed.voiceAssetId }
        : {}),
      ...(typeof parsed.voiceDurationSec === "number" && Number.isFinite(parsed.voiceDurationSec)
        ? { voiceDurationSec: parsed.voiceDurationSec }
        : {}),
      ...(typeof parsed.publishedPostId === "string" && parsed.publishedPostId
        ? { publishedPostId: parsed.publishedPostId }
        : {}),
      ...(parsed.postKind === "help_request" || parsed.postKind === "help_answer"
        ? { postKind: parsed.postKind }
        : {}),
      ...(typeof parsed.answerToPostId === "string" && parsed.answerToPostId
        ? { answerToPostId: parsed.answerToPostId }
        : {}),
      ...(typeof parsed.previewStartMs === "number" && Number.isFinite(parsed.previewStartMs)
        ? { previewStartMs: parsed.previewStartMs }
        : {}),
      ...(typeof parsed.previewEndMs === "number" && Number.isFinite(parsed.previewEndMs)
        ? { previewEndMs: parsed.previewEndMs }
        : {}),
      ...(typeof parsed.recordingDurationMs === "number" &&
      Number.isFinite(parsed.recordingDurationMs)
        ? { recordingDurationMs: parsed.recordingDurationMs }
        : {}),
    };
  } catch {
    return empty;
  }
}

export function titleFromPostCaption(caption: string): string | null {
  const line = caption
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return line || null;
}
