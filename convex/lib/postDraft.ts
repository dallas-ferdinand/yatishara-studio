import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  assetThumbnailPath,
  LQIP_TRANSFORM,
  THUMB_TRANSFORM,
  signBunnyCdnUrl,
} from "./bunny";

const POST_PREVIEW_CAP = 4;
const FOLDER_POST_SIGN_CAP = 32;

export type PostPreviewItem = {
  kind: "image" | "video" | "audio";
  thumbnailUrl?: string;
  thumbnailLqipUrl?: string;
};

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

/** Media ids stored on a .post document body (JSON in contentMarkdown). */
export function parsePostDraftMediaIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { assetIds?: unknown };
    return asIdList(parsed?.assetIds).slice(0, 6);
  } catch {
    return [];
  }
}

export function parsePostDraftVoiceAssetId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { voiceAssetId?: unknown };
    return typeof parsed?.voiceAssetId === "string" && parsed.voiceAssetId
      ? parsed.voiceAssetId
      : undefined;
  } catch {
    return undefined;
  }
}

export function postDraftPreviewAssetIds(raw: string | undefined): string[] {
  const media = parsePostDraftMediaIds(raw).slice(0, POST_PREVIEW_CAP);
  if (media.length > 0) return media;
  const voiceId = parsePostDraftVoiceAssetId(raw);
  return voiceId ? [voiceId] : [];
}

function previewKind(asset: Doc<"assets">): "image" | "video" | "audio" {
  if (asset.kind === "video") return "video";
  if (asset.kind === "audio") return "audio";
  return "image";
}

/** Signed thumbs for every .post in a folder list (unique assets, capped). */
export async function previewItemsByPostId(
  ctx: QueryCtx,
  docs: Doc<"documents">[],
  expiresUnix: number | undefined,
): Promise<Map<string, PostPreviewItem[]>> {
  const out = new Map<string, PostPreviewItem[]>();
  const idsByDoc = new Map<string, string[]>();
  const uniqueIds: Id<"assets">[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    if (doc.kind !== "post") continue;
    const rawIds = postDraftPreviewAssetIds(doc.contentMarkdown);
    const normalized: string[] = [];
    for (const raw of rawIds) {
      const id = ctx.db.normalizeId("assets", raw);
      if (!id) continue;
      normalized.push(id);
      if (seen.has(id) || uniqueIds.length >= FOLDER_POST_SIGN_CAP) continue;
      seen.add(id);
      uniqueIds.push(id);
    }
    if (normalized.length) idsByDoc.set(doc._id, normalized);
  }

  if (idsByDoc.size === 0) return out;

  const assets = new Map<string, Doc<"assets">>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      const asset = await ctx.db.get("assets", id);
      if (asset && !asset.deletedAt) assets.set(id, asset);
    }),
  );

  const signed = new Map<string, { thumbnailUrl?: string; thumbnailLqipUrl?: string }>();
  if (expiresUnix !== undefined) {
    await Promise.all(
      uniqueIds.map(async (id) => {
        const asset = assets.get(id);
        if (!asset) return;
        const path = assetThumbnailPath(asset);
        if (!path) {
          signed.set(id, {});
          return;
        }
        const [thumbnailUrl, thumbnailLqipUrl] = await Promise.all([
          signBunnyCdnUrl(path, expiresUnix, THUMB_TRANSFORM),
          signBunnyCdnUrl(path, expiresUnix, LQIP_TRANSFORM),
        ]);
        signed.set(id, { thumbnailUrl, thumbnailLqipUrl });
      }),
    );
  }

  for (const [docId, ids] of idsByDoc) {
    const items: PostPreviewItem[] = [];
    for (const id of ids) {
      const asset = assets.get(id);
      if (!asset) continue;
      const urls = signed.get(id) ?? {};
      items.push({
        kind: previewKind(asset),
        ...urls,
      });
    }
    if (items.length) out.set(docId, items);
  }

  return out;
}
